use crate::types::Collection;
use std::path::Path;

pub async fn import_all_from_path(path: &Path) -> Result<Collection, crate::Error> {
    let data = openmushi_db_parser::v0::parse_from_sqlite(path).await?;
    Ok(data)
}
