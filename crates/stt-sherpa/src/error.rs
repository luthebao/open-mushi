#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("Failed to create VAD: {0}")]
    VadInit(String),
    #[error("Failed to create whisper recognizer: {0}")]
    WhisperInit(String),
    #[error("Failed to create speaker extractor: {0}")]
    SpeakerInit(String),
    #[error("Transcription failed: {0}")]
    Transcribe(String),
    #[error("Model file not found: {0}")]
    ModelNotFound(std::path::PathBuf),
    #[error("Failed to initialize diarization: {0}")]
    DiarizeInit(String),
    #[error("Diarization failed: {0}")]
    DiarizeFailed(String),
}
