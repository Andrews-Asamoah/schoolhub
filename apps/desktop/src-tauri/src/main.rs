#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use schoolhub_desktop_spike::http::{DesktopHttp, HttpRequest, HttpResponse};

#[tauri::command]
async fn desktop_request(
    state: tauri::State<'_, DesktopHttp>,
    request: HttpRequest,
) -> Result<HttpResponse, String> {
    state.request(request).await
}

fn main() {
    let origin = option_env!("SCHOOLHUB_API_ORIGIN").unwrap_or("http://127.0.0.1:3001");
    let http = DesktopHttp::new(origin, cfg!(debug_assertions))
        .expect("Set SCHOOLHUB_API_ORIGIN to the production HTTPS API origin before compiling.");
    tauri::Builder::default()
        .manage(http)
        .invoke_handler(tauri::generate_handler![desktop_request])
        .run(tauri::generate_context!())
        .expect("desktop shell failed to start");
}
