#[derive(
    Debug,
    Clone,
    serde::Serialize,
    serde::Deserialize,
    specta::Type,
    Eq,
    Hash,
    PartialEq,
    strum::EnumString,
    strum::Display,
)]
pub enum CactusSttModel {
    #[serde(rename = "cactus-whisper-small-int8")]
    #[strum(serialize = "cactus-whisper-small-int8")]
    WhisperSmallInt8,
    #[serde(rename = "cactus-whisper-small-int8-apple")]
    #[strum(serialize = "cactus-whisper-small-int8-apple")]
    WhisperSmallInt8Apple,
    #[serde(rename = "cactus-whisper-small-int4")]
    #[strum(serialize = "cactus-whisper-small-int4")]
    WhisperSmallInt4,
    #[serde(rename = "cactus-whisper-medium-int4")]
    #[strum(serialize = "cactus-whisper-medium-int4")]
    WhisperMediumInt4,
    #[serde(rename = "cactus-whisper-medium-int4-apple")]
    #[strum(serialize = "cactus-whisper-medium-int4-apple")]
    WhisperMediumInt4Apple,
    #[serde(rename = "cactus-whisper-medium-int8")]
    #[strum(serialize = "cactus-whisper-medium-int8")]
    WhisperMediumInt8,
    #[serde(rename = "cactus-whisper-medium-int8-apple")]
    #[strum(serialize = "cactus-whisper-medium-int8-apple")]
    WhisperMediumInt8Apple,
    #[serde(rename = "cactus-parakeet-ctc-0.6b-int4")]
    #[strum(serialize = "cactus-parakeet-ctc-0.6b-int4")]
    ParakeetCtc0_6bInt4,
    #[serde(rename = "cactus-parakeet-ctc-0.6b-int8")]
    #[strum(serialize = "cactus-parakeet-ctc-0.6b-int8")]
    ParakeetCtc0_6bInt8,
}

impl CactusSttModel {
    pub fn all() -> &'static [CactusSttModel] {
        &[
            CactusSttModel::WhisperSmallInt4,
            CactusSttModel::WhisperSmallInt8,
            CactusSttModel::WhisperSmallInt8Apple,
        ]
    }

    pub fn is_apple(&self) -> bool {
        matches!(
            self,
            CactusSttModel::WhisperSmallInt8Apple
                | CactusSttModel::WhisperMediumInt4Apple
                | CactusSttModel::WhisperMediumInt8Apple
        )
    }

    pub fn asset_id(&self) -> &str {
        match self {
            CactusSttModel::WhisperSmallInt4 => "cactus-whisper-small-int4",
            CactusSttModel::WhisperSmallInt8 => "cactus-whisper-small-int8",
            CactusSttModel::WhisperSmallInt8Apple => "cactus-whisper-small-int8-apple",
            CactusSttModel::WhisperMediumInt4 => "cactus-whisper-medium-int4",
            CactusSttModel::WhisperMediumInt4Apple => "cactus-whisper-medium-int4-apple",
            CactusSttModel::WhisperMediumInt8 => "cactus-whisper-medium-int8",
            CactusSttModel::WhisperMediumInt8Apple => "cactus-whisper-medium-int8-apple",
            CactusSttModel::ParakeetCtc0_6bInt4 => "cactus-parakeet-ctc-0.6b-int4",
            CactusSttModel::ParakeetCtc0_6bInt8 => "cactus-parakeet-ctc-0.6b-int8",
        }
    }

    pub fn dir_name(&self) -> &str {
        match self {
            CactusSttModel::WhisperSmallInt4 => "whisper-small-int4",
            CactusSttModel::WhisperSmallInt8 => "whisper-small-int8",
            CactusSttModel::WhisperSmallInt8Apple => "whisper-small-int8-apple",
            CactusSttModel::WhisperMediumInt4 => "whisper-medium-int4",
            CactusSttModel::WhisperMediumInt4Apple => "whisper-medium-int4-apple",
            CactusSttModel::WhisperMediumInt8 => "whisper-medium-int8",
            CactusSttModel::WhisperMediumInt8Apple => "whisper-medium-int8-apple",
            CactusSttModel::ParakeetCtc0_6bInt4 => "parakeet-ctc-0.6b-int4",
            CactusSttModel::ParakeetCtc0_6bInt8 => "parakeet-ctc-0.6b-int8",
        }
    }

    pub fn zip_name(&self) -> String {
        format!("{}.zip", self.dir_name())
    }

    pub fn model_url(&self) -> Option<&str> {
        None
    }

    pub fn checksum(&self) -> Option<u32> {
        None
    }

    pub fn description(&self) -> &str {
        ""
    }

    pub fn display_name(&self) -> &str {
        match self {
            CactusSttModel::WhisperSmallInt4 => "Whisper Small (INT4)",
            CactusSttModel::WhisperSmallInt8 => "Whisper Small (INT8)",
            CactusSttModel::WhisperSmallInt8Apple => "Whisper Small (INT8, Apple NPU)",
            CactusSttModel::WhisperMediumInt4 => "Whisper Medium (INT4)",
            CactusSttModel::WhisperMediumInt4Apple => "Whisper Medium (INT4, Apple NPU)",
            CactusSttModel::WhisperMediumInt8 => "Whisper Medium (INT8)",
            CactusSttModel::WhisperMediumInt8Apple => "Whisper Medium (INT8, Apple NPU)",
            CactusSttModel::ParakeetCtc0_6bInt4 => "Parakeet CTC 0.6B (INT4)",
            CactusSttModel::ParakeetCtc0_6bInt8 => "Parakeet CTC 0.6B (INT8)",
        }
    }
}

