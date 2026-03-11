use std::collections::VecDeque;
use std::sync::Arc;
use std::time::{Instant, SystemTime};

use ractor::{Actor, ActorCell, ActorProcessingErr, ActorRef, RpcReplyPort, SupervisionEvent};
use tracing::Instrument;

use crate::actors::session::lifecycle::{
    clear_sentry_session_context, configure_sentry_session_context, emit_session_ended,
};
use crate::actors::{
    SessionContext, SessionMsg, SessionParams, find_session_dir, session_span,
    spawn_session_supervisor,
};
use crate::{
    ListenerRuntime, RecordingState, RecordingStatus, SessionLifecycleEvent, SessionRecordingEvent,
    State,
};

pub enum RootMsg {
    StartSession(SessionParams, RpcReplyPort<bool>),
    StopSession(RpcReplyPort<()>),
    GetState(RpcReplyPort<State>),
    GetRecordingStatus(RpcReplyPort<RecordingStatus>),
    ClearStaleRecordingState(RpcReplyPort<()>),
    DrainProcessingQueue,
    TranscriptionFinished {
        session_id: String,
        error: Option<String>,
    },
    SummarizationFinished {
        session_id: String,
        error: Option<String>,
    },
}

#[derive(Debug, Clone)]
// See docs/plans/2026-03-11-stenoai-recording-integration.md for queue/state rationale.
struct ProcessingJob {
    session_id: String,
    enqueued_at: Instant,
}

pub struct RootArgs {
    pub runtime: Arc<dyn ListenerRuntime>,
}

