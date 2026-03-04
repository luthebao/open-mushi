#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    FileError(#[from] openmushi_file::Error),
    #[error(transparent)]
    IoError(#[from] std::io::Error),
    #[error(transparent)]
    LmStudioError(#[from] openmushi_lmstudio::Error),
    #[cfg(target_arch = "aarch64")]
    #[error(transparent)]
    InferenceError(#[from] openmushi_cactus::Error),
    #[error("Model not downloaded")]
    ModelNotDownloaded,
    #[error("Store error: {0}")]
    StoreError(String),
    #[error("Other error: {0}")]
    Other(String),
}
