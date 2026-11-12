//! SchoolHub Desktop, Phase 0 spike.
//!
//! The webview is untrusted-by-default: it can only call the commands below (listed in build.rs and
//! granted in capabilities/default.json). Secrets and the database key never leave Rust.

mod credentials;
mod localdb;

use credentials::{OsSecretStore, SecretStore};
use localdb::{Database, Inspection, Statement};
use serde::Serialize;
use serde_json::{Map, Value};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

struct AppState {
    db: Mutex<Option<Database>>,
    secrets: Box<dyn SecretStore>,
}

type CommandResult<T> = Result<T, String>;

fn err<E: std::fmt::Display>(error: E) -> String {
    error.to_string()
}

/// School codes and user ids become part of a file name, so only a safe subset is allowed through.
fn safe_part(value: &str) -> CommandResult<String> {
    let cleaned: String = value.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').collect();
    if cleaned.is_empty() || cleaned.len() != value.len() || cleaned.len() > 64 {
        return Err("invalid school or user identifier".into());
    }
    Ok(cleaned.to_lowercase())
}

fn db_path(app: &AppHandle, school: &str, user: &str) -> CommandResult<PathBuf> {
    let dir = app.path().app_data_dir().map_err(err)?.join("db");
    Ok(dir.join(format!("{}__{}.sqlite", safe_part(school)?, safe_part(user)?)))
}

#[derive(Serialize)]
struct AppInfo {
    version: &'static str,
    os: &'static str,
    arch: &'static str,
}

#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo { version: env!("CARGO_PKG_VERSION"), os: std::env::consts::OS, arch: std::env::consts::ARCH }
}

#[tauri::command]
fn session_get(state: State<AppState>, school: String) -> CommandResult<Option<String>> {
    state.secrets.get(&credentials::session_name(&school)).map_err(err)
}

#[tauri::command]
fn session_set(state: State<AppState>, school: String, token: String) -> CommandResult<()> {
    state.secrets.set(&credentials::session_name(&school), &token).map_err(err)
}

#[tauri::command]
fn session_clear(state: State<AppState>, school: String) -> CommandResult<()> {
    state.secrets.delete(&credentials::session_name(&school)).map_err(err)
}

#[tauri::command]
fn db_open(app: AppHandle, state: State<AppState>, school: String, user: String) -> CommandResult<()> {
    let path = db_path(&app, &school, &user)?;
    let key = credentials::db_key(state.secrets.as_ref(), &school, &user).map_err(err)?;
    let db = Database::open(&path, &key).map_err(err)?;
    *state.db.lock().map_err(err)? = Some(db);
    Ok(())
}

fn with_db<T>(state: &State<AppState>, run: impl FnOnce(&mut Database) -> Result<T, localdb::DbError>) -> CommandResult<T> {
    let mut guard = state.db.lock().map_err(err)?;
    let db = guard.as_mut().ok_or("the local database is not open")?;
    run(db).map_err(err)
}

#[tauri::command]
fn db_exec(state: State<AppState>, sql: String, params: Vec<Value>) -> CommandResult<usize> {
    with_db(&state, |db| db.exec(&sql, &params))
}

#[tauri::command]
fn db_query(state: State<AppState>, sql: String, params: Vec<Value>) -> CommandResult<Vec<Map<String, Value>>> {
    with_db(&state, |db| db.query(&sql, &params))
}

#[tauri::command]
fn db_transaction(state: State<AppState>, statements: Vec<Statement>) -> CommandResult<Vec<usize>> {
    with_db(&state, |db| db.transaction(&statements))
}

#[tauri::command]
fn db_inspect(state: State<AppState>) -> CommandResult<Inspection> {
    with_db(&state, |db| db.inspect())
}

#[tauri::command]
fn db_close(state: State<AppState>) -> CommandResult<()> {
    *state.db.lock().map_err(err)? = None;
    Ok(())
}

/// Closes and deletes one user's database and its key. This is what a revoked device or an expired
/// lease will run, so it is part of the spike: proving a wipe really removes the data.
#[tauri::command]
fn db_wipe(app: AppHandle, state: State<AppState>, school: String, user: String) -> CommandResult<()> {
    *state.db.lock().map_err(err)? = None;
    let path = db_path(&app, &school, &user)?;
    for suffix in ["", "-wal", "-shm"] {
        let mut name = path.clone().into_os_string();
        name.push(suffix);
        let _ = std::fs::remove_file(PathBuf::from(name));
    }
    state.secrets.delete(&credentials::db_key_name(&school, &user)).map_err(err)
}

/// Spike only: kills the process without any cleanup, to prove an interrupted write cannot lose
/// data or leave a command without its record. Remove before release.
#[tauri::command]
fn spike_crash() {
    std::process::abort();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .manage(AppState { db: Mutex::new(None), secrets: Box::new(OsSecretStore) })
        .invoke_handler(tauri::generate_handler![
            app_info, session_get, session_set, session_clear, db_open, db_exec, db_query,
            db_transaction, db_inspect, db_close, db_wipe, spike_crash
        ])
        .run(tauri::generate_context!())
        .expect("error while running SchoolHub Desktop");
}

#[cfg(test)]
mod tests {
    use super::safe_part;

    #[test]
    fn identifiers_cannot_escape_the_database_folder() {
        assert_eq!(safe_part("SUN-01_a").unwrap(), "sun-01_a");
        for bad in ["", "../x", "a/b", "a\\b", "a b", "a.b", &"x".repeat(65)] {
            assert!(safe_part(bad).is_err(), "{bad:?} should be rejected");
        }
    }
}
