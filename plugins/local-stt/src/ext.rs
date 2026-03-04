use std::{collections::HashMap, path::{Path, PathBuf}, sync::Arc};

use ractor::{ActorRef, call_t, registry};
use tauri_specta::Event;
use tokio::sync::Mutex as TokioMutex;

use tauri::{Manager, Runtime};
use tauri_plugin_sidecar2::Sidecar2PluginExt;

use openmushi_cactus_model::CactusModel;
use openmushi_model_downloader::{DownloadableModel, ModelDownloadManager, ModelDownloaderRuntime};

/// Global lock to prevent concurrent shared model downloads.
static SHERPA_SHARED_DOWNLOAD_LOCK: std::sync::LazyLock<TokioMutex<()>> =
    std::sync::LazyLock::new(|| TokioMutex::new(()));

#[cfg(feature = "whisper-cpp")]
use crate::server::internal;
#[cfg(target_arch = "aarch64")]
use crate::server::internal2;
use crate::{
    model::{SpeakerModel, SupportedSttModel},
    server::{ServerInfo, ServerStatus, ServerType, external, sherpa, supervisor},
    types::{DownloadProgressPayload, SpeakerDownloadProgressPayload},
};

struct TauriModelRuntime<R: Runtime> {
    app_handle: tauri::AppHandle<R>,
}

impl<R: Runtime> ModelDownloaderRuntime<SupportedSttModel> for TauriModelRuntime<R> {
    fn models_base(&self) -> Result<PathBuf, openmushi_model_downloader::Error> {
        use tauri_plugin_settings::SettingsPluginExt;
        Ok(self
            .app_handle
            .settings()
            .global_base()
            .map(|base| base.join("models").into_std_path_buf())
            .unwrap_or_else(|_| dirs::data_dir().unwrap_or_default().join("models")))
    }

    fn emit_progress(&self, model: &SupportedSttModel, progress: i8) {
        let _ = DownloadProgressPayload {
            model: model.clone(),
            progress,
        }
        .emit(&self.app_handle);
    }
}

pub fn create_model_downloader<R: Runtime>(
    app_handle: &tauri::AppHandle<R>,
) -> ModelDownloadManager<SupportedSttModel> {
    let runtime = Arc::new(TauriModelRuntime {
        app_handle: app_handle.clone(),
    });
    ModelDownloadManager::new(runtime)
}

struct TauriSpeakerModelRuntime<R: Runtime> {
    app_handle: tauri::AppHandle<R>,
}

impl<R: Runtime> ModelDownloaderRuntime<SpeakerModel> for TauriSpeakerModelRuntime<R> {
    fn models_base(&self) -> Result<PathBuf, openmushi_model_downloader::Error> {
        use tauri_plugin_settings::SettingsPluginExt;
        Ok(self
            .app_handle
            .settings()
            .global_base()
            .map(|base| base.join("models").join("sherpa").into_std_path_buf())
            .unwrap_or_else(|_| {
                dirs::data_dir()
                    .unwrap_or_default()
                    .join("models")
                    .join("sherpa")
            }))
    }

    fn emit_progress(&self, model: &SpeakerModel, progress: i8) {
        let _ = SpeakerDownloadProgressPayload {
            model: model.clone(),
            progress,
        }
        .emit(&self.app_handle);
    }
}

pub fn create_speaker_model_downloader<R: Runtime>(
    app_handle: &tauri::AppHandle<R>,
) -> ModelDownloadManager<SpeakerModel> {
    let runtime = Arc::new(TauriSpeakerModelRuntime {
        app_handle: app_handle.clone(),
    });
    ModelDownloadManager::new(runtime)
}

impl DownloadableModel for SpeakerModel {
    fn download_key(&self) -> String {
        format!("speaker:{}", self)
    }

    fn download_url(&self) -> Option<String> {
        Some(SpeakerModel::download_url(self).to_string())
    }

    fn download_checksum(&self) -> Option<u32> {
        None
    }

    fn download_destination(&self, models_base: &std::path::Path) -> PathBuf {
        models_base.join(self.filename())
    }

    fn is_downloaded(
        &self,
        models_base: &std::path::Path,
    ) -> Result<bool, openmushi_model_downloader::Error> {
        Ok(models_base.join(self.filename()).exists())
    }

    fn finalize_download(
        &self,
        _downloaded_path: &std::path::Path,
        _models_base: &std::path::Path,
    ) -> Result<(), openmushi_model_downloader::Error> {
        // Single .onnx file, no extraction needed
        Ok(())
    }

    fn delete_downloaded(
        &self,
        models_base: &std::path::Path,
    ) -> Result<(), openmushi_model_downloader::Error> {
        let model_path = models_base.join(self.filename());
        if model_path.exists() {
            std::fs::remove_file(&model_path)
                .map_err(|e| openmushi_model_downloader::Error::DeleteFailed(e.to_string()))?;
        }
        Ok(())
    }

    fn remove_destination_after_finalize(&self) -> bool {
        false
    }
}

impl DownloadableModel for SupportedSttModel {
    fn download_key(&self) -> String {
        match self {
            SupportedSttModel::Sherpa(m) => format!("sherpa:{}", m.dir_name()),
            SupportedSttModel::Cactus(m) => {
                format!("cactus:{}", CactusModel::Stt(m.clone()).asset_id())
            }
            SupportedSttModel::Whisper(m) => format!("whisper:{}", m.file_name()),
            SupportedSttModel::Am(m) => format!("am:{}", m.model_dir()),
        }
    }

