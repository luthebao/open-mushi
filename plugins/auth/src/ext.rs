pub trait AuthPluginExt<R: tauri::Runtime> {
    fn get_item(&self, key: String) -> Result<Option<String>, crate::Error>;
    fn set_item(&self, key: String, value: String) -> Result<(), crate::Error>;
    fn remove_item(&self, key: String) -> Result<(), crate::Error>;
    fn clear_auth(&self) -> Result<(), crate::Error>;
    fn access_token(&self) -> Result<Option<String>, crate::Error>;
}

impl<R: tauri::Runtime, T: tauri::Manager<R>> AuthPluginExt<R> for T {
    fn get_item(&self, _key: String) -> Result<Option<String>, crate::Error> {
        Ok(None)
    }

    fn set_item(&self, _key: String, _value: String) -> Result<(), crate::Error> {
        Ok(())
    }

    fn remove_item(&self, _key: String) -> Result<(), crate::Error> {
        Ok(())
    }

    fn clear_auth(&self) -> Result<(), crate::Error> {
        Ok(())
    }

    fn access_token(&self) -> Result<Option<String>, crate::Error> {
        Ok(None)
    }
}
