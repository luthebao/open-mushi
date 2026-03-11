use ractor::{ActorRef, call_t, registry};

use openmushi_listener_core::actors::{RootActor, RootMsg, SessionParams, SourceActor, SourceMsg};
use openmushi_listener_core::{
    ListenerPreflightCheck, ListenerPreflightReport, ListenerPreflightStatus,
};
use tauri_plugin_local_llm::{LocalLlmPluginExt, SupportedModel as LocalLlmModel};
use tauri_plugin_local_stt::{LocalSttPluginExt, SherpaSttModel, SupportedSttModel};

pub struct Listener<'a, R: tauri::Runtime, M: tauri::Manager<R>> {
    #[allow(unused)]
    manager: &'a M,
    _runtime: std::marker::PhantomData<fn() -> R>,
}

impl<'a, R: tauri::Runtime, M: tauri::Manager<R>> Listener<'a, R, M> {
    #[tracing::instrument(skip_all)]
    pub async fn list_microphone_devices(&self) -> Result<Vec<String>, crate::Error> {
        Ok(openmushi_audio::AudioInput::list_mic_devices())
    }

    #[tracing::instrument(skip_all)]
    pub async fn get_current_microphone_device(&self) -> Result<Option<String>, crate::Error> {
        if let Some(cell) = registry::where_is(SourceActor::name()) {
            let actor: ActorRef<SourceMsg> = cell.into();
            match call_t!(actor, SourceMsg::GetMicDevice, 500) {
                Ok(device_name) => Ok(device_name),
                Err(_) => Ok(None),
            }
        } else {
            Err(crate::Error::ActorNotFound(SourceActor::name()))
        }
    }

    #[tracing::instrument(skip_all)]
    pub async fn get_state(&self) -> openmushi_listener_core::State {
        if let Some(cell) = registry::where_is(RootActor::name()) {
            let actor: ActorRef<RootMsg> = cell.into();
            match call_t!(actor, RootMsg::GetState, 100) {
                Ok(fsm_state) => fsm_state,
                Err(_) => openmushi_listener_core::State::Inactive,
            }
        } else {
            openmushi_listener_core::State::Inactive
        }
    }

    #[tracing::instrument(skip_all)]
    pub async fn get_recording_status(&self) -> openmushi_listener_core::RecordingStatus {
        if let Some(cell) = registry::where_is(RootActor::name()) {
            let actor: ActorRef<RootMsg> = cell.into();
            match call_t!(actor, RootMsg::GetRecordingStatus, 100) {
                Ok(status) => status,
                Err(_) => openmushi_listener_core::RecordingStatus {
                    state: openmushi_listener_core::RecordingState::Idle,
                    queue_depth: 0,
                    active_session_id: None,
                    current_job_session_id: None,
                    last_error: None,
                },
            }
        } else {
            openmushi_listener_core::RecordingStatus {
                state: openmushi_listener_core::RecordingState::Idle,
                queue_depth: 0,
                active_session_id: None,
                current_job_session_id: None,
                last_error: None,
            }
        }
    }

    #[tracing::instrument(skip_all)]
    pub async fn clear_stale_recording_state(&self) {
        if let Some(cell) = registry::where_is(RootActor::name()) {
            let actor: ActorRef<RootMsg> = cell.into();
            let _ = ractor::call!(actor, RootMsg::ClearStaleRecordingState);
        }
    }

    #[tracing::instrument(skip_all)]
    pub async fn preflight(&self) -> ListenerPreflightReport {
        let mut checks = Vec::new();

        let mic_devices = openmushi_audio::AudioInput::list_mic_devices();
        checks.push(if mic_devices.is_empty() {
            ListenerPreflightCheck {
                key: "mic_input_device".into(),
                status: ListenerPreflightStatus::Error,
                message: "No microphone input device detected".into(),
            }
        } else {
            ListenerPreflightCheck {
                key: "mic_input_device".into(),
                status: ListenerPreflightStatus::Ok,
                message: format!("Detected {} microphone device(s)", mic_devices.len()),
            }
        });

        checks.push(match self.manager.local_stt().models_dir().try_exists() {
            Ok(true) => ListenerPreflightCheck {
                key: "stt_models_dir".into(),
                status: ListenerPreflightStatus::Ok,
                message: "STT models directory is available".into(),
            },
            Ok(false) => ListenerPreflightCheck {
                key: "stt_models_dir".into(),
                status: ListenerPreflightStatus::Warning,
                message: "STT models directory is missing (will be created on demand)".into(),
            },
            Err(error) => ListenerPreflightCheck {
                key: "stt_models_dir".into(),
                status: ListenerPreflightStatus::Error,
                message: format!("Failed to access STT models directory: {}", error),
            },
        });

        let sherpa_model = SupportedSttModel::Sherpa(SherpaSttModel::WhisperSmall);
        checks.push(match self
            .manager
            .local_stt()
            .is_model_downloaded(&sherpa_model)
            .await
        {
            Ok(true) => ListenerPreflightCheck {
                key: "stt_model_whisper_small".into(),
                status: ListenerPreflightStatus::Ok,
                message: "Sherpa Whisper Small model is downloaded".into(),
            },
            Ok(false) => ListenerPreflightCheck {
                key: "stt_model_whisper_small".into(),
                status: ListenerPreflightStatus::Warning,
                message: "Sherpa Whisper Small model is not downloaded".into(),
            },
            Err(error) => ListenerPreflightCheck {
                key: "stt_model_whisper_small".into(),
                status: ListenerPreflightStatus::Error,
                message: format!("Failed to check STT model availability: {}", error),
            },
        });

        let llm_model = LocalLlmModel::Llama3p2_3bQ4;
        checks.push(match LocalLlmPluginExt::is_model_downloaded(self.manager, &llm_model).await {
            Ok(true) => ListenerPreflightCheck {
                key: "llm_model_default".into(),
                status: ListenerPreflightStatus::Ok,
                message: "Default local LLM model is downloaded".into(),
            },
            Ok(false) => ListenerPreflightCheck {
                key: "llm_model_default".into(),
                status: ListenerPreflightStatus::Warning,
                message: "Default local LLM model is not downloaded".into(),
            },
            Err(error) => ListenerPreflightCheck {
                key: "llm_model_default".into(),
                status: ListenerPreflightStatus::Error,
                message: format!("Failed to check local LLM model availability: {}", error),
            },
        });

        build_preflight_report(checks)
    }

