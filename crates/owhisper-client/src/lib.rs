use std::pin::Pin;

use owhisper_interface::stream::StreamResponse;
use owhisper_interface::{ControlMessage, MixedMessage};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("owhisper error: {0}")]
    Other(String),
}

// Re-export ws client
pub use openmushi_ws_client;

// --- Provider / Auth ---

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, strum::EnumString, strum::Display)]
pub enum Provider {
    #[strum(serialize = "deepgram")]
    Deepgram,
    #[strum(serialize = "assemblyai")]
    AssemblyAI,
    #[strum(serialize = "soniox")]
    Soniox,
    #[strum(serialize = "fireworks")]
    Fireworks,
    #[strum(serialize = "openai")]
    OpenAI,
    #[strum(serialize = "gladia")]
    Gladia,
    #[strum(serialize = "elevenlabs")]
    ElevenLabs,
    #[strum(serialize = "dashscope")]
    DashScope,
    #[strum(serialize = "mistral")]
    Mistral,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Auth {
    Header {
        name: &'static str,
        prefix: Option<&'static str>,
    },
    FirstMessage {
        field_name: &'static str,
    },
    SessionInit {
        header_name: &'static str,
    },
}

pub fn is_meta_model(_model: &str) -> bool {
    false
}

// --- Error detection ---

#[derive(Debug, Clone)]
pub struct ProviderError {
    pub message: String,
}

// --- Adapter trait ---

pub trait RealtimeSttAdapter: Clone + Default + Send + Sync + 'static {
    fn provider_name(&self) -> &'static str;
    fn is_supported_languages(
        &self,
        languages: &[openmushi_language::Language],
        model: Option<&str>,
    ) -> bool;
    fn supports_native_multichannel(&self) -> bool;
    fn build_ws_url(
        &self,
        api_base: &str,
        params: &owhisper_interface::ListenParams,
        channels: u8,
    ) -> url::Url;
    fn build_auth_header(&self, api_key: Option<&str>) -> Option<(&'static str, String)>;
    fn keep_alive_message(&self) -> Option<openmushi_ws_client::client::Message>;
    fn finalize_message(&self) -> openmushi_ws_client::client::Message;
    fn parse_response(&self, raw: &str) -> Vec<StreamResponse>;
}

pub trait BatchSttAdapter: Clone + Default + Send + Sync + 'static {}

pub enum CallbackResult {
    Done(serde_json::Value),
    ProviderError(String),
}

pub trait CallbackSttAdapter: Clone + Default + Send + Sync + 'static {}

// --- Language support ---

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LanguageSupport {
    Supported { quality: LanguageQuality },
    Unsupported,
}

impl LanguageSupport {
    pub fn is_supported(&self) -> bool {
        matches!(self, LanguageSupport::Supported { .. })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum LanguageQuality {
    Good,
    Medium,
    Limited,
    NoData,
}

// --- Adapter impls (stubs) ---

macro_rules! stub_adapter {
    ($name:ident, $provider:expr) => {
        #[derive(Clone, Default)]
        pub struct $name;

        impl RealtimeSttAdapter for $name {
            fn provider_name(&self) -> &'static str {
                $provider
            }
            fn is_supported_languages(
                &self,
                _languages: &[openmushi_language::Language],
                _model: Option<&str>,
            ) -> bool {
                true
            }
            fn supports_native_multichannel(&self) -> bool {
                false
            }
            fn build_ws_url(
                &self,
                api_base: &str,
                _params: &owhisper_interface::ListenParams,
                _channels: u8,
            ) -> url::Url {
                api_base.parse().unwrap_or_else(|_| "ws://localhost".parse().unwrap())
            }
            fn build_auth_header(&self, _api_key: Option<&str>) -> Option<(&'static str, String)> {
                None
            }
            fn keep_alive_message(&self) -> Option<openmushi_ws_client::client::Message> {
                None
            }
            fn finalize_message(&self) -> openmushi_ws_client::client::Message {
                openmushi_ws_client::client::Message::Text(openmushi_ws_client::client::Utf8Bytes::from(""))
            }
            fn parse_response(&self, _raw: &str) -> Vec<StreamResponse> {
                Vec::new()
            }
        }
    };
}

stub_adapter!(DeepgramAdapter, "deepgram");
stub_adapter!(AssemblyAIAdapter, "assemblyai");
stub_adapter!(SonioxAdapter, "soniox");
stub_adapter!(FireworksAdapter, "fireworks");
stub_adapter!(OpenAIAdapter, "openai");
stub_adapter!(GladiaAdapter, "gladia");
stub_adapter!(ElevenLabsAdapter, "elevenlabs");
stub_adapter!(DashScopeAdapter, "dashscope");
stub_adapter!(MistralAdapter, "mistral");
stub_adapter!(ArgmaxAdapter, "argmax");
stub_adapter!(OpenMushiAdapter, "openmushi");
stub_adapter!(CactusAdapter, "cactus");

// Deepgram model
#[derive(Debug, Clone, Copy, PartialEq, Eq, strum::EnumString, strum::Display)]
pub enum DeepgramModel {
    #[strum(serialize = "nova-3")]
    Nova3,
}

// --- Adapter kind ---

#[derive(Debug, Clone, Copy, PartialEq, Eq, strum::Display, strum::EnumString)]
pub enum AdapterKind {
    #[strum(serialize = "argmax")]
    Argmax,
    #[strum(serialize = "soniox")]
    Soniox,
    #[strum(serialize = "fireworks")]
    Fireworks,
    Deepgram,
    #[strum(serialize = "assemblyai")]
    AssemblyAI,
    #[strum(serialize = "openai")]
    OpenAI,
    #[strum(serialize = "gladia")]
    Gladia,
    #[strum(serialize = "elevenlabs")]
    ElevenLabs,
    #[strum(serialize = "dashscope")]
    DashScope,
    #[strum(serialize = "mistral")]
    Mistral,
    #[strum(serialize = "openmushi")]
    OpenMushi,
    #[strum(serialize = "cactus")]
    Cactus,
    #[strum(serialize = "sherpa")]
    Sherpa,
}

impl AdapterKind {
    pub fn from_url_and_languages(
        base_url: &str,
        _languages: &[openmushi_language::Language],
        _model: Option<&str>,
    ) -> Self {
        if base_url.starts_with("sherpa://") {
            return Self::Sherpa;
        }
        Self::Deepgram
    }

