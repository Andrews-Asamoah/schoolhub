use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;
use tokio::sync::Mutex;

#[derive(Default)]
pub struct UpdateInstall(Mutex<()>);

#[derive(Serialize)]
pub struct AvailableUpdate {
    version: String,
    notes: Option<String>,
}

#[tauri::command]
pub async fn desktop_check_update(app: AppHandle) -> Result<Option<AvailableUpdate>, String> {
    if !app.config().plugins.0.contains_key("updater") {
        return Ok(None);
    }
    Ok(app
        .updater()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| error.to_string())?
        .map(|update| AvailableUpdate {
            version: update.version,
            notes: update.body,
        }))
}

#[tauri::command]
pub async fn desktop_install_update(
    app: AppHandle,
    install: tauri::State<'_, UpdateInstall>,
    version: String,
) -> Result<(), String> {
    if !app.config().plugins.0.contains_key("updater") {
        return Err("Updates are unavailable for this installation.".into());
    }
    let _install = install
        .0
        .try_lock()
        .map_err(|_| "An update is already being installed.")?;
    let update = app
        .updater()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| error.to_string())?
        .filter(|update| update.version == version)
        .ok_or("The available update changed. Check for updates again.")?;
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|error| error.to_string())
}