    fn download_url(&self) -> Option<String> {
        match self {
            SupportedSttModel::Sherpa(m) => Some(m.download_url()),
            SupportedSttModel::Cactus(m) => CactusModel::Stt(m.clone())
                .model_url()
                .map(|url| url.to_string()),
            SupportedSttModel::Whisper(m) => Some(m.model_url().to_string()),
            SupportedSttModel::Am(m) => Some(m.tar_url().to_string()),
        }
    }

    fn download_checksum(&self) -> Option<u32> {
        match self {
            SupportedSttModel::Sherpa(_) => None,
            SupportedSttModel::Cactus(m) => CactusModel::Stt(m.clone()).checksum(),
            SupportedSttModel::Whisper(m) => Some(m.checksum()),
            SupportedSttModel::Am(m) => Some(m.tar_checksum()),
        }
    }

    fn download_destination(&self, models_base: &std::path::Path) -> PathBuf {
        match self {
            SupportedSttModel::Sherpa(m) => models_base
                .join("sherpa")
                .join(format!("{}.tar.bz2", m.dir_name())),
            SupportedSttModel::Cactus(m) => models_base
                .join("cactus")
                .join(CactusModel::Stt(m.clone()).zip_name()),
            SupportedSttModel::Whisper(m) => models_base.join("stt").join(m.file_name()),
            SupportedSttModel::Am(m) => models_base
                .join("stt")
                .join(format!("{}.tar", m.model_dir())),
        }
    }

    fn is_downloaded(
        &self,
        models_base: &std::path::Path,
    ) -> Result<bool, openmushi_model_downloader::Error> {
        match self {
            SupportedSttModel::Sherpa(m) => {
                let encoder_path = models_base
                    .join("sherpa")
                    .join(m.dir_name())
                    .join(m.encoder_filename());
                Ok(encoder_path.exists())
            }
            SupportedSttModel::Cactus(m) => {
                let model_dir = models_base
                    .join("cactus")
                    .join(CactusModel::Stt(m.clone()).dir_name());
                Ok(model_dir.is_dir()
                    && std::fs::read_dir(&model_dir)
                        .map(|mut d| d.next().is_some())
                        .unwrap_or(false))
            }
            SupportedSttModel::Whisper(m) => {
                Ok(models_base.join("stt").join(m.file_name()).exists())
            }
            SupportedSttModel::Am(m) => m
                .is_downloaded(models_base.join("stt"))
                .map_err(|e| openmushi_model_downloader::Error::OperationFailed(e.to_string())),
        }
    }

    fn finalize_download(
        &self,
        downloaded_path: &std::path::Path,
        models_base: &std::path::Path,
    ) -> Result<(), openmushi_model_downloader::Error> {
        match self {
            SupportedSttModel::Sherpa(_) => {
                let output_dir = models_base.join("sherpa");
                openmushi_model_downloader::extract_tar_bz2(downloaded_path, &output_dir)?;
                Ok(())
            }
            SupportedSttModel::Cactus(m) => {
                let output_dir = models_base
                    .join("cactus")
                    .join(CactusModel::Stt(m.clone()).dir_name());
                openmushi_model_downloader::extract_zip(downloaded_path, output_dir)?;
                Ok(())
            }
            SupportedSttModel::Whisper(_) => Ok(()),
            SupportedSttModel::Am(m) => {
                let final_path = models_base.join("stt");
                m.tar_unpack_and_cleanup(downloaded_path, &final_path)
                    .map_err(|e| openmushi_model_downloader::Error::FinalizeFailed(e.to_string()))
            }
        }
    }

    fn delete_downloaded(
        &self,
        models_base: &std::path::Path,
    ) -> Result<(), openmushi_model_downloader::Error> {
        match self {
            SupportedSttModel::Sherpa(m) => {
                let model_dir = models_base.join("sherpa").join(m.dir_name());
                if model_dir.exists() {
                    std::fs::remove_dir_all(&model_dir)
                        .map_err(|e| openmushi_model_downloader::Error::DeleteFailed(e.to_string()))?;
                }
                Ok(())
            }
            SupportedSttModel::Cactus(m) => {
                let model_dir = models_base
                    .join("cactus")
                    .join(CactusModel::Stt(m.clone()).dir_name());
                if model_dir.exists() {
                    std::fs::remove_dir_all(&model_dir)
                        .map_err(|e| openmushi_model_downloader::Error::DeleteFailed(e.to_string()))?;
                }
                Ok(())
            }
            SupportedSttModel::Whisper(m) => {
                let model_path = models_base.join("stt").join(m.file_name());
                if model_path.exists() {
                    std::fs::remove_file(&model_path)
                        .map_err(|e| openmushi_model_downloader::Error::DeleteFailed(e.to_string()))?;
                }
                Ok(())
            }
            SupportedSttModel::Am(m) => {
                let model_dir = models_base.join("stt").join(m.model_dir());
                if model_dir.exists() {
                    std::fs::remove_dir_all(&model_dir)
                        .map_err(|e| openmushi_model_downloader::Error::DeleteFailed(e.to_string()))?;
                }
                Ok(())
            }
        }
    }

