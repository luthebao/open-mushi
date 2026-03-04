mod as_is;
mod granola;
mod openmushi;

pub use as_is::AsIsData;

use crate::types::{Collection, ImportSource, ImportSourceInfo, TransformKind};

pub async fn import_all(source: &ImportSource) -> Result<Collection, crate::Error> {
    match source.transform {
        TransformKind::OpenMushiV0 => openmushi::v0::import_all_from_path(&source.path).await,
        TransformKind::Granola => granola::import_all_from_path(&source.path).await,
        TransformKind::AsIs => as_is::load_data(&source.path),
    }
}

pub fn all_sources() -> Vec<ImportSource> {
    [
        ImportSource::openmushi_stable(),
        ImportSource::openmushi_nightly(),
    ]
    .into_iter()
    .flatten()
    .collect()
}

pub fn list_available_sources() -> Vec<ImportSourceInfo> {
    all_sources()
        .into_iter()
        .filter(|s| s.is_available())
        .map(|s| s.info())
        .collect()
}
