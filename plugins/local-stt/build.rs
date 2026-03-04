const COMMANDS: &[&str] = &[
    "models_dir",
    "cactus_models_dir",
    "is_model_downloaded",
    "is_model_downloading",
    "download_model",
    "cancel_download",
    "delete_model",
    "start_server",
    "stop_server",
    "get_server_for_model",
    "get_servers",
    "list_supported_models",
    "list_supported_languages",
    "list_speaker_models",
    "is_speaker_model_downloaded",
    "is_speaker_model_downloading",
    "download_speaker_model",
    "cancel_speaker_download",
    "delete_speaker_model",
    "set_speaker_config",
    "get_speaker_config",
    "run_batch_sherpa",
];

fn main() {
    println!("cargo:rerun-if-env-changed=AM_API_KEY");

    tauri_plugin::Builder::new(COMMANDS).build();
}