    fn remove_destination_after_finalize(&self) -> bool {
        matches!(
            self,
            SupportedSttModel::Sherpa(_) | SupportedSttModel::Cactus(_) | SupportedSttModel::Am(_)
        )
    }
}

pub struct LocalStt<'a, R: Runtime, M: Manager<R>> {
    manager: &'a M,
    _runtime: std::marker::PhantomData<fn() -> R>,
}

impl<'a, R: Runtime, M: Manager<R>> LocalStt<'a, R, M> {
    pub fn models_dir(&self) -> PathBuf {
        use tauri_plugin_settings::SettingsPluginExt;
        self.manager
            .settings()
            .global_base()
            .map(|base| base.join("models").join("stt").into_std_path_buf())
            .unwrap_or_else(|_| {
                dirs::data_dir()
                    .unwrap_or_default()
                    .join("models")
                    .join("stt")
            })
    }

    pub fn sherpa_models_dir(&self) -> PathBuf {
        use tauri_plugin_settings::SettingsPluginExt;
        self.manager
            .settings()
            .global_base()
            .map(|base| base.join("models").join("sherpa").into_std_path_buf())
            .unwrap_or_else(|_| {
                dirs::data_dir()
                    .unwrap_or_default()
                    .join("models")
                    .join("sherpa")
            })
    }

    pub fn cactus_models_dir(&self) -> PathBuf {
        use tauri_plugin_settings::SettingsPluginExt;
        self.manager
            .settings()
            .global_base()
            .map(|base| base.join("models").join("cactus").into_std_path_buf())
            .unwrap_or_else(|_| {
                dirs::data_dir()
                    .unwrap_or_default()
                    .join("models")
                    .join("cactus")
            })
    }

    pub async fn get_supervisor(&self) -> Result<supervisor::SupervisorRef, crate::Error> {
        let state = self.manager.state::<crate::SharedState>();
        let guard = state.lock().await;
        guard
            .stt_supervisor
            .clone()
            .ok_or(crate::Error::SupervisorNotFound)
    }

    pub async fn is_model_downloaded(
        &self,
        model: &SupportedSttModel,
    ) -> Result<bool, crate::Error> {
        let downloader = {
            let state = self.manager.state::<crate::SharedState>();
            let guard = state.lock().await;
            guard.model_downloader.clone()
        };
        Ok(downloader.is_downloaded(model).await?)
    }

    #[tracing::instrument(skip_all)]
    pub async fn start_server(&self, model: SupportedSttModel) -> Result<String, crate::Error> {
        let server_type = match &model {
            SupportedSttModel::Sherpa(_) => ServerType::Sherpa,
            SupportedSttModel::Am(_) => ServerType::External,
            SupportedSttModel::Whisper(_) | SupportedSttModel::Cactus(_) => ServerType::Internal,
        };

        let current_info = match server_type {
            ServerType::Sherpa => sherpa_health().await,
            #[cfg(target_arch = "aarch64")]
            ServerType::Internal => internal2_health().await,
            #[cfg(not(target_arch = "aarch64"))]
            ServerType::Internal => None,
            ServerType::External => external_health().await,
        };

        if let Some(info) = current_info.as_ref()
            && info.model.as_ref() == Some(&model)
        {
            if let Some(url) = info.url.clone() {
                return Ok(url);
            }

            return Err(crate::Error::ServerStartFailed(
                "missing_health_url".to_string(),
            ));
        }

        if matches!(server_type, ServerType::External | ServerType::Sherpa)
            && !self.is_model_downloaded(&model).await?
        {
            return Err(crate::Error::ModelNotDownloaded);
        }

        let supervisor = self.get_supervisor().await?;

        supervisor::stop_all_stt_servers(&supervisor)
            .await
            .map_err(|e| crate::Error::ServerStopFailed(e.to_string()))?;

        match server_type {
            ServerType::Sherpa => {
                let sherpa_model = match model {
                    SupportedSttModel::Sherpa(m) => m,
                    _ => return Err(crate::Error::UnsupportedModelType),
                };
                let models_dir = self.sherpa_models_dir();
                let (speaker_model, speaker_threshold) = self.get_speaker_config().await;
                start_sherpa_server(&supervisor, models_dir, sherpa_model, speaker_model, speaker_threshold).await
            }
            ServerType::Internal => {
                #[cfg(target_arch = "aarch64")]
                {
                    use openmushi_transcribe_cactus::CactusConfig;

                    let cache_dir = self.cactus_models_dir();
                    let cactus_model = match model {
                        SupportedSttModel::Cactus(m) => m,
                        _ => return Err(crate::Error::UnsupportedModelType),
                    };
                    start_internal2_server(
                        &supervisor,
                        cache_dir,
                        cactus_model,
                        CactusConfig::default(),
                    )
                    .await
                }
                #[cfg(not(target_arch = "aarch64"))]
                Err(crate::Error::UnsupportedModelType)
            }
            ServerType::External => {
                let data_dir = self.models_dir();
                let am_model = match model {
                    SupportedSttModel::Am(m) => m,
                    _ => return Err(crate::Error::UnsupportedModelType),
                };

                start_external_server(self.manager, &supervisor, data_dir, am_model).await
            }
        }
    }