pub struct RootState {
    runtime: Arc<dyn ListenerRuntime>,
    session_id: Option<String>,
    supervisor: Option<ActorCell>,
    finalizing: bool,
    recording_state: RecordingState,
    processing_queue: VecDeque<ProcessingJob>,
    current_job: Option<ProcessingJob>,
    last_error: Option<String>,
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
            recording_state: RecordingState::Idle,
            processing_queue: VecDeque::new(),
            current_job: None,
            last_error: None,
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
            RootMsg::GetRecordingStatus(reply) => {
                let _ = reply.send(RecordingStatus {
                    state: state.recording_state.clone(),
                    queue_depth: state.processing_queue.len(),
                    active_session_id: state.session_id.clone(),
                    current_job_session_id: state.current_job.as_ref().map(|j| j.session_id.clone()),
                    last_error: state.last_error.clone(),
                });
            }
            RootMsg::ClearStaleRecordingState(reply) => {
                clear_stale_recording_state(state);
                let _ = reply.send(());
            }
            RootMsg::DrainProcessingQueue => {
                drain_processing_queue(&myself, state);
            }
            RootMsg::TranscriptionFinished { session_id, error } => {
                if state
                    .current_job
                    .as_ref()
                    .is_none_or(|job| job.session_id != session_id)
                {
                    tracing::warn!(%session_id, "unexpected_transcription_finished_event");
                    return Ok(());
                }

                if let Some(err) = error {
                    emit_recording_diagnostic(
                        state,
                        Some(session_id.clone()),
                        "transcription_finished",
                        None,
                        "transcription stage failed".to_string(),
                        Some(err.clone()),
                    );
                    set_recording_state(
                        state,
                        RecordingState::Failed,
                        Some(format!("transcription_failed: {}", err)),
                        Some(session_id),
                    );
                    state.current_job = None;
                    let _ = myself.cast(RootMsg::DrainProcessingQueue);
                    return Ok(());
                }

                emit_recording_diagnostic(
                    state,
                    Some(session_id.clone()),
                    "transcription_finished",
                    None,
                    "transcription stage completed".to_string(),
                    None,
                );

                set_recording_state(
                    state,
                    RecordingState::QueuedForLlm,
                    None,
                    Some(session_id.clone()),
                );
                set_recording_state(
                    state,
                    RecordingState::Summarizing,
                    None,
                    Some(session_id.clone()),
                );

                let root_ref = myself.clone();
                let runtime = state.runtime.clone();
                let session_id_for_job = session_id.clone();
                tokio::spawn(async move {
                    let result = tokio::task::spawn_blocking(move || runtime.run_llm_job(&session_id_for_job))
                        .await
                        .map_err(|e| format!("llm_task_join_error: {}", e))
                        .and_then(|r| r);
                    let _ = root_ref.cast(RootMsg::SummarizationFinished {
                        session_id,
                        error: result.err(),
                    });
                });
            }
            RootMsg::SummarizationFinished { session_id, error } => {
                if state
                    .current_job
                    .as_ref()
                    .is_none_or(|job| job.session_id != session_id)
                {
                    tracing::warn!(%session_id, "unexpected_summarization_finished_event");
                    return Ok(());
                }

                if let Some(err) = error {
                    emit_recording_diagnostic(
                        state,
                        Some(session_id.clone()),
                        "summarization_finished",
                        None,
                        "summarization stage failed".to_string(),
                        Some(err.clone()),
                    );
                    set_recording_state(
                        state,
                        RecordingState::Failed,
                        Some(format!("summarization_failed: {}", err)),
                        Some(session_id),
                    );
                    state.current_job = None;
                    let _ = myself.cast(RootMsg::DrainProcessingQueue);
                    return Ok(());
                }

                emit_recording_diagnostic(
                    state,
                    Some(session_id.clone()),
                    "summarization_finished",
                    None,
                    "summarization stage completed".to_string(),
                    None,
                );

                set_recording_state(
                    state,
                    RecordingState::Completed,
                    None,
                    Some(session_id),
                );
                state.current_job = None;
                let _ = myself.cast(RootMsg::DrainProcessingQueue);
            }
        }
        Ok(())
    }

    async fn handle_supervisor_evt(
        &self,
        myself: ActorRef<Self::Msg>,
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

                    set_recording_state(
                        state,
                        RecordingState::QueuedForStt,
                        None,
                        Some(session_id.clone()),
                    );
                    state.processing_queue.push_back(ProcessingJob {
                        session_id: session_id.clone(),
                        enqueued_at: Instant::now(),
                    });
                    emit_recording_status(state, Some(session_id.clone()), None);
                    emit_recording_diagnostic(
                        state,
                        Some(session_id.clone()),
                        "queued_for_stt",
                        None,
                        format!("session queued for STT, queue depth={}", state.processing_queue.len()),
                        None,
                    );
                    let _ = myself.cast(RootMsg::DrainProcessingQueue);

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
                    set_recording_state(
                        state,
                        RecordingState::Failed,
                        Some(format!("{:?}", error)),
                        Some(session_id.clone()),
                    );
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
        if is_start_blocked(state) {
            tracing::warn!("session_already_running");
            return false;
        }

        set_recording_state(
            state,
            RecordingState::Starting,
            None,
            Some(params.session_id.clone()),
        );
        if state.recording_state != RecordingState::Starting {
            tracing::warn!("start_transition_to_starting_rejected");
            return false;
        }

        configure_sentry_session_context(&params);

        let app_dir = match state.runtime.vault_base() {
            Ok(base) => base.join("workspaces"),
            Err(e) => {
                tracing::error!(error = %e, "failed_to_resolve_workspaces_dir");
                set_recording_state(
                    state,
                    RecordingState::Failed,
                    Some(e.to_string()),
                    Some(params.session_id.clone()),
                );
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
                state.supervisor = Some(supervisor_cell.clone());
                set_recording_state(
                    state,
                    RecordingState::Recording,
                    None,
                    Some(params.session_id.clone()),
                );
                if state.recording_state != RecordingState::Recording {
                    tracing::warn!("start_transition_to_recording_rejected");
                    state.session_id = None;
                    state.supervisor = None;
                    supervisor_cell.stop(Some("recording_transition_rejected".to_string()));
                    clear_sentry_session_context();
                    return false;
                }

                state.runtime.emit_lifecycle(SessionLifecycleEvent::Active {
                    session_id: params.session_id,
                    error: None,
                });

                tracing::info!("session_started");
                true
            }
            Err(e) => {
                tracing::error!(error = ?e, "failed_to_start_session");
                set_recording_state(
                    state,
                    RecordingState::Failed,
                    Some(format!("{:?}", e)),
                    Some(params.session_id.clone()),
                );
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
    if let Some(supervisor) = state.supervisor.clone() {
        state.finalizing = true;
        let active_session_id = state.session_id.clone();
        set_recording_state(state, RecordingState::Stopping, None, active_session_id);

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

fn drain_processing_queue(myself: &ActorRef<RootMsg>, state: &mut RootState) {
    if state.current_job.is_some() {
        return;
    }

    let Some(job) = state.processing_queue.pop_front() else {
        if matches!(
            state.recording_state,
            RecordingState::QueuedForStt | RecordingState::Completed | RecordingState::Failed
        ) {
            set_recording_state(state, RecordingState::Idle, None, None);
        }
        return;
    };

    let session_id = job.session_id.clone();
    let queue_latency_ms = job.enqueued_at.elapsed().as_millis().try_into().unwrap_or(u64::MAX);
    state.current_job = Some(job);

    emit_recording_diagnostic(
        state,
        Some(session_id.clone()),
        "dequeued_for_stt",
        Some(queue_latency_ms),
        "session dequeued for STT processing".to_string(),
        None,
    );

    set_recording_state(
        state,
        RecordingState::Transcribing,
        None,
        Some(session_id.clone()),
    );

    let root_ref = myself.clone();
    let runtime = state.runtime.clone();
    let session_id_for_job = session_id.clone();
    let audio_path = match resolve_session_audio_path(&*state.runtime, &session_id) {
        Ok(path) => path,
        Err(error) => {
            let _ = root_ref.cast(RootMsg::TranscriptionFinished {
                session_id,
                error: Some(error),
            });
            return;
        }
    };

    tokio::spawn(async move {
        let result = tokio::task::spawn_blocking(move || runtime.run_stt_job(&session_id_for_job, &audio_path))
            .await
            .map_err(|e| format!("stt_task_join_error: {}", e))
            .and_then(|r| r);
        let _ = root_ref.cast(RootMsg::TranscriptionFinished {
            session_id,
            error: result.err(),
        });
    });
}

fn resolve_session_audio_path(
    runtime: &dyn ListenerRuntime,
    session_id: &str,
) -> Result<std::path::PathBuf, String> {
    let workspaces = runtime
        .vault_base()
        .map_err(|e| format!("vault_base_unavailable: {:?}", e))?
        .join("workspaces");
    let session_dir = find_session_dir(&workspaces, session_id);

    let candidates = ["audio.mp3", "audio.wav", "audio.ogg"];
    for name in candidates {
        let path = session_dir.join(name);
        if path.exists() {
            return Ok(path);
        }
    }

    Err(format!(
        "audio_artifact_not_found_for_session: {} in {}",
        session_id,
        session_dir.display()
    ))
}

fn is_start_blocked(state: &RootState) -> bool {
    state.supervisor.is_some()
        || matches!(
            state.recording_state,
            RecordingState::Starting | RecordingState::Recording | RecordingState::Stopping
        )
}

fn clear_stale_recording_state(state: &mut RootState) {
    let post_processing_active = state.current_job.is_some()
        || matches!(
            state.recording_state,
            RecordingState::Transcribing | RecordingState::QueuedForLlm | RecordingState::Summarizing
        )
        || (matches!(state.recording_state, RecordingState::QueuedForStt)
            && !state.processing_queue.is_empty());

    let lifecycle_active = state.supervisor.is_some()
        || state.finalizing
        || matches!(
            state.recording_state,
            RecordingState::Starting | RecordingState::Recording | RecordingState::Stopping
        )
        || post_processing_active;

    if lifecycle_active {
        emit_recording_diagnostic(
            state,
            state.session_id.clone(),
            "clear_stale_recording_state",
            None,
            "ignored stale-clear while recording lifecycle is active".to_string(),
            None,
        );
        emit_recording_status(state, state.session_id.clone(), None);
        return;
    }

    state.processing_queue.clear();
    state.current_job = None;
    state.last_error = None;
    state.finalizing = false;
    if state.supervisor.is_none() {
        state.session_id = None;
    }
    state.recording_state = RecordingState::Idle;
    emit_recording_status(state, state.session_id.clone(), None);
}

fn is_allowed_transition(current: &RecordingState, next: &RecordingState) -> bool {
    use RecordingState::*;

    match (current, next) {
        (Idle, Starting)
        | (QueuedForStt, Starting)
        | (Transcribing, Starting)
        | (QueuedForLlm, Starting)
        | (Summarizing, Starting)
        | (Completed, Starting)
        | (Failed, Starting)
        | (Starting, Recording)
        | (Starting, Failed)
        | (Recording, Stopping)
        | (Recording, Failed)
        | (Stopping, QueuedForStt)
        | (Stopping, Failed)
        | (QueuedForStt, Transcribing)
        | (QueuedForStt, Idle)
        | (Transcribing, QueuedForLlm)
        | (Transcribing, Failed)
        | (QueuedForLlm, Summarizing)
        | (Summarizing, Completed)
        | (Summarizing, Failed)
        | (Completed, Idle)
        | (Failed, Idle) => true,
        _ if current == next => true,
        _ => false,
    }
}

fn set_recording_state(
    state: &mut RootState,
    next_state: RecordingState,
    error: Option<String>,
    session_id: Option<String>,
) {
    let current = state.recording_state.clone();
    if !is_allowed_transition(&current, &next_state) {
        tracing::warn!(?current, ?next_state, "invalid_recording_state_transition");
        return;
    }

    if let Some(err) = error {
        state.last_error = Some(err.clone());
        state.recording_state = next_state;
        emit_recording_status(state, session_id, Some(err));
        return;
    }

    if next_state != RecordingState::Failed {
        state.last_error = None;
    }
    state.recording_state = next_state;
    emit_recording_status(state, session_id, None);
}

fn emit_recording_status(state: &RootState, session_id: Option<String>, reason: Option<String>) {
    state.runtime.emit_recording(SessionRecordingEvent::RecordingStateChanged {
        session_id,
        state: state.recording_state.clone(),
        queue_depth: state.processing_queue.len(),
        current_job_session_id: state.current_job.as_ref().map(|j| j.session_id.clone()),
        reason,
    });
}

fn emit_recording_diagnostic(
    state: &RootState,
    session_id: Option<String>,
    stage: &str,
    latency_ms: Option<u64>,
    message: String,
    error: Option<String>,
) {
    state.runtime.emit_recording(SessionRecordingEvent::RecordingDiagnostic {
        session_id,
        stage: stage.to_string(),
        queue_depth: state.processing_queue.len(),
        latency_ms,
        message,
        error,
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::SessionDataEvent;
    use crate::SessionErrorEvent;
    use crate::SessionProgressEvent;
    use openmushi_language::ISO639;
    use ractor::Actor;
    use std::path::PathBuf;
    use std::sync::Mutex;

    struct TestRuntime {
        recording_events: Mutex<Vec<SessionRecordingEvent>>,
    }

    impl TestRuntime {
        fn new() -> Self {
            Self {
                recording_events: Mutex::new(Vec::new()),
            }
        }

        fn take_recording_events(&self) -> Vec<SessionRecordingEvent> {
            std::mem::take(&mut *self.recording_events.lock().expect("recording event lock"))
        }
    }

    impl openmushi_storage::StorageRuntime for TestRuntime {
        fn global_base(&self) -> Result<PathBuf, openmushi_storage::Error> {
            Ok(std::env::temp_dir())
        }

        fn vault_base(&self) -> Result<PathBuf, openmushi_storage::Error> {
            Ok(std::env::temp_dir())
        }
    }

    impl ListenerRuntime for TestRuntime {
        fn emit_lifecycle(&self, _event: SessionLifecycleEvent) {}
        fn emit_progress(&self, _event: SessionProgressEvent) {}
        fn emit_error(&self, _event: SessionErrorEvent) {}
        fn emit_data(&self, _event: SessionDataEvent) {}

        fn emit_recording(&self, event: SessionRecordingEvent) {
            self.recording_events
                .lock()
                .expect("recording event lock")
                .push(event);
        }
    }

    fn mk_root_state(runtime: Arc<dyn ListenerRuntime>) -> RootState {
        RootState {
            runtime,
            session_id: None,
            supervisor: None,
            finalizing: false,
            recording_state: RecordingState::Idle,
            processing_queue: VecDeque::new(),
            current_job: None,
            last_error: None,
        }
    }

    fn mk_params(session_id: &str) -> SessionParams {
        SessionParams {
            session_id: session_id.to_string(),
            languages: vec![openmushi_language::Language::from(ISO639::En)],
            onboarding: false,
            record_enabled: true,
            model: "sherpa-whisper-small".to_string(),
            base_url: "sherpa://local".to_string(),
            api_key: String::new(),
            keywords: vec![],
            speaker_model: None,
            speaker_threshold: None,
        }
    }

    #[test]
    fn strict_required_lifecycle_transitions_are_allowed() {
        let path = vec![
            (RecordingState::Idle, RecordingState::Starting),
            (RecordingState::Starting, RecordingState::Recording),
            (RecordingState::Recording, RecordingState::Stopping),
            (RecordingState::Stopping, RecordingState::QueuedForStt),
            (RecordingState::QueuedForStt, RecordingState::Transcribing),
            (RecordingState::Transcribing, RecordingState::QueuedForLlm),
            (RecordingState::QueuedForLlm, RecordingState::Summarizing),
            (RecordingState::Summarizing, RecordingState::Completed),
        ];

        for (from, to) in path {
            assert!(is_allowed_transition(&from, &to), "{from:?} -> {to:?} must be allowed");
        }

        assert!(is_allowed_transition(&RecordingState::Summarizing, &RecordingState::Failed));
        assert!(is_allowed_transition(&RecordingState::Transcribing, &RecordingState::Failed));
    }

    #[test]
    fn invalid_transition_is_rejected_without_emitting_status() {
        let runtime = Arc::new(TestRuntime::new());
        let mut state = mk_root_state(runtime.clone());
        state.recording_state = RecordingState::Idle;

        set_recording_state(
            &mut state,
            RecordingState::Summarizing,
            None,
            Some("s1".to_string()),
        );

        assert_eq!(state.recording_state, RecordingState::Idle);
        assert!(runtime.take_recording_events().is_empty());
    }

    #[test]
    fn duplicate_start_is_blocked_for_starting_recording_stopping() {
        for recording_state in [
            RecordingState::Starting,
            RecordingState::Recording,
            RecordingState::Stopping,
        ] {
            let mut state = mk_root_state(Arc::new(TestRuntime::new()));
            state.recording_state = recording_state;
            assert!(is_start_blocked(&state));
        }
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn duplicate_start_is_blocked_while_supervisor_exists() {
        let runtime = Arc::new(TestRuntime::new());
        let mut state = mk_root_state(runtime);
        let (dummy_ref, _handle) = Actor::spawn(
            None,
            RootActor,
            RootArgs {
                runtime: state.runtime.clone(),
            },
        )
        .await
        .expect("spawn dummy actor");

        state.supervisor = Some(dummy_ref.get_cell());
        assert!(is_start_blocked(&state));
        dummy_ref.stop(None);
    }

    #[test]
    fn clear_stale_recording_state_is_idempotent_and_emits_status_refresh() {
        let runtime = Arc::new(TestRuntime::new());
        let mut state = mk_root_state(runtime.clone());
        state.session_id = Some("s1".to_string());
        state.recording_state = RecordingState::Completed;
        state.processing_queue.push_back(ProcessingJob {
            session_id: "s1".to_string(),
            enqueued_at: Instant::now(),
        });
        state.last_error = Some("boom".to_string());

        clear_stale_recording_state(&mut state);
        clear_stale_recording_state(&mut state);

        assert_eq!(state.recording_state, RecordingState::Idle);
        assert_eq!(state.processing_queue.len(), 0);
        assert!(state.current_job.is_none());
        assert!(state.last_error.is_none());
        assert!(!state.finalizing);
        assert!(state.session_id.is_none());

        let events = runtime.take_recording_events();
        assert_eq!(events.len(), 2);
        for event in events {
            match event {
                SessionRecordingEvent::RecordingStateChanged {
                    session_id,
                    state,
                    queue_depth,
                    current_job_session_id,
                    ..
                } => {
                    assert!(session_id.is_none());
                    assert_eq!(state, RecordingState::Idle);
                    assert_eq!(queue_depth, 0);
                    assert!(current_job_session_id.is_none());
                }
                SessionRecordingEvent::RecordingDiagnostic { .. } => {
                    panic!("expected only recording status events from stale clear")
                }
            }
        }
    }

    #[test]
    fn clear_stale_recording_state_is_noop_when_post_processing_inflight() {
        let runtime = Arc::new(TestRuntime::new());

        let mut transcribing = mk_root_state(runtime.clone());
        transcribing.session_id = Some("post-s1".to_string());
        transcribing.recording_state = RecordingState::Transcribing;
        transcribing.current_job = Some(ProcessingJob {
            session_id: "post-s1".to_string(),
            enqueued_at: Instant::now(),
        });
        transcribing.last_error = Some("keep-post-processing".to_string());

        clear_stale_recording_state(&mut transcribing);

        assert_eq!(transcribing.recording_state, RecordingState::Transcribing);
        assert!(transcribing.current_job.is_some());
        assert_eq!(
            transcribing.current_job.as_ref().map(|job| job.session_id.as_str()),
            Some("post-s1")
        );
        assert_eq!(
            transcribing.last_error.as_deref(),
            Some("keep-post-processing")
        );

        let mut queued = mk_root_state(runtime.clone());
        queued.session_id = Some("queued-s1".to_string());
        queued.recording_state = RecordingState::QueuedForStt;
        queued.processing_queue.push_back(ProcessingJob {
            session_id: "queued-s1".to_string(),
            enqueued_at: Instant::now(),
        });

        clear_stale_recording_state(&mut queued);

        assert_eq!(queued.recording_state, RecordingState::QueuedForStt);
        assert_eq!(queued.processing_queue.len(), 1);

        let events = runtime.take_recording_events();
        assert_eq!(events.len(), 4);
        assert!(matches!(
            &events[0],
            SessionRecordingEvent::RecordingDiagnostic { stage, .. } if stage == "clear_stale_recording_state"
        ));
        assert!(matches!(
            &events[1],
            SessionRecordingEvent::RecordingStateChanged {
                state: RecordingState::Transcribing,
                ..
            }
        ));
        assert!(matches!(
            &events[2],
            SessionRecordingEvent::RecordingDiagnostic { stage, .. } if stage == "clear_stale_recording_state"
        ));
        assert!(matches!(
            &events[3],
            SessionRecordingEvent::RecordingStateChanged {
                state: RecordingState::QueuedForStt,
                queue_depth: 1,
                ..
            }
        ));
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn clear_stale_recording_state_is_noop_when_lifecycle_active() {
        let runtime = Arc::new(TestRuntime::new());
        let mut state = mk_root_state(runtime.clone());
        state.session_id = Some("active-s1".to_string());
        state.recording_state = RecordingState::Recording;
        state.finalizing = true;
        state.processing_queue.push_back(ProcessingJob {
            session_id: "queued-s1".to_string(),
            enqueued_at: Instant::now(),
        });
        state.current_job = Some(ProcessingJob {
            session_id: "active-s1".to_string(),
            enqueued_at: Instant::now(),
        });
        state.last_error = Some("keep-me".to_string());

        let (dummy_ref, _handle) = Actor::spawn(
            None,
            RootActor,
            RootArgs {
                runtime: state.runtime.clone(),
            },
        )
        .await
        .expect("spawn dummy actor");
        state.supervisor = Some(dummy_ref.get_cell());

        clear_stale_recording_state(&mut state);

        assert_eq!(state.recording_state, RecordingState::Recording);
        assert_eq!(state.processing_queue.len(), 1);
        assert!(state.current_job.is_some());
        assert_eq!(state.last_error.as_deref(), Some("keep-me"));
        assert!(state.finalizing);
        assert_eq!(state.session_id.as_deref(), Some("active-s1"));

        let events = runtime.take_recording_events();
        assert_eq!(events.len(), 2);
        assert!(matches!(
            &events[0],
            SessionRecordingEvent::RecordingDiagnostic { stage, .. } if stage == "clear_stale_recording_state"
        ));
        assert!(matches!(
            &events[1],
            SessionRecordingEvent::RecordingStateChanged {
                state: RecordingState::Recording,
                ..
            }
        ));

        dummy_ref.stop(None);
    }

    #[test]
    fn status_and_diagnostics_events_are_emitted_via_recording_channel() {
        let runtime = Arc::new(TestRuntime::new());
        let mut state = mk_root_state(runtime.clone());

        set_recording_state(
            &mut state,
            RecordingState::Starting,
            None,
            Some("s2".to_string()),
        );

        emit_recording_diagnostic(
            &state,
            Some("s2".to_string()),
            "queued_for_stt",
            Some(12),
            "session queued".to_string(),
            None,
        );

        let events = runtime.take_recording_events();
        assert_eq!(events.len(), 2);
        assert!(matches!(
            &events[0],
            SessionRecordingEvent::RecordingStateChanged {
                state: RecordingState::Starting,
                ..
            }
        ));
        assert!(matches!(
            &events[1],
            SessionRecordingEvent::RecordingDiagnostic { .. }
        ));
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn start_session_rejects_duplicate_when_already_recording() {
        let runtime = Arc::new(TestRuntime::new());
        let mut state = mk_root_state(runtime);
        state.recording_state = RecordingState::Recording;

        let started = start_session_impl(
            Actor::spawn(None, RootActor, RootArgs {
                runtime: state.runtime.clone(),
            })
            .await
            .expect("spawn root actor")
            .0
            .get_cell(),
            mk_params("duplicate"),
            &mut state,
        )
        .await;

        assert!(!started);
    }

    #[test]
    fn start_is_not_blocked_for_queue_or_post_processing_states_without_active_lifecycle() {
        for state_value in [
            RecordingState::QueuedForStt,
            RecordingState::Transcribing,
            RecordingState::QueuedForLlm,
            RecordingState::Summarizing,
            RecordingState::Completed,
            RecordingState::Failed,
        ] {
            let mut state = mk_root_state(Arc::new(TestRuntime::new()));
            state.recording_state = state_value.clone();
            assert!(
                !is_start_blocked(&state),
                "start should be allowed while in {state_value:?} when lifecycle is inactive"
            );
            assert!(is_allowed_transition(&state_value, &RecordingState::Starting));
        }
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn drain_processing_queue_normalizes_terminal_state_to_idle_when_empty() {
        let runtime = Arc::new(TestRuntime::new());

        for terminal_state in [RecordingState::Completed, RecordingState::Failed] {
            let mut state = mk_root_state(runtime.clone());
            state.recording_state = terminal_state;

            let (root_ref, _handle) = Actor::spawn(
                None,
                RootActor,
                RootArgs {
                    runtime: state.runtime.clone(),
                },
            )
            .await
            .expect("spawn root actor");

            drain_processing_queue(&root_ref, &mut state);
            assert_eq!(state.recording_state, RecordingState::Idle);
            root_ref.stop(None);
        }
    }
}
