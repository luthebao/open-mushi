mod ext;

pub use ext::*;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("auth error: {0}")]
    Other(String),
}

pub type Result<T> = std::result::Result<T, Error>;

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("auth").build()
}