    #[tracing::instrument(skip_all)]
    pub async fn stop_server(&self, server_type: Option<ServerType>) -> Result<bool, crate::Error> {
        let supervisor = self.get_supervisor().await?;

        match server_type {
            Some(t) => {
                supervisor::stop_stt_server(&supervisor, t)
                    .await
                    .map_err(|e| crate::Error::ServerStopFailed(e.to_string()))?;
                Ok(true)
            }
            None => {
                supervisor::stop_all_stt_servers(&supervisor)
                    .await
                    .map_err(|e| crate::Error::ServerStopFailed(e.to_string()))?;
                Ok(true)
            }
        }
    }

    #[tracing::instrument(skip_all)]
    pub async fn get_server_for_model(
        &self,
        model: &SupportedSttModel,
    ) -> Result<Option<ServerInfo>, crate::Error> {
        let server_type = match model {
            SupportedSttModel::Sherpa(_) => ServerType::Sherpa,
            SupportedSttModel::Am(_) => ServerType::External,
            SupportedSttModel::Whisper(_) | SupportedSttModel::Cactus(_) => ServerType::Internal,
        };

        let info = match server_type {
            ServerType::Sherpa => sherpa_health().await,
            #[cfg(target_arch = "aarch64")]
            ServerType::Internal => internal2_health().await,
            #[cfg(not(target_arch = "aarch64"))]
            ServerType::Internal => None,
            ServerType::External => external_health().await,
        };

        Ok(info)
    }

    #[tracing::instrument(skip_all)]
    pub async fn get_servers(&self) -> Result<HashMap<ServerType, ServerInfo>, crate::Error> {
        #[cfg(target_arch = "aarch64")]
        let internal_info = internal2_health().await.unwrap_or(ServerInfo {
            url: None,
            status: ServerStatus::Unreachable,
            model: None,
        });
        #[cfg(not(target_arch = "aarch64"))]
        let internal_info = ServerInfo {
            url: None,
            status: ServerStatus::Unreachable,
            model: None,
        };

        let external_info = external_health().await.unwrap_or(ServerInfo {
            url: None,
            status: ServerStatus::Unreachable,
            model: None,
        });

        let sherpa_info = sherpa_health().await.unwrap_or(ServerInfo {
            url: None,
            status: ServerStatus::Unreachable,
            model: None,
        });

        Ok([
            (ServerType::Sherpa, sherpa_info),
            (ServerType::Internal, internal_info),
            (ServerType::External, external_info),
        ]
        .into_iter()
        .collect())
    }

    #[tracing::instrument(skip_all)]
    pub async fn download_model(&self, model: SupportedSttModel) -> Result<(), crate::Error> {
        // For sherpa models, download VAD model first so that
        // is_downloaded returns true as soon as the main model finishes extracting.
        if matches!(model, SupportedSttModel::Sherpa(_)) {
            let sherpa_dir = self.sherpa_models_dir();
            download_sherpa_vad_models(&sherpa_dir).await?;
        }

        let downloader = {
            let state = self.manager.state::<crate::SharedState>();
            let guard = state.lock().await;
            guard.model_downloader.clone()
        };
        downloader.download(&model).await?;

        Ok(())
    }

    #[tracing::instrument(skip_all)]
    pub async fn cancel_download(&self, model: SupportedSttModel) -> Result<bool, crate::Error> {
        let downloader = {
            let state = self.manager.state::<crate::SharedState>();
            let guard = state.lock().await;
            guard.model_downloader.clone()
        };
        Ok(downloader.cancel_download(&model).await?)
    }

    #[tracing::instrument(skip_all)]
    pub async fn is_model_downloading(&self, model: &SupportedSttModel) -> bool {
        let downloader = {
            let state = self.manager.state::<crate::SharedState>();
            let guard = state.lock().await;
            guard.model_downloader.clone()
        };
        downloader.is_downloading(model).await
    }

    #[tracing::instrument(skip_all)]
    pub async fn delete_model(&self, model: &SupportedSttModel) -> Result<(), crate::Error> {
        let downloader = {
            let state = self.manager.state::<crate::SharedState>();
            let guard = state.lock().await;
            guard.model_downloader.clone()
        };
        downloader.delete(model).await?;
        Ok(())
    }

    /// Returns (speaker_model_filename, speaker_threshold) if speaker diarization
    /// is enabled and the chosen model is downloaded.
    async fn get_speaker_config(&self) -> (Option<String>, Option<f32>) {
        let state = self.manager.state::<crate::SharedState>();
        let guard = state.lock().await;

        let enabled = guard.speaker_enabled;
        let model = guard.speaker_model.clone();
        let threshold = guard.speaker_threshold;
        let downloader = guard.speaker_model_downloader.clone();
        drop(guard);

        if !enabled {
            return (None, None);
        }

        let Some(model) = model else {
            return (None, None);
        };

        match downloader.is_downloaded(&model).await {
            Ok(true) => (Some(model.filename().to_string()), Some(threshold)),
            _ => (None, None),
        }
    }

    pub async fn is_speaker_model_downloaded(
        &self,
        model: &SpeakerModel,
    ) -> Result<bool, crate::Error> {
        let downloader = {
            let state = self.manager.state::<crate::SharedState>();
            let guard = state.lock().await;
            guard.speaker_model_downloader.clone()
        };
        Ok(downloader.is_downloaded(model).await?)
    }

