use super::SessionParams;
use super::session_span;
use crate::{ListenerRuntime, SessionLifecycleEvent};

pub(crate) fn configure_sentry_session_context(_params: &SessionParams) {
    // Sentry removed — no-op
}

pub(crate) fn clear_sentry_session_context() {
    // Sentry removed — no-op
}

pub(crate) fn emit_session_ended(
    runtime: &dyn ListenerRuntime,
    session_id: &str,
    failure_reason: Option<String>,
) {
    let span = session_span(session_id);
    let _guard = span.enter();

    runtime.emit_lifecycle(SessionLifecycleEvent::Inactive {
        session_id: session_id.to_string(),
        error: failure_reason.clone(),
    });

    if let Some(reason) = failure_reason {
        tracing::info!(failure_reason = %reason, "session_stopped");
    } else {
        tracing::info!("session_stopped");
    }
}

pub(crate) async fn wait_for_actor_shutdown(actor_name: ractor::ActorName) {
    for _ in 0..50 {
        if ractor::registry::where_is(actor_name.clone()).is_none() {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
}