#[derive(
    Debug,
    Clone,
    serde::Serialize,
    serde::Deserialize,
    specta::Type,
    Eq,
    Hash,
    PartialEq,
    strum::EnumString,
    strum::Display,
)]
pub enum CactusLlmModel {
    #[serde(rename = "cactus-gemma3-270m")]
    #[strum(serialize = "cactus-gemma3-270m")]
    Gemma3_270m,
}

impl CactusLlmModel {
    pub fn all() -> &'static [CactusLlmModel] {
        &[CactusLlmModel::Gemma3_270m]
    }

    pub fn is_apple(&self) -> bool {
        false
    }

    pub fn asset_id(&self) -> &str {
        "cactus-gemma3-270m"
    }

    pub fn dir_name(&self) -> &str {
        "gemma3-270m"
    }

    pub fn zip_name(&self) -> String {
        format!("{}.zip", self.dir_name())
    }

    pub fn model_url(&self) -> Option<&str> {
        None
    }

    pub fn description(&self) -> &str {
        ""
    }

    pub fn display_name(&self) -> &str {
        "Gemma 3 (270M)"
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Eq, Hash, PartialEq)]
#[serde(untagged)]
pub enum CactusModel {
    Stt(CactusSttModel),
    Llm(CactusLlmModel),
}

impl CactusModel {
    pub fn all() -> Vec<CactusModel> {
        CactusSttModel::all()
            .iter()
            .cloned()
            .map(CactusModel::Stt)
            .chain(CactusLlmModel::all().iter().cloned().map(CactusModel::Llm))
            .collect()
    }

    pub fn is_apple(&self) -> bool {
        match self {
            CactusModel::Stt(m) => m.is_apple(),
            CactusModel::Llm(m) => m.is_apple(),
        }
    }

    pub fn asset_id(&self) -> &str {
        match self {
            CactusModel::Stt(m) => m.asset_id(),
            CactusModel::Llm(m) => m.asset_id(),
        }
    }

    pub fn dir_name(&self) -> &str {
        match self {
            CactusModel::Stt(m) => m.dir_name(),
            CactusModel::Llm(m) => m.dir_name(),
        }
    }

    pub fn zip_name(&self) -> String {
        match self {
            CactusModel::Stt(m) => m.zip_name(),
            CactusModel::Llm(m) => m.zip_name(),
        }
    }

    pub fn model_url(&self) -> Option<&str> {
        match self {
            CactusModel::Stt(m) => m.model_url(),
            CactusModel::Llm(m) => m.model_url(),
        }
    }

    pub fn checksum(&self) -> Option<u32> {
        match self {
            CactusModel::Stt(m) => m.checksum(),
            CactusModel::Llm(_) => None,
        }
    }

    pub fn description(&self) -> &str {
        match self {
            CactusModel::Stt(m) => m.description(),
            CactusModel::Llm(m) => m.description(),
        }
    }

    pub fn display_name(&self) -> &str {
        match self {
            CactusModel::Stt(m) => m.display_name(),
            CactusModel::Llm(m) => m.display_name(),
        }
    }
}
