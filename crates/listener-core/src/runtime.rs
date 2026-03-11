use crate::events::*;

pub trait ListenerRuntime: openmushi_storage::StorageRuntime {
    fn emit_lifecycle(&self, event: SessionLifecycleEvent);
    fn emit_progress(&self, event: SessionProgressEvent);
    fn emit_error(&self, event: SessionErrorEvent);
    fn emit_data(&self, event: SessionDataEvent);
    fn emit_recording(&self, event: SessionRecordingEvent);

    fn run_stt_job(&self, _session_id: &str, _audio_path: &std::path::Path) -> Result<(), String> {
        Ok(())
    }

    fn run_llm_job(&self, _session_id: &str) -> Result<(), String> {
        Ok(())
    }
}
