use std::sync::Arc;
use std::time::{Instant, SystemTime};

use ractor::{Actor, ActorCell, ActorProcessingErr, ActorRef, RpcReplyPort, SupervisionEvent};
use tracing::Instrument;

use crate::actors::session::lifecycle::{
    clear_sentry_session_context, configure_sentry_session_context, emit_session_ended,
};
use crate::actors::{
    SessionContext, SessionMsg, SessionParams, session_span, spawn_session_supervisor,
};
use crate::{ListenerRuntime, SessionLifecycleEvent, State};

pub enum RootMsg {
    StartSession(SessionParams, RpcReplyPort<bool>),
    StopSession(RpcReplyPort<()>),
    GetState(RpcReplyPort<State>),
}

pub struct RootArgs {
    pub runtime: Arc<dyn ListenerRuntime>,
}

pub struct RootState {
    runtime: Arc<dyn ListenerRuntime>,
    session_id: Option<String>,
    supervisor: Option<ActorCell>,
    finalizing: bool,
}

pub struct RootActor;

impl RootActor {
    pub fn name() -> ractor::ActorName {
        "listener_root_actor".into()
    }
}

#[ractor::async_trait]
impl Actor for RootActor {
    type Msg = RootMsg;
    type State = RootState;
    type Arguments = RootArgs;

    async fn pre_start(
        &self,
        _myself: ActorRef<Self::Msg>,
        args: Self::Arguments,
    ) -> Result<Self::State, ActorProcessingErr> {
        Ok(RootState {
            runtime: args.runtime,
            session_id: None,
            supervisor: None,
            finalizing: false,
        })
    }

    async fn handle(
        &self,
        myself: ActorRef<Self::Msg>,
        message: Self::Msg,
        state: &mut Self::State,
    ) -> Result<(), ActorProcessingErr> {
        match message {
            RootMsg::StartSession(params, reply) => {
                let success = start_session_impl(myself.get_cell(), params, state).await;
                let _ = reply.send(success);
            }
            RootMsg::StopSession(reply) => {
                stop_session_impl(state).await;
                let _ = reply.send(());
            }
            RootMsg::GetState(reply) => {
                let fsm_state = if state.finalizing {
                    State::Finalizing
                } else if state.supervisor.is_some() {
                    State::Active
                } else {
                    State::Inactive
                };
                let _ = reply.send(fsm_state);
            }
        }
        Ok(())
    }

    async fn handle_supervisor_evt(
        &self,
        _myself: ActorRef<Self::Msg>,
        message: SupervisionEvent,
        state: &mut Self::State,
    ) -> Result<(), ActorProcessingErr> {
        match message {
            SupervisionEvent::ActorStarted(_) | SupervisionEvent::ProcessGroupChanged(_) => {}
            SupervisionEvent::ActorTerminated(cell, _, reason) => {
                if let Some(supervisor) = &state.supervisor
                    && cell.get_id() == supervisor.get_id()
                {
                    let session_id = state.session_id.take().unwrap_or_default();
                    let span = session_span(&session_id);
                    let _guard = span.enter();
                    tracing::info!(?reason, "session_supervisor_terminated");
                    state.supervisor = None;
                    state.finalizing = false;

                    emit_session_ended(&*state.runtime, &session_id, reason);
                }
            }
            SupervisionEvent::ActorFailed(cell, error) => {
                if let Some(supervisor) = &state.supervisor
                    && cell.get_id() == supervisor.get_id()
                {
                    let session_id = state.session_id.take().unwrap_or_default();
                    let span = session_span(&session_id);
                    let _guard = span.enter();
                    tracing::warn!(?error, "session_supervisor_failed");
                    state.supervisor = None;
                    state.finalizing = false;
                    emit_session_ended(&*state.runtime, &session_id, Some(format!("{:?}", error)));
                }
            }
        }
        Ok(())
    }
}

