use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct SherpaEngineConfig {
    pub whisper_encoder: PathBuf,
    pub whisper_decoder: PathBuf,
    pub whisper_tokens: PathBuf,
    pub whisper_language: String,
    pub vad_model: PathBuf,
    pub speaker_model: Option<PathBuf>,
    pub speaker_threshold: Option<f32>,
    pub sample_rate: u32,
}

impl SherpaEngineConfig {
    pub fn validate(&self) -> Result<(), crate::Error> {
        for path in [
            &self.whisper_encoder,
            &self.whisper_decoder,
            &self.whisper_tokens,
            &self.vad_model,
        ] {
            if !path.exists() {
                return Err(crate::Error::ModelNotFound(path.clone()));
            }
        }

        if let Some(speaker_path) = &self.speaker_model {
            if !speaker_path.exists() {
                return Err(crate::Error::ModelNotFound(speaker_path.clone()));
            }
        }

        Ok(())
    }
}
