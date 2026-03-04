use std::path::PathBuf;

#[derive(Clone, Debug, Default)]
pub struct CactusConfig {
    pub min_chunk_sec: f32,
}

#[derive(Clone)]
pub struct TranscribeService {
    _model_path: PathBuf,
    _cactus_config: CactusConfig,
}

pub struct TranscribeServiceBuilder {
    model_path: Option<PathBuf>,
    cactus_config: Option<CactusConfig>,
}

impl TranscribeService {
    pub fn builder() -> TranscribeServiceBuilder {
        TranscribeServiceBuilder {
            model_path: None,
            cactus_config: None,
        }
    }
}

impl TranscribeServiceBuilder {
    pub fn model_path(mut self, path: PathBuf) -> Self {
        self.model_path = Some(path);
        self
    }

    pub fn cactus_config(mut self, config: CactusConfig) -> Self {
        self.cactus_config = Some(config);
        self
    }

    pub fn build(self) -> TranscribeService {
        TranscribeService {
            _model_path: self.model_path.unwrap_or_default(),
            _cactus_config: self.cactus_config.unwrap_or_default(),
        }
    }
}

impl tower::Service<axum::extract::Request> for TranscribeService {
    type Response = axum::response::Response;
    type Error = String;
    type Future = std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<Self::Response, Self::Error>> + Send>,
    >;

    fn poll_ready(
        &mut self,
        _cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Result<(), Self::Error>> {
        std::task::Poll::Ready(Ok(()))
    }

    fn call(&mut self, _req: axum::extract::Request) -> Self::Future {
        Box::pin(async {
            Ok(axum::response::Response::builder()
                .status(501)
                .body(axum::body::Body::from("TranscribeService not implemented"))
                .unwrap())
        })
    }
}
