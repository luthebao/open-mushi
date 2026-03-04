use serde::{Deserialize, Serialize};
use std::path::PathBuf;

pub use openmushi_importer_core::ir::{
    Collection, EnhancedNote, Human, Organization, Session, SessionParticipant, Tag, TagMapping,
    Template, TemplateSection, Transcript, Word,
};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum TransformKind {
    OpenMushiV0,
    Granola,
    AsIs,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ImportSourceKind {
    Granola,
    OpenMushiV0Stable,
    OpenMushiV0Nightly,
    AsIs,
}

#[derive(Debug, Clone)]
pub struct ImportSource {
    pub kind: Option<ImportSourceKind>,
    pub transform: TransformKind,
    pub path: PathBuf,
    pub name: String,
}

impl ImportSource {
    pub fn from_path(path: PathBuf, transform: TransformKind) -> Self {
        Self {
            kind: None,
            transform,
            path: path.clone(),
            name: path.to_string_lossy().to_string(),
        }
    }

    pub fn openmushi_stable() -> Option<Self> {
        let path = dirs::data_dir()?
            .join("com.openmushi.stable")
            .join("db.sqlite");
        Some(Self {
            kind: Some(ImportSourceKind::OpenMushiV0Stable),
            transform: TransformKind::OpenMushiV0,
            path,
            name: "Open Mushi v0 - Stable".to_string(),
        })
    }

    pub fn openmushi_nightly() -> Option<Self> {
        let path = dirs::data_dir()?
            .join("com.openmushi.nightly")
            .join("db.sqlite");
        Some(Self {
            kind: Some(ImportSourceKind::OpenMushiV0Nightly),
            transform: TransformKind::OpenMushiV0,
            path,
            name: "Open Mushi v0 - Nightly".to_string(),
        })
    }

    pub fn granola() -> Option<Self> {
        None
    }

    pub fn is_available(&self) -> bool {
        self.path.exists()
    }

    pub fn info(&self) -> ImportSourceInfo {
        let (display_path, reveal_path) = match self.kind {
            Some(ImportSourceKind::OpenMushiV0Stable)
            | Some(ImportSourceKind::OpenMushiV0Nightly) => {
                let parent = self.path.parent().unwrap_or(&self.path);
                let display = parent
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| self.path.to_string_lossy().to_string());
                let reveal = parent.to_string_lossy().to_string();
                (display, reveal)
            }
            _ => {
                let path_str = self.path.to_string_lossy().to_string();
                (path_str.clone(), path_str)
            }
        };

        ImportSourceInfo {
            kind: self.kind.clone(),
            transform: self.transform,
            name: self.name.clone(),
            path: display_path,
            reveal_path,
        }
    }
}

impl From<ImportSourceKind> for ImportSource {
    fn from(kind: ImportSourceKind) -> Self {
        match kind {
            ImportSourceKind::OpenMushiV0Stable => Self::openmushi_stable().unwrap(),
            ImportSourceKind::OpenMushiV0Nightly => Self::openmushi_nightly().unwrap(),
            ImportSourceKind::Granola => Self::granola().unwrap(),
            ImportSourceKind::AsIs => Self {
                kind: Some(ImportSourceKind::AsIs),
                transform: TransformKind::AsIs,
                path: PathBuf::new(),
                name: "JSON Import".to_string(),
            },
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ImportSourceInfo {
    pub kind: Option<ImportSourceKind>,
    pub transform: TransformKind,
    pub name: String,
    pub path: String,
    pub reveal_path: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ImportStats {
    pub sessions_count: usize,
    pub transcripts_count: usize,
    pub humans_count: usize,
    pub organizations_count: usize,
    pub participants_count: usize,
    pub templates_count: usize,
    pub enhanced_notes_count: usize,
}

impl ImportStats {
    pub fn from_data(data: &Collection) -> Self {
        Self {
            sessions_count: data.sessions.len(),
            transcripts_count: data.transcripts.len(),
            humans_count: data.humans.len(),
            organizations_count: data.organizations.len(),
            participants_count: data.participants.len(),
            templates_count: data.templates.len(),
            enhanced_notes_count: data.enhanced_notes.len(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ImportDataResult {
    pub stats: ImportStats,
    pub data: serde_json::Value,
}
