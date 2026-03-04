#[derive(
    Debug,
    Eq,
    Hash,
    PartialEq,
    Clone,
    strum::EnumString,
    strum::Display,
    serde::Serialize,
    serde::Deserialize,
    specta::Type,
)]
pub enum WhisperModel {
    #[serde(rename = "QuantizedTiny")]
    QuantizedTiny,
    #[serde(rename = "QuantizedTinyEn")]
    QuantizedTinyEn,
    #[serde(rename = "QuantizedBase")]
    QuantizedBase,
    #[serde(rename = "QuantizedBaseEn")]
    QuantizedBaseEn,
    #[serde(rename = "QuantizedSmall")]
    QuantizedSmall,
    #[serde(rename = "QuantizedSmallEn")]
    QuantizedSmallEn,
    #[serde(rename = "QuantizedLargeTurbo")]
    QuantizedLargeTurbo,
}

impl WhisperModel {
    pub fn file_name(&self) -> &str {
        match self {
            WhisperModel::QuantizedTiny => "ggml-tiny-q8_0.bin",
            WhisperModel::QuantizedTinyEn => "ggml-tiny.en-q8_0.bin",
            WhisperModel::QuantizedBase => "ggml-base-q8_0.bin",
            WhisperModel::QuantizedBaseEn => "ggml-base.en-q8_0.bin",
            WhisperModel::QuantizedSmall => "ggml-small-q8_0.bin",
            WhisperModel::QuantizedSmallEn => "ggml-small.en-q8_0.bin",
            WhisperModel::QuantizedLargeTurbo => "ggml-large-v3-turbo-q8_0.bin",
        }
    }

    pub fn model_url(&self) -> &str {
        "https://example.com/stub"
    }

    pub fn checksum(&self) -> u32 {
        0
    }

    pub fn model_size_bytes(&self) -> u64 {
        0
    }

    pub fn display_name(&self) -> &str {
        match self {
            WhisperModel::QuantizedTiny => "Whisper Tiny (Multilingual)",
            WhisperModel::QuantizedTinyEn => "Whisper Tiny (English)",
            WhisperModel::QuantizedBase => "Whisper Base (Multilingual)",
            WhisperModel::QuantizedBaseEn => "Whisper Base (English)",
            WhisperModel::QuantizedSmall => "Whisper Small (Multilingual)",
            WhisperModel::QuantizedSmallEn => "Whisper Small (English)",
            WhisperModel::QuantizedLargeTurbo => "Whisper Large Turbo (Multilingual)",
        }
    }

    pub fn description(&self) -> String {
        String::from("stub")
    }
}
