#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use schoolhub_desktop_spike::http::{DesktopHttp, HttpRequest, HttpResponse};
use tauri::Manager;

mod updates;

#[tauri::command]
async fn desktop_request(
    state: tauri::State<'_, DesktopHttp>,
    request: HttpRequest,
) -> Result<HttpResponse, String> {
    state.request(request).await
}

#[tauri::command]
async fn desktop_select_school(
    state: tauri::State<'_, DesktopHttp>,
    school: String,
) -> Result<(), String> {
    state.select_school(school).await
}
#[tauri::command]
async fn desktop_remember_session(state: tauri::State<'_, DesktopHttp>) -> Result<(), String> {
    state.remember_session().await
}
#[tauri::command]
async fn desktop_resume_session(
    state: tauri::State<'_, DesktopHttp>,
    school: String,
    address: String,
) -> Result<HttpResponse, String> {
    state.resume_session(school, address).await
}
#[tauri::command]
async fn desktop_forget_session(
    state: tauri::State<'_, DesktopHttp>,
    school: String,
    address: String,
) -> Result<(), String> {
    state.forget_session(school, address).await
}

#[tauri::command]
async fn desktop_register_device(
    state: tauri::State<'_, DesktopHttp>,
    name: String,
) -> Result<HttpResponse, String> {
    state.register_device(name).await
}

fn main() {
    let origin = option_env!("SCHOOLHUB_API_ORIGIN").unwrap_or("http://127.0.0.1:3001");
    let http = DesktopHttp::new(origin, cfg!(debug_assertions))
        .expect("Set SCHOOLHUB_API_ORIGIN to the production HTTPS API origin before compiling.");
    let context = tauri::generate_context!();
    let mut builder = tauri::Builder::default();
    if context.config().plugins.0.contains_key("updater") {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }
    builder
        .manage(updates::UpdateInstall::default())
        .setup(move |app| {
            let root = app.path().app_local_data_dir()?.join("installations");
            app.manage(http.with_installation_root(root));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_request,
            desktop_select_school,
            desktop_remember_session,
            desktop_resume_session,
            desktop_forget_session,
            desktop_register_device,
            updates::desktop_check_update,
            updates::desktop_install_update
        ])
        .run(context)
        .expect("desktop shell failed to start");
}
