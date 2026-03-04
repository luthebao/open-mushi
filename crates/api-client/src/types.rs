use openmushi_google_calendar::{CalendarListEntry, Event};

#[derive(serde::Serialize, serde::Deserialize)]
pub struct GoogleListEventsRequest {
    pub calendar_id: String,
    pub time_min: Option<String>,
    pub time_max: Option<String>,
    pub max_results: Option<u32>,
    pub page_token: Option<String>,
    pub single_events: Option<bool>,
    pub order_by: Option<String>,
}

pub struct GoogleListCalendarsResponse {
    pub items: Vec<CalendarListEntry>,
}

pub struct GoogleListEventsResponse {
    pub items: Vec<Event>,
}
