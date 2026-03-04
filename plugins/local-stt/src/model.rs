use openmushi_am::AmModel;
use openmushi_whisper_local_model::WhisperModel;

pub use openmushi_cactus_model::CactusSttModel;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type, Eq, Hash, PartialEq)]
pub enum SherpaSttModel {
    #[serde(rename = "sherpa-whisper-tiny")]
    WhisperTiny,
    #[serde(rename = "sherpa-whisper-base")]
    WhisperBase,
    #[serde(rename = "sherpa-whisper-small")]
    WhisperSmall,
}

impl std::fmt::Display for SherpaSttModel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SherpaSttModel::WhisperTiny => write!(f, "sherpa-whisper-tiny"),
            SherpaSttModel::WhisperBase => write!(f, "sherpa-whisper-base"),
            SherpaSttModel::WhisperSmall => write!(f, "sherpa-whisper-small"),
        }
    }
}

impl SherpaSttModel {
    pub fn display_name(&self) -> &str {
        match self {
            SherpaSttModel::WhisperTiny => "Whisper Tiny (Sherpa)",
            SherpaSttModel::WhisperBase => "Whisper Base (Sherpa)",
            SherpaSttModel::WhisperSmall => "Whisper Small (Sherpa)",
        }
    }

    pub fn description(&self) -> &str {
        match self {
            SherpaSttModel::WhisperTiny => "Fastest, lowest accuracy. Good for real-time on low-end hardware.",
            SherpaSttModel::WhisperBase => "Balanced speed and accuracy. Recommended for most users.",
            SherpaSttModel::WhisperSmall => "Best accuracy, slower. For high-quality transcription.",
        }
    }

    pub fn model_size_bytes(&self) -> u64 {
        match self {
            SherpaSttModel::WhisperTiny => 75_000_000,
            SherpaSttModel::WhisperBase => 142_000_000,
            SherpaSttModel::WhisperSmall => 244_000_000,
        }
    }

    pub fn dir_name(&self) -> &str {
        match self {
            SherpaSttModel::WhisperTiny => "sherpa-onnx-whisper-tiny",
            SherpaSttModel::WhisperBase => "sherpa-onnx-whisper-base",
            SherpaSttModel::WhisperSmall => "sherpa-onnx-whisper-small",
        }
    }

    pub fn download_url(&self) -> String {
        format!(
            "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/{}.tar.bz2",
            self.dir_name()
        )
    }

    pub fn encoder_filename(&self) -> &str {
        match self {
            SherpaSttModel::WhisperTiny => "tiny-encoder.onnx",
            SherpaSttModel::WhisperBase => "base-encoder.onnx",
            SherpaSttModel::WhisperSmall => "small-encoder.onnx",
        }
    }

    pub fn decoder_filename(&self) -> &str {
        match self {
            SherpaSttModel::WhisperTiny => "tiny-decoder.onnx",
            SherpaSttModel::WhisperBase => "base-decoder.onnx",
            SherpaSttModel::WhisperSmall => "small-decoder.onnx",
        }
    }

    pub fn tokens_filename(&self) -> &str {
        match self {
            SherpaSttModel::WhisperTiny => "tiny-tokens.txt",
            SherpaSttModel::WhisperBase => "base-tokens.txt",
            SherpaSttModel::WhisperSmall => "small-tokens.txt",
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type, Eq, Hash, PartialEq)]
pub enum SpeakerModel {
    #[serde(rename = "nemo-speakernet")]
    NemoSpeakerNet,
    #[serde(rename = "3dspeaker-eres2net-base")]
    ThreeDSpeakerERes2NetBase,
    #[serde(rename = "wespeaker-resnet34")]
    WeSpeakerResNet34,
}

impl std::fmt::Display for SpeakerModel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SpeakerModel::NemoSpeakerNet => write!(f, "nemo-speakernet"),
            SpeakerModel::ThreeDSpeakerERes2NetBase => write!(f, "3dspeaker-eres2net-base"),
            SpeakerModel::WeSpeakerResNet34 => write!(f, "wespeaker-resnet34"),
        }
    }
}

impl SpeakerModel {
    pub fn display_name(&self) -> &str {
        match self {
            SpeakerModel::NemoSpeakerNet => "NeMo SpeakerNet",
            SpeakerModel::ThreeDSpeakerERes2NetBase => "3D-Speaker ERes2Net Base",
            SpeakerModel::WeSpeakerResNet34 => "WeSpeaker ResNet34",
        }
    }

    pub fn description(&self) -> &str {
        match self {
            SpeakerModel::NemoSpeakerNet => "Default speaker identification model. Fast and accurate.",
            SpeakerModel::ThreeDSpeakerERes2NetBase => "Alternative model from 3D-Speaker. Slightly larger.",
            SpeakerModel::WeSpeakerResNet34 => "WeSpeaker-based model. Good alternative for speaker ID.",
        }
    }

