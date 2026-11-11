#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Storage remains Rust-private until device identity and OS key custody are proven.
// No SQL, filesystem or HTTP command is exposed to the webview in this spike.

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("desktop feasibility shell failed to start");
}
