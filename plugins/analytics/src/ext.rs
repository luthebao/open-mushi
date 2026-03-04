pub struct Analytics<'a, R: tauri::Runtime, M: tauri::Manager<R>> {
    manager: &'a M,
    _runtime: std::marker::PhantomData<fn() -> R>,
}

impl<'a, R: tauri::Runtime, M: tauri::Manager<R>> Analytics<'a, R, M> {
    pub async fn event(
        &self,
        payload: openmushi_analytics::AnalyticsPayload,
    ) -> Result<(), openmushi_analytics::Error> {
        let client = self.manager.state::<crate::ManagedState>();
        client.event("stub", payload).await
    }

    pub fn event_fire_and_forget(&self, _payload: openmushi_analytics::AnalyticsPayload) {
        // no-op stub
    }

    pub async fn set_properties(
        &self,
        payload: openmushi_analytics::PropertiesPayload,
    ) -> Result<(), openmushi_analytics::Error> {
        let client = self.manager.state::<crate::ManagedState>();
        client.set_properties("stub", payload).await
    }

    pub async fn identify(
        &self,
        user_id: impl Into<String>,
        payload: openmushi_analytics::PropertiesPayload,
    ) -> Result<(), openmushi_analytics::Error> {
        let client = self.manager.state::<crate::ManagedState>();
        client.identify(user_id, "stub", payload).await
    }
}

pub trait AnalyticsPluginExt<R: tauri::Runtime> {
    fn analytics(&self) -> Analytics<'_, R, Self>
    where
        Self: tauri::Manager<R> + Sized;
}

impl<R: tauri::Runtime, T: tauri::Manager<R>> AnalyticsPluginExt<R> for T {
    fn analytics(&self) -> Analytics<'_, R, Self>
    where
        Self: Sized,
    {
        Analytics {
            manager: self,
            _runtime: std::marker::PhantomData,
        }
    }
}
