use std::path::PathBuf;

use ractor::{Actor, ActorProcessingErr, ActorRef, RpcReplyPort};

use super::{ServerInfo, ServerStatus};
use crate::model::SherpaSttModel;

pub enum SherpaSTTMessage {
    GetHealth(RpcReplyPort<ServerInfo>),
}

#[derive(Clone)]
pub struct SherpaSTTArgs {
    pub model_type: SherpaSttModel,
    pub models_dir: PathBuf,
    pub language: String,
    pub speaker_model: Option<String>,
    pub speaker_threshold: Option<f32>,
}

pub struct SherpaSTTState {
    model: SherpaSttModel,
}

pub struct SherpaSTTActor;

impl SherpaSTTActor {
    pub fn name() -> ractor::ActorName {
        "sherpa_stt".into()
    }
}

#[ractor::async_trait]
impl Actor for SherpaSTTActor {
    type Msg = SherpaSTTMessage;
    type State = SherpaSTTState;
    type Arguments = SherpaSTTArgs;

    async fn pre_start(
        &self,
        _myself: ActorRef<Self::Msg>,
        args: Self::Arguments,
    ) -> Result<Self::State, ActorProcessingErr> {
        let SherpaSTTArgs {
            model_type,
            models_dir,
            language,
            speaker_model,
            speaker_threshold,
        } = args;

        let model_dir = models_dir.join(model_type.dir_name());

        tracing::info!(model_dir = %model_dir.display(), ?speaker_model, "starting sherpa STT actor");

        // Build a SherpaEngineConfig to validate that all model files exist.
        // We don't create the engine here -- it will be created per-session
        // in ListenerActor (Task 8-9).
        let config = openmushi_stt_sherpa::SherpaEngineConfig {
            whisper_encoder: model_dir.join(model_type.encoder_filename()),
            whisper_decoder: model_dir.join(model_type.decoder_filename()),
            whisper_tokens: model_dir.join(model_type.tokens_filename()),
            whisper_language: language,
            vad_model: models_dir.join("silero_vad.onnx"),
            speaker_model: speaker_model.map(|m| models_dir.join(m)),
            speaker_threshold,
            sample_rate: 16000,
        };

        config.validate().map_err(|e| {
            tracing::error!(error = %e, "sherpa model validation failed");
            ActorProcessingErr::from(format!("sherpa model validation failed: {e}"))
        })?;

        tracing::info!("sherpa STT actor ready (model files validated)");

        Ok(SherpaSTTState {
            model: model_type,
        })
    }

    async fn handle(
        &self,
        _myself: ActorRef<Self::Msg>,
        message: Self::Msg,
        state: &mut Self::State,
    ) -> Result<(), ActorProcessingErr> {
        match message {
            SherpaSTTMessage::GetHealth(reply_port) => {
                let info = ServerInfo {
                    url: Some("sherpa://local".to_string()),
                    status: ServerStatus::Ready,
                    model: Some(crate::SupportedSttModel::Sherpa(state.model.clone())),
                };

                if let Err(e) = reply_port.send(info) {
                    return Err(e.into());
                }

                Ok(())
            }
        }
    }
}