    pub fn is_supported_languages_live(
        &self,
        _languages: &[openmushi_language::Language],
        _model: Option<&str>,
    ) -> bool {
        true
    }

    pub fn language_support_live(
        &self,
        _languages: &[openmushi_language::Language],
        _model: Option<&str>,
    ) -> LanguageSupport {
        LanguageSupport::Supported {
            quality: LanguageQuality::NoData,
        }
    }
}

impl PartialOrd for LanguageSupport {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for LanguageSupport {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        match (self, other) {
            (LanguageSupport::Supported { .. }, LanguageSupport::Unsupported) => {
                std::cmp::Ordering::Greater
            }
            (LanguageSupport::Unsupported, LanguageSupport::Supported { .. }) => {
                std::cmp::Ordering::Less
            }
            _ => std::cmp::Ordering::Equal,
        }
    }
}

// --- Streaming batch ---

#[derive(Debug, Clone)]
pub struct StreamingBatchEvent {
    pub response: StreamResponse,
    pub percentage: f64,
}

pub type StreamingBatchStream =
    Pin<Box<dyn futures_util::Stream<Item = Result<StreamingBatchEvent, Error>> + Send>>;

#[derive(Debug, Clone)]
pub struct StreamingBatchConfig;

// --- ListenClient ---

pub type ListenClientInput = MixedMessage<bytes::Bytes, ControlMessage>;
pub type ListenClientDualInput = MixedMessage<(bytes::Bytes, bytes::Bytes), ControlMessage>;

#[derive(Clone)]
pub struct ListenClient<A: RealtimeSttAdapter = DeepgramAdapter> {
    _adapter: std::marker::PhantomData<A>,
}

#[derive(Clone)]
pub struct ListenClientDual<A: RealtimeSttAdapter> {
    _adapter: std::marker::PhantomData<A>,
}

pub struct ListenClientBuilder<A: RealtimeSttAdapter = DeepgramAdapter> {
    _marker: std::marker::PhantomData<A>,
}

impl Default for ListenClientBuilder {
    fn default() -> Self {
        Self {
            _marker: std::marker::PhantomData,
        }
    }
}

impl<A: RealtimeSttAdapter> ListenClientBuilder<A> {
    pub fn api_base(self, _api_base: impl Into<String>) -> Self {
        self
    }

