pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("SQLite error: {0}")]
    Sqlite(#[from] openmushi_db_core::libsql::Error),

    #[error("User DB error: {0}")]
    UserDb(#[from] openmushi_db_user::Error),

    #[error("JSON parse error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Invalid data: {0}")]
    InvalidData(String),
}