    pub fn model_size_bytes(&self) -> u64 {
        match self {
            SpeakerModel::NemoSpeakerNet => 23_000_000,
            SpeakerModel::ThreeDSpeakerERes2NetBase => 28_000_000,
            SpeakerModel::WeSpeakerResNet34 => 26_000_000,
        }
    }

    pub fn download_url(&self) -> &str {
        match self {
            SpeakerModel::NemoSpeakerNet => "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/nemo_en_speakerverification_speakernet.onnx",
            SpeakerModel::ThreeDSpeakerERes2NetBase => "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx",
            SpeakerModel::WeSpeakerResNet34 => "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/wespeaker_en_voxceleb_resnet34.onnx",
        }
    }

    pub fn filename(&self) -> &str {
        match self {
            SpeakerModel::NemoSpeakerNet => "nemo_en_speakerverification_speakernet.onnx",
            SpeakerModel::ThreeDSpeakerERes2NetBase => "3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx",
            SpeakerModel::WeSpeakerResNet34 => "wespeaker_en_voxceleb_resnet34.onnx",
        }
    }

    pub fn all() -> &'static [SpeakerModel] {
        &[
            SpeakerModel::NemoSpeakerNet,
            SpeakerModel::ThreeDSpeakerERes2NetBase,
            SpeakerModel::WeSpeakerResNet34,
        ]
    }
}

#[derive(serde::Serialize, serde::Deserialize, specta::Type)]
pub struct SpeakerModelInfo {
    pub key: SpeakerModel,
    pub display_name: String,
    pub description: String,
    pub size_bytes: u64,
}

pub static SUPPORTED_MODELS: [SupportedSttModel; 8] = [
    SupportedSttModel::Sherpa(SherpaSttModel::WhisperTiny),
    SupportedSttModel::Sherpa(SherpaSttModel::WhisperBase),
    SupportedSttModel::Sherpa(SherpaSttModel::WhisperSmall),
    SupportedSttModel::Am(AmModel::ParakeetV2),
    SupportedSttModel::Am(AmModel::ParakeetV3),
    SupportedSttModel::Am(AmModel::WhisperLargeV3),
    SupportedSttModel::Cactus(CactusSttModel::WhisperSmallInt8),
    SupportedSttModel::Cactus(CactusSttModel::WhisperSmallInt8Apple),
];

#[derive(serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum SttModelType {
    Sherpa,
    Cactus,
    Whispercpp,
    Argmax,
}

#[derive(serde::Serialize, serde::Deserialize, specta::Type)]
pub struct SttModelInfo {
    pub key: SupportedSttModel,
    pub display_name: String,
    pub description: String,
    pub size_bytes: u64,
    pub model_type: SttModelType,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type, Eq, Hash, PartialEq)]
#[serde(untagged)]
pub enum SupportedSttModel {
    Sherpa(SherpaSttModel),
    Cactus(CactusSttModel),
    Whisper(WhisperModel),
    Am(AmModel),
}

impl std::fmt::Display for SupportedSttModel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SupportedSttModel::Sherpa(model) => write!(f, "{}", model),
            SupportedSttModel::Cactus(model) => write!(f, "{}", model),
            SupportedSttModel::Whisper(model) => write!(f, "whisper-{}", model),
            SupportedSttModel::Am(model) => write!(f, "am-{}", model),
        }
    }
}

impl SupportedSttModel {
    pub fn is_available_on_current_platform(&self) -> bool {
        let is_apple_silicon = cfg!(target_arch = "aarch64") && cfg!(target_os = "macos");

        match self {
            SupportedSttModel::Sherpa(_) => true,
            SupportedSttModel::Whisper(_) | SupportedSttModel::Am(_) => is_apple_silicon,
            SupportedSttModel::Cactus(model) => {
                if model.is_apple() {
                    is_apple_silicon
                } else {
                    !is_apple_silicon
                }
            }
        }
    }

    pub fn info(&self) -> SttModelInfo {
        match self {
            SupportedSttModel::Sherpa(model) => SttModelInfo {
                key: self.clone(),
                display_name: model.display_name().to_string(),
                description: model.description().to_string(),
                size_bytes: model.model_size_bytes(),
                model_type: SttModelType::Sherpa,
            },
            SupportedSttModel::Cactus(model) => SttModelInfo {
                key: self.clone(),
                display_name: model.display_name().to_string(),
                description: model.description().to_string(),
                size_bytes: 0,
                model_type: SttModelType::Cactus,
            },
            SupportedSttModel::Whisper(model) => SttModelInfo {
                key: self.clone(),
                display_name: model.display_name().to_string(),
                description: model.description(),
                size_bytes: model.model_size_bytes(),
                model_type: SttModelType::Whispercpp,
            },
            SupportedSttModel::Am(model) => SttModelInfo {
                key: self.clone(),
                display_name: model.display_name().to_string(),
                description: model.description().to_string(),
                size_bytes: model.model_size_bytes(),
                model_type: SttModelType::Argmax,
            },
        }
    }
}
