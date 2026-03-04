use std::path::Path;
use std::pin::Pin;
use std::sync::Arc;

use futures_util::Stream;
use openmushi_llm_types::Response;

pub use openmushi_llm_types::Message;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("init error: {0}")]
    Init(String),
    #[error("inference error: {0}")]
    Inference(String),
    #[error("serde error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("nul error: {0}")]
    Nul(#[from] std::ffi::NulError),
}

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct CompleteOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_k: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop_sequences: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confidence_threshold: Option<f32>,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct CompletionResult {
    #[serde(default, rename = "response")]
    pub text: String,
    #[serde(default)]
    pub cloud_handoff: bool,
    #[serde(default)]
    pub confidence: f32,
    #[serde(default)]
    pub time_to_first_token_ms: f64,
    #[serde(default)]
    pub total_time_ms: f64,
    #[serde(default)]
    pub prefill_tps: f64,
    #[serde(default)]
    pub decode_tps: f64,
    #[serde(default)]
    pub prefill_tokens: u64,
    #[serde(default)]
    pub decode_tokens: u64,
    #[serde(default)]
    pub total_tokens: u64,
}

pub struct CompletionStream {
    _inner: (),
}

impl Stream for CompletionStream {
    type Item = Response;

    fn poll_next(
        self: Pin<&mut Self>,
        _cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Self::Item>> {
        std::task::Poll::Ready(None)
    }
}

impl CompletionStream {
    pub fn cancel(&self) {}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ModelKind {
    #[default]
    Whisper,
    Moonshine,
    Parakeet,
}

pub struct Model {
    _kind: ModelKind,
}

unsafe impl Send for Model {}
unsafe impl Sync for Model {}

pub struct ModelBuilder {
    _path: std::path::PathBuf,
    _kind: ModelKind,
}

impl ModelBuilder {
    pub fn kind(mut self, kind: ModelKind) -> Self {
        self._kind = kind;
        self
    }

    pub fn build(self) -> Result<Model> {
        Ok(Model { _kind: self._kind })
    }
}

impl Model {
    pub fn builder(model_path: impl AsRef<Path>) -> ModelBuilder {
        ModelBuilder {
            _path: model_path.as_ref().to_path_buf(),
            _kind: ModelKind::default(),
        }
    }

    pub fn new(_model_path: impl AsRef<Path>) -> Result<Self> {
        Ok(Model {
            _kind: ModelKind::default(),
        })
    }

    pub fn kind(&self) -> ModelKind {
        self._kind
    }

    pub fn stop(&self) {}

    pub fn reset(&mut self) {}

    pub fn complete(&self, _messages: &[Message], _options: &CompleteOptions) -> Result<CompletionResult> {
        Ok(CompletionResult::default())
    }
}

pub fn complete_stream(
    _model: &Arc<Model>,
    _messages: Vec<Message>,
    _options: CompleteOptions,
) -> Result<CompletionStream> {
    Ok(CompletionStream { _inner: () })
}

// --- CompleteService (tower Service for LLM inference) ---

pub struct ModelManager;

#[derive(Default)]
pub struct ModelManagerBuilder {
    _models: Vec<(String, std::path::PathBuf)>,
    _default: Option<String>,
}

impl ModelManagerBuilder {
    pub fn register(mut self, name: String, path: std::path::PathBuf) -> Self {
        self._models.push((name, path));
        self
    }

    pub fn default_model(mut self, name: String) -> Self {
        self._default = Some(name);
        self
    }

    pub fn build(self) -> ModelManager {
        ModelManager
    }
}

#[derive(Clone)]
pub struct CompleteService {
    _manager: Arc<()>,
}

impl CompleteService {
    pub fn new(_manager: ModelManager) -> Self {
        Self {
            _manager: Arc::new(()),
        }
    }
}

impl tower::Service<axum::extract::Request> for CompleteService {
    type Response = axum::response::Response;
    type Error = Error;
    type Future = Pin<Box<dyn std::future::Future<Output = std::result::Result<Self::Response, Self::Error>> + Send>>;

    fn poll_ready(
        &mut self,
        _cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<std::result::Result<(), Self::Error>> {
        std::task::Poll::Ready(Ok(()))
    }

    fn call(&mut self, _req: axum::extract::Request) -> Self::Future {
        Box::pin(async {
            Ok(axum::response::Response::builder()
                .status(501)
                .body(axum::body::Body::from("CompleteService not implemented"))
                .unwrap())
        })
    }
}

// STT-related stubs
#[derive(Clone, Debug, Default)]
pub struct CloudConfig {}

#[derive(Clone, Debug, Default)]
pub struct TranscribeOptions {}

pub struct Transcriber;

#[derive(Debug, Clone)]
pub struct TranscriptionResult;

pub struct TranscriptionSession;

#[derive(Debug, Clone)]
pub struct StreamResult;

#[derive(Debug, Clone)]
pub struct TranscribeEvent;

pub struct VadOptions;

pub struct VadResult;

pub struct VadSegment;

pub fn constrain_to() {}

pub fn transcribe_stream() {}
