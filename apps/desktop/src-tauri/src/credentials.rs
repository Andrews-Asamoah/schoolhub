//! Secrets live in the operating system's credential store, never in files or in the webview.
//! A small trait keeps the store swappable so the rest of the app can be tested without one.

#[cfg(test)]
use std::collections::HashMap;
#[cfg(test)]
use std::sync::Mutex;

const SERVICE: &str = "com.schoolhub.desktop";

#[derive(Debug, thiserror::Error)]
pub enum SecretError {
    #[error("credential store error: {0}")]
    Store(String),
}

pub trait SecretStore: Send + Sync {
    fn get(&self, name: &str) -> Result<Option<String>, SecretError>;
    fn set(&self, name: &str, value: &str) -> Result<(), SecretError>;
    fn delete(&self, name: &str) -> Result<(), SecretError>;
}

/// Windows Credential Manager, macOS Keychain, or the Secret Service on Linux.
pub struct OsSecretStore;

impl OsSecretStore {
    fn entry(name: &str) -> Result<keyring::Entry, SecretError> {
        keyring::Entry::new(SERVICE, name).map_err(|e| SecretError::Store(e.to_string()))
    }
}

impl SecretStore for OsSecretStore {
    fn get(&self, name: &str) -> Result<Option<String>, SecretError> {
        match Self::entry(name)?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(SecretError::Store(e.to_string())),
        }
    }
    fn set(&self, name: &str, value: &str) -> Result<(), SecretError> {
        Self::entry(name)?.set_password(value).map_err(|e| SecretError::Store(e.to_string()))
    }
    fn delete(&self, name: &str) -> Result<(), SecretError> {
        match Self::entry(name)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(SecretError::Store(e.to_string())),
        }
    }
}

/// In-memory store for tests.
#[cfg(test)]
#[derive(Default)]
pub struct MemorySecretStore(Mutex<HashMap<String, String>>);

#[cfg(test)]
impl SecretStore for MemorySecretStore {
    fn get(&self, name: &str) -> Result<Option<String>, SecretError> {
        Ok(self.0.lock().unwrap().get(name).cloned())
    }
    fn set(&self, name: &str, value: &str) -> Result<(), SecretError> {
        self.0.lock().unwrap().insert(name.to_string(), value.to_string());
        Ok(())
    }
    fn delete(&self, name: &str) -> Result<(), SecretError> {
        self.0.lock().unwrap().remove(name);
        Ok(())
    }
}

pub fn session_name(school: &str) -> String {
    format!("session:{}", school.to_lowercase())
}

pub fn db_key_name(school: &str, user: &str) -> String {
    format!("db-key:{}:{}", school.to_lowercase(), user)
}

/// The database key for one school and user. Created on first use: 256 random bits, kept only in
/// the credential store, so a copied database file is unreadable on any other computer or account.
pub fn db_key(store: &dyn SecretStore, school: &str, user: &str) -> Result<String, SecretError> {
    use rand::RngCore;
    let name = db_key_name(school, user);
    if let Some(existing) = store.get(&name)? {
        return Ok(existing);
    }
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    let key = hex::encode(bytes);
    store.set(&name, &key)?;
    Ok(key)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_and_deletes() {
        let store = MemorySecretStore::default();
        assert_eq!(store.get("a").unwrap(), None);
        store.set("a", "secret").unwrap();
        assert_eq!(store.get("a").unwrap().as_deref(), Some("secret"));
        store.delete("a").unwrap();
        assert_eq!(store.get("a").unwrap(), None);
        store.delete("a").unwrap(); // deleting twice is fine
    }

    #[test]
    fn db_key_is_created_once_and_per_school_and_user() {
        let store = MemorySecretStore::default();
        let first = db_key(&store, "SUN", "u1").unwrap();
        assert_eq!(first.len(), 64);
        assert_eq!(first, db_key(&store, "sun", "u1").unwrap(), "school code is case-insensitive");
        assert_ne!(first, db_key(&store, "SUN", "u2").unwrap(), "each user has their own key");
        assert_ne!(first, db_key(&store, "OTHER", "u1").unwrap(), "each school has its own key");
    }
}
