// Only the commands listed here are exposed to the webview, and each must also be granted in
// capabilities/default.json. Anything added to lib.rs but not listed here cannot be called.
const COMMANDS: &[&str] = &[
    "app_info",
    "session_get",
    "session_set",
    "session_clear",
    "db_open",
    "db_exec",
    "db_query",
    "db_transaction",
    "db_inspect",
    "db_close",
    "db_wipe",
    "spike_crash",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to build the Tauri app manifest");
}