    pub fn api_key(self, _api_key: impl Into<String>) -> Self {
        self
    }

    pub fn params(self, _params: owhisper_interface::ListenParams) -> Self {
        self
    }

    pub fn extra_header(self, _name: impl Into<String>, _value: impl Into<String>) -> Self {
        self
    }

    pub fn adapter<B: RealtimeSttAdapter>(self) -> ListenClientBuilder<B> {
        ListenClientBuilder {
            _marker: std::marker::PhantomData,
        }
    }

    pub async fn build_single(self) -> ListenClient<A> {
        ListenClient {
            _adapter: std::marker::PhantomData,
        }
    }

    pub async fn build_dual(self) -> ListenClientDual<A> {
        ListenClientDual {
            _adapter: std::marker::PhantomData,
        }
    }
}

impl ListenClient {
    pub fn builder() -> ListenClientBuilder {
        ListenClientBuilder::default()
    }
}

impl<A: RealtimeSttAdapter> ListenClient<A> {
    pub async fn from_realtime_audio<S>(
        &self,
        _stream: S,
    ) -> Result<
        (
            Pin<Box<dyn futures_util::Stream<Item = Result<StreamResponse, Error>> + Send>>,
            SingleHandle,
        ),
        Error,
    >
    where
        S: futures_util::Stream + Send + 'static,
    {
        Err(Error::Other("stub".to_string()))
    }
}

impl<A: RealtimeSttAdapter> ListenClientDual<A> {
    pub async fn from_realtime_audio<S>(
        &self,
        _stream: S,
    ) -> Result<
        (
            Pin<Box<dyn futures_util::Stream<Item = Result<StreamResponse, Error>> + Send>>,
            DualHandle,
        ),
        Error,
    >
    where
        S: futures_util::Stream + Send + 'static,
    {
        Err(Error::Other("stub".to_string()))
    }
}

// --- Handles ---

pub struct SingleHandle;
pub enum DualHandle {
    Native,
    Split,
}

pub trait FinalizeHandle: Send {
    fn finalize(&self) -> impl std::future::Future<Output = ()> + Send;
    fn expected_finalize_count(&self) -> usize;
}

impl FinalizeHandle for SingleHandle {
    async fn finalize(&self) {}
    fn expected_finalize_count(&self) -> usize {
        1
    }
}

impl FinalizeHandle for DualHandle {
    async fn finalize(&self) {}
    fn expected_finalize_count(&self) -> usize {
        1
    }
}

// --- Batch client ---

pub struct BatchClient<A: RealtimeSttAdapter = DeepgramAdapter> {
    _marker: std::marker::PhantomData<A>,
}

impl<A: RealtimeSttAdapter> BatchClient<A> {
    pub fn new(
        _api_base: String,
        _api_key: String,
        _params: owhisper_interface::ListenParams,
    ) -> Self {
        Self {
            _marker: std::marker::PhantomData,
        }
    }
}

pub struct BatchClientBuilder;

// --- Utility functions ---

pub fn documented_language_codes_live() -> Vec<String> {
    Vec::new()
}

pub fn documented_language_codes_batch() -> Vec<String> {
    Vec::new()
}

pub fn is_openmushi_proxy(_base_url: &str) -> bool {
    false
}

pub fn is_local_host(host: &str) -> bool {
    host == "127.0.0.1" || host == "localhost" || host == "0.0.0.0" || host == "::1"
}

pub fn normalize_languages(
    languages: &[openmushi_language::Language],
) -> Vec<openmushi_language::Language> {
    languages.to_vec()
}

pub fn append_provider_param(base_url: &str, _provider: &str) -> String {
    base_url.to_string()
}