    #[tracing::instrument(skip_all)]
    pub async fn download_speaker_model(&self, model: SpeakerModel) -> Result<(), crate::Error> {
        let downloader = {
            let state = self.manager.state::<crate::SharedState>();
            let guard = state.lock().await;
            guard.speaker_model_downloader.clone()
        };
        downloader.download(&model).await?;
        Ok(())
    }

    #[tracing::instrument(skip_all)]
    pub async fn cancel_speaker_download(&self, model: SpeakerModel) -> Result<bool, crate::Error> {
        let downloader = {
            let state = self.manager.state::<crate::SharedState>();
            let guard = state.lock().await;
            guard.speaker_model_downloader.clone()
        };
        Ok(downloader.cancel_download(&model).await?)
    }

    pub async fn is_speaker_model_downloading(&self, model: &SpeakerModel) -> bool {
        let downloader = {
            let state = self.manager.state::<crate::SharedState>();
            let guard = state.lock().await;
            guard.speaker_model_downloader.clone()
        };
        downloader.is_downloading(model).await
    }

    #[tracing::instrument(skip_all)]
    pub async fn delete_speaker_model(&self, model: &SpeakerModel) -> Result<(), crate::Error> {
        let downloader = {
            let state = self.manager.state::<crate::SharedState>();
            let guard = state.lock().await;
            guard.speaker_model_downloader.clone()
        };
        downloader.delete(model).await?;
        Ok(())
    }

    /// Check if the Pyannote segmentation model is downloaded.
    pub fn is_segmentation_model_downloaded(&self) -> bool {
        let sherpa_dir = self.sherpa_models_dir();
        sherpa_dir
            .join(SHERPA_SEGMENTATION_MODEL_DIR)
            .join(SHERPA_SEGMENTATION_MODEL_FILE)
            .exists()
    }

    /// Download the Pyannote segmentation model for speaker diarization.
    pub async fn download_segmentation_model(&self) -> Result<(), crate::Error> {
        let sherpa_dir = self.sherpa_models_dir();
        download_sherpa_segmentation_model(&sherpa_dir).await?;
        Ok(())
    }

    /// Delete the Pyannote segmentation model directory.
    pub async fn delete_segmentation_model(&self) -> Result<(), crate::Error> {
        let sherpa_dir = self.sherpa_models_dir();
        let model_dir = sherpa_dir.join(SHERPA_SEGMENTATION_MODEL_DIR);
        if model_dir.exists() {
            std::fs::remove_dir_all(&model_dir).map_err(|e| {
                crate::Error::BatchFailed(format!(
                    "failed to delete segmentation model dir: {e}"
                ))
            })?;
        }
        Ok(())
    }

