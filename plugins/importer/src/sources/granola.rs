use crate::types::Collection;
use std::path::Path;

pub async fn import_all_from_path(_path: &Path) -> Result<Collection, crate::Error> {
    Err(crate::Error::SourceNotAvailable("Granola import not available".to_string()))
}
