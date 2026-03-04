use std::collections::HashMap;

use tauri::Manager;

use crate::{
    LocalSttPluginExt, SUPPORTED_MODELS, ServerInfo, SherpaSttModel, SpeakerModel,
    SpeakerModelInfo, SttModelInfo, SupportedSttModel, server::ServerType,
};

#[tauri::command]
#[specta::specta]
pub async fn models_dir<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<String, String> {
    Ok(app.local_stt().models_dir().to_string_lossy().to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn cactus_models_dir<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<String, String> {
    Ok(app
        .local_stt()
        .cactus_models_dir()
        .to_string_lossy()
        .to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn list_supported_models() -> Result<Vec<SttModelInfo>, String> {
    Ok(SUPPORTED_MODELS
        .iter()
        .filter(|m| m.is_available_on_current_platform())
        .map(|m| m.info())
        .collect())
}

#[tauri::command]
#[specta::specta]
pub async fn is_model_downloaded<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    model: SupportedSttModel,
) -> Result<bool, String> {
    app.local_stt()
        .is_model_downloaded(&model)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn is_model_downloading<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    model: SupportedSttModel,
) -> Result<bool, String> {
    Ok(app.local_stt().is_model_downloading(&model).await)
}

#[tauri::command]
#[specta::specta]
pub async fn download_model<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    model: SupportedSttModel,
) -> Result<(), String> {
    app.local_stt()
        .download_model(model)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn cancel_download<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    model: SupportedSttModel,
) -> Result<bool, String> {
    app.local_stt()
        .cancel_download(model)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn delete_model<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    model: SupportedSttModel,
) -> Result<(), String> {
    app.local_stt()
        .delete_model(&model)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn start_server<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    model: SupportedSttModel,
) -> Result<String, String> {
    app.local_stt()
        .start_server(model)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn stop_server<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    server_type: Option<ServerType>,
) -> Result<bool, String> {
    app.local_stt()
        .stop_server(server_type)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn get_server_for_model<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    model: SupportedSttModel,
) -> Result<Option<ServerInfo>, String> {
    app.local_stt()
        .get_server_for_model(&model)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn get_servers<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<HashMap<ServerType, ServerInfo>, String> {
    app.local_stt()
        .get_servers()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn list_speaker_models() -> Result<Vec<SpeakerModelInfo>, String> {
    Ok(SpeakerModel::all()
        .iter()
        .map(|m| SpeakerModelInfo {
            key: m.clone(),
            display_name: m.display_name().to_string(),
            description: m.description().to_string(),
            size_bytes: m.model_size_bytes(),
        })
        .collect())
}

#[tauri::command]
#[specta::specta]
pub async fn is_speaker_model_downloaded<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    model: SpeakerModel,
) -> Result<bool, String> {
    app.local_stt()
        .is_speaker_model_downloaded(&model)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn is_speaker_model_downloading<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    model: SpeakerModel,
) -> Result<bool, String> {
    Ok(app.local_stt().is_speaker_model_downloading(&model).await)
}

#[tauri::command]
#[specta::specta]
pub async fn download_speaker_model<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    model: SpeakerModel,
) -> Result<(), String> {
    app.local_stt()
        .download_speaker_model(model)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn cancel_speaker_download<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    model: SpeakerModel,
) -> Result<bool, String> {
    app.local_stt()
        .cancel_speaker_download(model)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn delete_speaker_model<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    model: SpeakerModel,
) -> Result<(), String> {
    app.local_stt()
        .delete_speaker_model(&model)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn is_segmentation_model_downloaded<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<bool, String> {
    Ok(app.local_stt().is_segmentation_model_downloaded())
}

#[tauri::command]
#[specta::specta]
pub async fn download_segmentation_model<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<(), String> {
    app.local_stt()
        .download_segmentation_model()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn delete_segmentation_model<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<(), String> {
    app.local_stt()
        .delete_segmentation_model()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn set_speaker_config<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    enabled: bool,
    model: Option<SpeakerModel>,
    threshold: Option<f32>,
) -> Result<(), String> {
    let state = app.state::<crate::SharedState>();
    let mut guard = state.lock().await;
    guard.speaker_enabled = enabled;
    if let Some(m) = model {
        guard.speaker_model = Some(m);
    }
    if let Some(t) = threshold {
        guard.speaker_threshold = t;
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn get_speaker_config<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<(bool, Option<SpeakerModel>, f32), String> {
    let state = app.state::<crate::SharedState>();
    let guard = state.lock().await;
    Ok((guard.speaker_enabled, guard.speaker_model.clone(), guard.speaker_threshold))
}

#[tauri::command]
#[specta::specta]
pub async fn run_batch_sherpa<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    file_path: String,
    model: SherpaSttModel,
    language: Option<String>,
    speaker_model: Option<SpeakerModel>,
    speaker_threshold: Option<f32>,
) -> Result<Vec<owhisper_interface::stream::StreamResponse>, String> {
    app.local_stt()
        .run_batch_sherpa(&file_path, model, language, speaker_model, speaker_threshold)
        .await
        .map_err(|e| e.to_string())
}