async fn start_session_impl(
    root_cell: ActorCell,
    params: SessionParams,
    state: &mut RootState,
) -> bool {
    let session_id = params.session_id.clone();
    let span = session_span(&session_id);

    async {
        if state.supervisor.is_some() {
            tracing::warn!("session_already_running");
            return false;
        }

        configure_sentry_session_context(&params);

        let app_dir = match state.runtime.vault_base() {
            Ok(base) => base.join("workspaces"),
            Err(e) => {
                tracing::error!(error = %e, "failed_to_resolve_workspaces_dir");
                clear_sentry_session_context();
                return false;
            }
        };

        let sherpa_config = if params.base_url.starts_with("sherpa://") {
            build_sherpa_config(&params, &*state.runtime)
        } else {
            None
        };

        let ctx = SessionContext {
            runtime: state.runtime.clone(),
            params: params.clone(),
            app_dir,
            started_at_instant: Instant::now(),
            started_at_system: SystemTime::now(),
            sherpa_config,
        };

        match spawn_session_supervisor(ctx).await {
            Ok((supervisor_cell, _handle)) => {
                supervisor_cell.link(root_cell);

                state.session_id = Some(params.session_id.clone());
                state.supervisor = Some(supervisor_cell);

                state.runtime.emit_lifecycle(SessionLifecycleEvent::Active {
                    session_id: params.session_id,
                    error: None,
                });

                tracing::info!("session_started");
                true
            }
            Err(e) => {
                tracing::error!(error = ?e, "failed_to_start_session");
                clear_sentry_session_context();
                false
            }
        }
    }
    .instrument(span)
    .await
}

/// Build a [`openmushi_stt_sherpa::SherpaEngineConfig`] from session parameters and the
/// runtime's global model directory.
///
/// The model name in `params.model` is expected to match a sherpa directory name
/// convention (e.g. "sherpa-whisper-small" maps to "sherpa-onnx-whisper-small").
fn build_sherpa_config(
    params: &SessionParams,
    runtime: &dyn ListenerRuntime,
) -> Option<openmushi_stt_sherpa::SherpaEngineConfig> {
    let models_base = runtime.global_base().ok()?;
    let sherpa_base = models_base.join("models").join("sherpa");

    // Map model identifier (e.g. "sherpa-whisper-small") to directory name
    // (e.g. "sherpa-onnx-whisper-small") and file prefixes.
    let (dir_name, prefix) = match params.model.as_str() {
        "sherpa-whisper-tiny" => ("sherpa-onnx-whisper-tiny", "tiny"),
        "sherpa-whisper-base" => ("sherpa-onnx-whisper-base", "base"),
        "sherpa-whisper-small" => ("sherpa-onnx-whisper-small", "small"),
        other => {
            tracing::warn!(model = %other, "unknown sherpa model, cannot build config");
            return None;
        }
    };

    let model_dir = sherpa_base.join(dir_name);

    Some(openmushi_stt_sherpa::SherpaEngineConfig {
        whisper_encoder: model_dir.join(format!("{}-encoder.onnx", prefix)),
        whisper_decoder: model_dir.join(format!("{}-decoder.onnx", prefix)),
        whisper_tokens: model_dir.join(format!("{}-tokens.txt", prefix)),
        whisper_language: "en".to_string(),
        vad_model: sherpa_base.join("silero_vad.onnx"),
        speaker_model: params.speaker_model.as_ref().map(|m| sherpa_base.join(m)),
        speaker_threshold: params.speaker_threshold,
        sample_rate: super::SAMPLE_RATE,
    })
}

async fn stop_session_impl(state: &mut RootState) {
    if let Some(supervisor) = &state.supervisor {
        state.finalizing = true;

        if let Some(session_id) = &state.session_id {
            let span = session_span(session_id);
            let _guard = span.enter();
            tracing::info!("session_finalizing");

            state
                .runtime
                .emit_lifecycle(SessionLifecycleEvent::Finalizing {
                    session_id: session_id.clone(),
                });
        }

        let session_ref: ActorRef<SessionMsg> = supervisor.clone().into();
        if let Err(error) = session_ref.cast(SessionMsg::Shutdown) {
            tracing::warn!(
                ?error,
                "failed_to_cast_session_shutdown_falling_back_to_stop"
            );
            supervisor.stop(Some("session_stop_cast_failed".to_string()));
        }
    }
}