    /// Run batch (offline) transcription on an audio file using Sherpa engine.
    ///
    /// When speaker diarization is enabled, runs a two-pass pipeline:
    ///   1. Diarize the full audio to get a speaker timeline
    ///   2. VAD + Whisper transcription (without per-segment speaker ID)
    ///   3. Merge diarization speaker IDs into transcribed words by timestamp
    #[tracing::instrument(skip_all)]
    pub async fn run_batch_sherpa(
        &self,
        file_path: &str,
        model: crate::model::SherpaSttModel,
        language: Option<String>,
        speaker_model: Option<crate::model::SpeakerModel>,
        speaker_threshold: Option<f32>,
    ) -> Result<Vec<owhisper_interface::stream::StreamResponse>, crate::Error> {
        let models_dir = self.sherpa_models_dir();

        // Ensure VAD model exists
        download_sherpa_vad_models(&models_dir).await?;

        let model_dir = models_dir.join(model.dir_name());
        // sherpa-onnx Whisper expects a 2-letter language code (e.g. "en"),
        // but the frontend may send a locale like "en-VN" or "en-US".
        let language = language
            .filter(|l| !l.is_empty())
            .unwrap_or_else(|| "en".to_string())
            .split(['-', '_'])
            .next()
            .unwrap_or("en")
            .to_string();

        let speaker_model_path = speaker_model.as_ref().map(|m| {
            let filename = m.filename();
            tracing::info!(speaker_model = %filename, ?speaker_threshold, "speaker diarization enabled for batch");
            models_dir.join(filename)
        });

        // Download segmentation model for diarization if speaker model is provided
        let segmentation_model_path = if speaker_model_path.is_some() {
            Some(download_sherpa_segmentation_model(&models_dir).await?)
        } else {
            tracing::info!("speaker diarization disabled for batch");
            None
        };

        // Build engine WITHOUT speaker_model — diarization handles speaker assignment
        let config = openmushi_stt_sherpa::SherpaEngineConfig {
            whisper_encoder: model_dir.join(model.encoder_filename()),
            whisper_decoder: model_dir.join(model.decoder_filename()),
            whisper_tokens: model_dir.join(model.tokens_filename()),
            whisper_language: language,
            vad_model: models_dir.join("silero_vad.onnx"),
            speaker_model: None,
            speaker_threshold: None,
            sample_rate: 16000,
        };

        let file_path = file_path.to_string();
        let diarize_threshold = speaker_threshold;

        tokio::task::spawn_blocking(move || {
            use openmushi_audio_utils::Source;

            // Read and decode audio file
            let source = openmushi_audio_utils::source_from_path(&file_path).map_err(|e| {
                crate::Error::BatchFailed(format!("failed to open audio file: {e}"))
            })?;

            let channels = source.channels() as usize;

            // Resample to 16kHz
            let samples = openmushi_audio_utils::resample_audio(source, 16000).map_err(|e| {
                crate::Error::BatchFailed(format!("failed to resample audio: {e}"))
            })?;

            // Convert to mono if multi-channel
            let mono_samples = if channels > 1 {
                let deinterleaved = openmushi_audio_utils::deinterleave(&samples, channels);
                deinterleaved.into_iter().next().unwrap_or_default()
            } else {
                samples
            };

            tracing::info!(
                total_samples = mono_samples.len(),
                duration_secs = mono_samples.len() as f64 / 16000.0,
                "starting batch sherpa transcription"
            );

            // === Pass 1: Run diarization on full audio ===
            let diarize_segments = if let (Some(seg_model), Some(emb_model)) =
                (segmentation_model_path, speaker_model_path)
            {
                let diarize_config = openmushi_stt_sherpa::OfflineDiarizeConfig {
                    segmentation_model: seg_model,
                    embedding_model: emb_model,
                    num_clusters: None,
                    threshold: diarize_threshold,
                };

                tracing::info!("running speaker diarization on full audio...");
                let result = openmushi_stt_sherpa::run_diarize(
                    diarize_config,
                    mono_samples.clone(),
                    None,
                )
                .map_err(|e| {
                    crate::Error::BatchFailed(format!("diarization failed: {e}"))
                })?;

                let num_speakers = result
                    .segments
                    .iter()
                    .map(|s| s.speaker)
                    .collect::<std::collections::HashSet<_>>()
                    .len();

                tracing::info!(
                    num_speakers,
                    num_segments = result.segments.len(),
                    "diarization complete"
                );
                Some(result.segments)
            } else {
                None
            };

            // === Pass 2: VAD + Whisper pipeline ===
            let mut engine = openmushi_stt_sherpa::SherpaEngine::new(config).map_err(|e| {
                crate::Error::BatchFailed(format!("failed to create sherpa engine: {e}"))
            })?;

            let chunk_size = 1600;
            let mut all_responses = Vec::new();

            for chunk in mono_samples.chunks(chunk_size) {
                let responses = engine.process_audio(chunk);
                all_responses.extend(responses);
            }

            let final_responses = engine.flush();
            all_responses.extend(final_responses);

            // === Merge: overlay diarization speaker IDs onto transcribed words ===
            if let Some(ref diarize_segs) = diarize_segments {
                merge_speaker_ids(&mut all_responses, diarize_segs);
            }

            tracing::info!(
                response_count = all_responses.len(),
                "batch sherpa transcription complete"
            );

            Ok(all_responses)
        })
        .await
        .map_err(|e| crate::Error::BatchFailed(format!("batch task panicked: {e}")))?
    }
}

pub trait LocalSttPluginExt<R: Runtime> {
    fn local_stt(&self) -> LocalStt<'_, R, Self>
    where
        Self: Manager<R> + Sized;
}

impl<R: Runtime, T: Manager<R>> LocalSttPluginExt<R> for T {
    fn local_stt(&self) -> LocalStt<'_, R, Self>
    where
        Self: Sized,
    {
        LocalStt {
            manager: self,
            _runtime: std::marker::PhantomData,
        }
    }
}

#[cfg(target_arch = "aarch64")]
async fn start_internal2_server(
    supervisor: &supervisor::SupervisorRef,
    cache_dir: PathBuf,
    model: openmushi_cactus_model::CactusSttModel,
    cactus_config: openmushi_transcribe_cactus::CactusConfig,
) -> Result<String, crate::Error> {
    supervisor::start_internal2_stt(
        supervisor,
        internal2::Internal2STTArgs {
            model_cache_dir: cache_dir,
            model_type: model,
            cactus_config,
        },
    )
    .await
    .map_err(|e| crate::Error::ServerStartFailed(e.to_string()))?;

    internal2_health()
        .await
        .and_then(|info| info.url)
        .ok_or_else(|| crate::Error::ServerStartFailed("empty_health".to_string()))
}

#[cfg(feature = "whisper-cpp")]
async fn start_internal_server(
    supervisor: &supervisor::SupervisorRef,
    cache_dir: PathBuf,
    model: openmushi_whisper_local_model::WhisperModel,
) -> Result<String, crate::Error> {
    supervisor::start_internal_stt(
        supervisor,
        internal::InternalSTTArgs {
            model_cache_dir: cache_dir,
            model_type: model,
        },
    )
    .await
    .map_err(|e| crate::Error::ServerStartFailed(e.to_string()))?;

    internal_health()
        .await
        .and_then(|info| info.url)
        .ok_or_else(|| crate::Error::ServerStartFailed("empty_health".to_string()))
}

