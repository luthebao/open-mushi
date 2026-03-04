mod ext;

pub use ext::*;
pub use openmushi_analytics::*;

pub type ManagedState = openmushi_analytics::AnalyticsClient;

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("analytics")
        .setup(|app, _api| {
            use tauri::Manager;
            let client = openmushi_analytics::AnalyticsClientBuilder::default().build();
            assert!(app.manage(client));
            Ok(())
        })
        .build()
}