    #[tracing::instrument(skip_all)]
    pub async fn get_mic_muted(&self) -> bool {
        if let Some(cell) = registry::where_is(SourceActor::name()) {
            let actor: ActorRef<SourceMsg> = cell.into();
            call_t!(actor, SourceMsg::GetMicMute, 100).unwrap_or_default()
        } else {
            false
        }
    }

    #[tracing::instrument(skip_all)]
    pub async fn set_mic_muted(&self, muted: bool) {
        if let Some(cell) = registry::where_is(SourceActor::name()) {
            let actor: ActorRef<SourceMsg> = cell.into();
            let _ = actor.cast(SourceMsg::SetMicMute(muted));
        }
    }

    #[tracing::instrument(skip_all)]
    pub async fn start_session(&self, params: SessionParams) -> Result<(), crate::Error> {
        if let Some(cell) = registry::where_is(RootActor::name()) {
            let actor: ActorRef<RootMsg> = cell.into();
            let started = ractor::call!(actor, RootMsg::StartSession, params)
                .map_err(|_| crate::Error::StartSessionFailed)?;

            if started {
                Ok(())
            } else {
                Err(crate::Error::StartSessionFailed)
            }
        } else {
            Err(crate::Error::ActorNotFound(RootActor::name()))
        }
    }

    #[tracing::instrument(skip_all)]
    pub async fn stop_session(&self) {
        if let Some(cell) = registry::where_is(RootActor::name()) {
            let actor: ActorRef<RootMsg> = cell.into();
            let _ = ractor::call!(actor, RootMsg::StopSession);
        }
    }
}

pub trait ListenerPluginExt<R: tauri::Runtime> {
    fn listener(&self) -> Listener<'_, R, Self>
    where
        Self: tauri::Manager<R> + Sized;
}

pub(crate) fn build_preflight_report(
    checks: Vec<ListenerPreflightCheck>,
) -> ListenerPreflightReport {
    let ok = !checks
        .iter()
        .any(|c| matches!(c.status, ListenerPreflightStatus::Error));
    ListenerPreflightReport { ok, checks }
}

impl<R: tauri::Runtime, T: tauri::Manager<R>> ListenerPluginExt<R> for T {
    fn listener(&self) -> Listener<'_, R, Self>
    where
        Self: Sized,
    {
        Listener {
            manager: self,
            _runtime: std::marker::PhantomData,
        }
    }
}

#[cfg(test)]
mod tests {
    use openmushi_listener_core::{ListenerPreflightCheck, ListenerPreflightStatus};

    use super::build_preflight_report;

    #[test]
    fn build_preflight_report_is_ok_when_all_checks_ok() {
        let report = build_preflight_report(vec![
            ListenerPreflightCheck {
                key: "mic".into(),
                status: ListenerPreflightStatus::Ok,
                message: "ready".into(),
            },
            ListenerPreflightCheck {
                key: "stt".into(),
                status: ListenerPreflightStatus::Warning,
                message: "optional warning".into(),
            },
        ]);

        assert!(report.ok);
        assert_eq!(report.checks.len(), 2);
    }

    #[test]
    fn build_preflight_report_is_not_ok_when_any_check_errors() {
        let report = build_preflight_report(vec![
            ListenerPreflightCheck {
                key: "mic".into(),
                status: ListenerPreflightStatus::Ok,
                message: "ready".into(),
            },
            ListenerPreflightCheck {
                key: "llm".into(),
                status: ListenerPreflightStatus::Error,
                message: "not available".into(),
            },
        ]);

        assert!(!report.ok);
    }
}