async fn start_external_server<R: Runtime, T: Manager<R>>(
    manager: &T,
    supervisor: &supervisor::SupervisorRef,
    data_dir: PathBuf,
    model: openmushi_am::AmModel,
) -> Result<String, crate::Error> {
    let am_key = {
        let state = manager.state::<crate::SharedState>();
        let key = {
            let guard = state.lock().await;
            guard.am_api_key.clone()
        };

        key.filter(|k| !k.is_empty())
            .ok_or(crate::Error::AmApiKeyNotSet)?
    };

    let port = port_check::free_local_port()
        .ok_or_else(|| crate::Error::ServerStartFailed("failed_to_find_free_port".to_string()))?;

    let app_handle = manager.app_handle().clone();
    let cmd_builder = external::CommandBuilder::new(move || {
        let mut cmd = app_handle
            .sidecar2()
            .sidecar("char-sidecar-stt")?
            .args(["serve", "--any-token"]);

        #[cfg(debug_assertions)]
        {
            cmd = cmd.args(["-v", "-d"]);
        }

        Ok(cmd)
    });

    supervisor::start_external_stt(
        supervisor,
        external::ExternalSTTArgs::new(cmd_builder, am_key, model, data_dir, port),
    )
    .await
    .map_err(|e| crate::Error::ServerStartFailed(e.to_string()))?;

    external_health()
        .await
        .and_then(|info| info.url)
        .ok_or_else(|| crate::Error::ServerStartFailed("empty_health".to_string()))
}

#[cfg(target_arch = "aarch64")]
async fn internal2_health() -> Option<ServerInfo> {
    match registry::where_is(internal2::Internal2STTActor::name()) {
        Some(cell) => {
            let actor: ActorRef<internal2::Internal2STTMessage> = cell.into();
            call_t!(actor, internal2::Internal2STTMessage::GetHealth, 10 * 1000).ok()
        }
        None => None,
    }
}

#[cfg(feature = "whisper-cpp")]
async fn internal_health() -> Option<ServerInfo> {
    match registry::where_is(internal::InternalSTTActor::name()) {
        Some(cell) => {
            let actor: ActorRef<internal::InternalSTTMessage> = cell.into();
            call_t!(actor, internal::InternalSTTMessage::GetHealth, 10 * 1000).ok()
        }
        None => None,
    }
}

async fn external_health() -> Option<ServerInfo> {
    match registry::where_is(external::ExternalSTTActor::name()) {
        Some(cell) => {
            let actor: ActorRef<external::ExternalSTTMessage> = cell.into();
            call_t!(actor, external::ExternalSTTMessage::GetHealth, 10 * 1000).ok()
        }
        None => None,
    }
}

const SHERPA_VAD_MODELS: &[(&str, &str)] = &[
    (
        "silero_vad.onnx",
        "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx",
    ),
];

/// Download shared Sherpa VAD model as part of the model download flow.
/// Guarded by a lock to prevent concurrent downloads from multiple side-effect triggers.
async fn download_sherpa_vad_models(sherpa_dir: &Path) -> Result<(), crate::Error> {
    let _guard = SHERPA_SHARED_DOWNLOAD_LOCK.lock().await;

    std::fs::create_dir_all(sherpa_dir).map_err(|e| {
        crate::Error::ServerStartFailed(format!("failed to create sherpa dir: {e}"))
    })?;

    for (filename, url) in SHERPA_VAD_MODELS {
        let dest = sherpa_dir.join(filename);
        if dest.exists() {
            tracing::debug!("sherpa shared model already present: {}", filename);
            continue;
        }

        tracing::info!("downloading sherpa shared model: {} -> {:?}", filename, dest);

        let filename_owned = filename.to_string();
        openmushi_file::download_file_with_callback(*url, &dest, move |progress| {
            match progress {
                openmushi_download_interface::DownloadProgress::Started => {
                    tracing::info!("sherpa shared {} download started", filename_owned);
                }
                openmushi_download_interface::DownloadProgress::Progress(downloaded, total) => {
                    let pct = if total > 0 {
                        (downloaded as f64 / total as f64 * 100.0) as u8
                    } else {
                        0
                    };
                    tracing::debug!("sherpa shared {} progress: {}%", filename_owned, pct);
                }
                openmushi_download_interface::DownloadProgress::Finished => {
                    tracing::info!("sherpa shared {} download finished", filename_owned);
                }
            }
        })
        .await
        .map_err(|e| {
            crate::Error::ServerStartFailed(format!(
                "failed to download shared model {}: {}",
                filename, e
            ))
        })?;
    }

    Ok(())
}

/// Merge speaker IDs from diarization segments into transcribed words by matching
/// word start times to the diarization timeline.
fn merge_speaker_ids(
    responses: &mut [owhisper_interface::stream::StreamResponse],
    diarize_segs: &[openmushi_stt_sherpa::DiarizeSegment],
) {
    use owhisper_interface::stream::StreamResponse;

    if diarize_segs.is_empty() {
        return;
    }

    for response in responses.iter_mut() {
        if let StreamResponse::TranscriptResponse {
            channel, ..
        } = response
        {
            for alt in channel.alternatives.iter_mut() {
                for word in alt.words.iter_mut() {
                    // Find the diarization segment that contains this word's start time.
                    // Segments are sorted by start_secs, so we can use binary search.
                    let speaker = find_speaker_at(diarize_segs, word.start);
                    if let Some(s) = speaker {
                        word.speaker = Some(s);
                    }
                }
            }
        }
    }
}

