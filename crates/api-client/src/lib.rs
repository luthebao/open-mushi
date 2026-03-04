pub mod types;

use std::fmt;

pub struct Client {
    _base_url: String,
    _http: reqwest::Client,
}

pub struct ResponseValue<T> {
    inner: T,
}

impl<T> ResponseValue<T> {
    pub fn into_inner(self) -> T {
        self.inner
    }
}

#[derive(Debug)]
pub struct ApiError(String);

impl fmt::Display for ApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "ApiError: {}", self.0)
    }
}

impl std::error::Error for ApiError {}

impl Client {
    pub fn new_with_client(base_url: &str, http: reqwest::Client) -> Self {
        Self {
            _base_url: base_url.to_string(),
            _http: http,
        }
    }

    pub async fn google_list_calendars(
        &self,
    ) -> Result<ResponseValue<types::GoogleListCalendarsResponse>, ApiError> {
        Err(ApiError("google calendar API not available (cloud deps removed)".to_string()))
    }

    pub async fn google_list_events(
        &self,
        _body: &types::GoogleListEventsRequest,
    ) -> Result<ResponseValue<types::GoogleListEventsResponse>, ApiError> {
        Err(ApiError("google calendar API not available (cloud deps removed)".to_string()))
    }
}
