mod analytics;
mod config;
mod env;
mod handler;
pub mod model;
mod openapi;
pub mod provider;
mod types;

pub const OPENMUSHI_TASK_HEADER: &str = "x-openmushi-task";

pub use analytics::{AnalyticsReporter, GenerationEvent};
pub use config::*;
pub use env::{ApiKey, Env};
pub use handler::{chat_completions_router, router};
pub use openmushi_analytics::{AuthenticatedUserId, DeviceFingerprint};
pub use model::{
    OpenMushiTask, MODEL_KEY_AUDIO, MODEL_KEY_DEFAULT, MODEL_KEY_TOOL_CALLING, ModelContext,
    ModelResolver, StaticModelResolver,
};
pub use openapi::openapi;