/// Binary-search for the diarization segment that contains the given time.
fn find_speaker_at(segments: &[openmushi_stt_sherpa::DiarizeSegment], time_secs: f64) -> Option<i32> {
    // Find the last segment whose start_secs <= time_secs
    let idx = segments.partition_point(|seg| seg.start_secs <= time_secs);
    if idx == 0 {
        // time_secs is before all segments — check if it falls within the first segment
        if !segments.is_empty() && time_secs < segments[0].end_secs {
            return Some(segments[0].speaker);
        }
        return None;
    }
    let seg = &segments[idx - 1];
    if time_secs < seg.end_secs {
        Some(seg.speaker)
    } else {
        None
    }
}

/// Segmentation model for speaker diarization (Pyannote v3.0).
const SHERPA_SEGMENTATION_MODEL_DIR: &str = "sherpa-onnx-pyannote-segmentation-3-0";
const SHERPA_SEGMENTATION_MODEL_FILE: &str = "model.onnx";
const SHERPA_SEGMENTATION_MODEL_URL: &str = "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2";

/// Download the Pyannote segmentation model for speaker diarization if not present.
/// Returns the path to `model.onnx`.
async fn download_sherpa_segmentation_model(sherpa_dir: &Path) -> Result<PathBuf, crate::Error> {
    let model_path = sherpa_dir
        .join(SHERPA_SEGMENTATION_MODEL_DIR)
        .join(SHERPA_SEGMENTATION_MODEL_FILE);

    if model_path.exists() {
        tracing::debug!("segmentation model already present: {:?}", model_path);
        return Ok(model_path);
    }

    let _guard = SHERPA_SHARED_DOWNLOAD_LOCK.lock().await;

    // Re-check after acquiring lock (another task may have downloaded it).
    if model_path.exists() {
        return Ok(model_path);
    }

    std::fs::create_dir_all(sherpa_dir).map_err(|e| {
        crate::Error::BatchFailed(format!("failed to create sherpa dir: {e}"))
    })?;

    let archive_dest = sherpa_dir.join(format!("{SHERPA_SEGMENTATION_MODEL_DIR}.tar.bz2"));

    tracing::info!("downloading segmentation model -> {:?}", archive_dest);

    let url = SHERPA_SEGMENTATION_MODEL_URL.to_string();
    let archive_dest_clone = archive_dest.clone();
    openmushi_file::download_file_with_callback(&url, &archive_dest_clone, move |progress| {
        match progress {
            openmushi_download_interface::DownloadProgress::Started => {
                tracing::info!("segmentation model download started");
            }
            openmushi_download_interface::DownloadProgress::Progress(downloaded, total) => {
                let pct = if total > 0 {
                    (downloaded as f64 / total as f64 * 100.0) as u8
                } else {
                    0
                };
                tracing::debug!("segmentation model progress: {pct}%");
            }
            openmushi_download_interface::DownloadProgress::Finished => {
                tracing::info!("segmentation model download finished");
            }
        }
    })
    .await
    .map_err(|e| {
        crate::Error::BatchFailed(format!("failed to download segmentation model: {e}"))
    })?;

    // Extract tar.bz2
    tracing::info!("extracting segmentation model archive");
    let sherpa_dir_owned = sherpa_dir.to_path_buf();
    let archive_dest_for_extract = archive_dest.clone();
    tokio::task::spawn_blocking(move || {
        openmushi_model_downloader::extract_tar_bz2(&archive_dest_for_extract, &sherpa_dir_owned)
            .map_err(|e| crate::Error::BatchFailed(format!("failed to extract segmentation model: {e}")))
    })
    .await
    .map_err(|e| crate::Error::BatchFailed(format!("extract task panicked: {e}")))?
    ?;

    // Remove archive after extraction
    let _ = std::fs::remove_file(&archive_dest);

    if !model_path.exists() {
        return Err(crate::Error::BatchFailed(format!(
            "segmentation model not found after extraction: {model_path:?}"
        )));
    }

    tracing::info!("segmentation model ready: {:?}", model_path);
    Ok(model_path)
}

async fn start_sherpa_server(
    supervisor: &supervisor::SupervisorRef,
    models_dir: PathBuf,
    model: crate::model::SherpaSttModel,
    speaker_model: Option<String>,
    speaker_threshold: Option<f32>,
) -> Result<String, crate::Error> {
    // Ensure VAD model exists (downloads if missing)
    download_sherpa_vad_models(&models_dir).await?;

    supervisor::start_sherpa_stt(
        supervisor,
        sherpa::SherpaSTTArgs {
            model_type: model,
            models_dir,
            language: "en".to_string(),
            speaker_model,
            speaker_threshold,
        },
    )
    .await
    .map_err(|e| crate::Error::ServerStartFailed(e.to_string()))?;

    sherpa_health()
        .await
        .and_then(|info| info.url)
        .ok_or_else(|| crate::Error::ServerStartFailed("empty_health".to_string()))
}

async fn sherpa_health() -> Option<ServerInfo> {
    match registry::where_is(sherpa::SherpaSTTActor::name()) {
        Some(cell) => {
            let actor: ActorRef<sherpa::SherpaSTTMessage> = cell.into();
            call_t!(actor, sherpa::SherpaSTTMessage::GetHealth, 10 * 1000).ok()
        }
        None => None,
    }
}
