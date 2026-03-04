use std::collections::HashMap;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("analytics error: {0}")]
    Other(String),
}

#[derive(Clone)]
pub struct DeviceFingerprint(pub String);

#[derive(Clone)]
pub struct AuthenticatedUserId(pub String);

#[derive(Clone)]
pub struct AnalyticsClient {
    _inner: (),
}

#[derive(Default)]
pub struct AnalyticsClientBuilder {
    _inner: (),
}

impl AnalyticsClientBuilder {
    pub fn with_posthog(self, _key: impl Into<String>) -> Self {
        self
    }

    pub fn with_local_evaluation(self, _personal_api_key: impl Into<String>) -> Self {
        self
    }

    pub fn with_outlit(self, _key: impl Into<String>) -> Self {
        self
    }

    pub fn build(self) -> AnalyticsClient {
        AnalyticsClient { _inner: () }
    }
}

impl AnalyticsClient {
    pub async fn event(
        &self,
        _distinct_id: impl Into<String>,
        _payload: AnalyticsPayload,
    ) -> Result<(), Error> {
        Ok(())
    }

    pub async fn set_properties(
        &self,
        _distinct_id: impl Into<String>,
        _payload: PropertiesPayload,
    ) -> Result<(), Error> {
        Ok(())
    }

    pub async fn is_feature_enabled(
        &self,
        _flag_key: &str,
        _distinct_id: &str,
    ) -> Result<bool, Error> {
        Ok(false)
    }

    pub async fn get_feature_flag(
        &self,
        _flag_key: &str,
        _distinct_id: &str,
        _person_properties: Option<HashMap<String, serde_json::Value>>,
        _group_properties: Option<HashMap<String, HashMap<String, serde_json::Value>>>,
    ) -> Result<Option<FlagValue>, Error> {
        Ok(None)
    }

    pub async fn get_feature_flag_payload(
        &self,
        _flag_key: &str,
        _distinct_id: &str,
    ) -> Result<Option<serde_json::Value>, Error> {
        Ok(None)
    }

    pub async fn identify(
        &self,
        _user_id: impl Into<String>,
        _anon_distinct_id: impl Into<String>,
        _payload: PropertiesPayload,
    ) -> Result<(), Error> {
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub enum FlagValue {
    Boolean(bool),
    String(String),
}

pub trait ToAnalyticsPayload {
    fn to_analytics_payload(&self) -> AnalyticsPayload;

    fn to_analytics_properties(&self) -> Option<PropertiesPayload> {
        None
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct AnalyticsPayload {
    pub event: String,
    #[serde(flatten)]
    pub props: HashMap<String, serde_json::Value>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct PropertiesPayload {
    #[serde(default)]
    pub set: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub set_once: HashMap<String, serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
}

#[derive(Default)]
pub struct PropertiesPayloadBuilder {
    set: HashMap<String, serde_json::Value>,
    set_once: HashMap<String, serde_json::Value>,
}

impl PropertiesPayload {
    pub fn builder() -> PropertiesPayloadBuilder {
        PropertiesPayloadBuilder::default()
    }
}

impl PropertiesPayloadBuilder {
    pub fn set(mut self, key: impl Into<String>, value: impl Into<serde_json::Value>) -> Self {
        self.set.insert(key.into(), value.into());
        self
    }

    pub fn set_once(
        mut self,
        key: impl Into<String>,
        value: impl Into<serde_json::Value>,
    ) -> Self {
        self.set_once.insert(key.into(), value.into());
        self
    }

    pub fn build(self) -> PropertiesPayload {
        PropertiesPayload {
            set: self.set,
            set_once: self.set_once,
            email: None,
            user_id: None,
        }
    }
}

#[derive(Clone)]
pub struct AnalyticsPayloadBuilder {
    event: Option<String>,
    props: HashMap<String, serde_json::Value>,
}

impl AnalyticsPayload {
    pub fn builder(event: impl Into<String>) -> AnalyticsPayloadBuilder {
        AnalyticsPayloadBuilder {
            event: Some(event.into()),
            props: HashMap::new(),
        }
    }
}

impl AnalyticsPayloadBuilder {
    pub fn with(mut self, key: impl Into<String>, value: impl Into<serde_json::Value>) -> Self {
        self.props.insert(key.into(), value.into());
        self
    }

    pub fn build(self) -> AnalyticsPayload {
        AnalyticsPayload {
            event: self.event.expect("event is required"),
            props: self.props,
        }
    }
}
