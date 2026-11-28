//! Only bearer credentials are persisted. No password or challenge cookie is accepted.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::Arc;

#[cfg(windows)]
const SERVICE: &str = "com.schoolhub.desktop.session.v1";
#[cfg(windows)]
const STORE_ERROR: &str =
    "Saved sign-in storage is unavailable. Try again or sign in without saving.";

pub trait CredentialStore: Send + Sync {
    fn read(&self, key: &str) -> Result<Option<String>, String>;
    fn write(&self, key: &str, value: &str) -> Result<(), String>;
    fn remove(&self, key: &str) -> Result<(), String>;
}

pub struct OsCredentialStore;
#[cfg(windows)]
impl CredentialStore for OsCredentialStore {
    fn read(&self, key: &str) -> Result<Option<String>, String> {
        let entry = keyring::Entry::new(SERVICE, key).map_err(|_| STORE_ERROR)?;
        match entry.get_secret() {
            Ok(bytes) => String::from_utf8(bytes)
                .map(Some)
                .map_err(|_| STORE_ERROR.into()),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(STORE_ERROR.into()),
        }
    }
    fn write(&self, key: &str, value: &str) -> Result<(), String> {
        keyring::Entry::new(SERVICE, key)
            .map_err(|_| STORE_ERROR)?
            .set_secret(value.as_bytes())
            .map_err(|_| STORE_ERROR.into())
    }
    fn remove(&self, key: &str) -> Result<(), String> {
        let entry = keyring::Entry::new(SERVICE, key).map_err(|_| STORE_ERROR)?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(STORE_ERROR.into()),
        }
    }
}
// Windows is the first supported native platform. Do not silently substitute
// a mock store or a plaintext file on platforms without a supported backend.
#[cfg(not(windows))]
impl CredentialStore for OsCredentialStore {
    fn read(&self, _: &str) -> Result<Option<String>, String> {
        Ok(None)
    }
    fn write(&self, _: &str, _: &str) -> Result<(), String> {
        Err("Saved sign-in is currently supported on Windows only.".into())
    }
    fn remove(&self, _: &str) -> Result<(), String> {
        Ok(())
    }
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SavedCredential {
    pub version: u8,
    pub origin: String,
    pub school: String,
    pub email: String,
    pub user_id: String,
    pub bearer: String,
}

pub fn school_code(value: &str) -> Result<String, String> {
    let code = value.trim().to_ascii_lowercase();
    if code.is_empty()
        || code.len() > 63
        || !code
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        || code.starts_with('-')
        || code.ends_with('-')
    {
        return Err("Enter a valid school code.".into());
    }
    Ok(code)
}
fn email(value: &str) -> Result<String, String> {
    let address = value.trim().to_lowercase();
    if address.len() > 254
        || !address.contains('@')
        || address.chars().any(char::is_whitespace)
        || address.chars().any(char::is_control)
    {
        return Err("Enter your email address to use a saved sign-in.".into());
    }
    Ok(address)
}
pub fn credential_key(origin: &str, school: &str, address: &str) -> Result<String, String> {
    let school = school_code(school)?;
    let email = email(address)?;
    Ok(format!(
        "{:x}",
        Sha256::digest(format!("{origin}\0{school}\0{email}").as_bytes())
    ))
}

pub struct CredentialVault {
    store: Arc<dyn CredentialStore>,
}
impl CredentialVault {
    pub fn new(store: Arc<dyn CredentialStore>) -> Self {
        Self { store }
    }
    pub fn load(
        &self,
        origin: &str,
        school: &str,
        address: &str,
    ) -> Result<Option<SavedCredential>, String> {
        let key = credential_key(origin, school, address)?;
        let Some(text) = self.store.read(&key)? else {
            return Ok(None);
        };
        if text.len() > 2300 {
            return Err("The saved sign-in is invalid. Forget it and sign in again.".into());
        }
        let saved: SavedCredential = serde_json::from_str(&text)
            .map_err(|_| "The saved sign-in is invalid. Forget it and sign in again.")?;
        if saved.version != 1
            || saved.origin != origin
            || saved.school != school_code(school)?
            || saved.email != email(address)?
            || saved.user_id.is_empty()
            || saved.user_id.len() > 128
            || saved.bearer.is_empty()
            || saved.bearer.len() > 1024
        {
            return Err(
                "The saved sign-in does not match this account. Forget it and sign in again."
                    .into(),
            );
        }
        Ok(Some(saved))
    }
    pub fn save(&self, mut saved: SavedCredential) -> Result<String, String> {
        saved.school = school_code(&saved.school)?;
        saved.email = email(&saved.email)?;
        if saved.version != 1
            || saved.user_id.is_empty()
            || saved.user_id.len() > 128
            || saved.bearer.is_empty()
            || saved.bearer.len() > 1024
        {
            return Err("The sign-in could not be saved.".into());
        }
        let key = credential_key(&saved.origin, &saved.school, &saved.email)?;
        let text = serde_json::to_string(&saved).map_err(|_| "The sign-in could not be saved.")?;
        // Windows generic credential blobs are bounded; never truncate a token.
        if text.len() > 2300 {
            return Err("The sign-in could not be saved.".into());
        }
        self.store.write(&key, &text)?;
        Ok(key)
    }
    pub fn remove(&self, key: &str) -> Result<(), String> {
        self.store.remove(key)
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use std::{collections::BTreeMap, sync::Mutex};
    #[derive(Default)]
    pub struct MemoryStore(pub Mutex<BTreeMap<String, String>>);
    impl CredentialStore for MemoryStore {
        fn read(&self, k: &str) -> Result<Option<String>, String> {
            Ok(self.0.lock().unwrap().get(k).cloned())
        }
        fn write(&self, k: &str, v: &str) -> Result<(), String> {
            self.0.lock().unwrap().insert(k.into(), v.into());
            Ok(())
        }
        fn remove(&self, k: &str) -> Result<(), String> {
            self.0.lock().unwrap().remove(k);
            Ok(())
        }
    }
    pub fn saved() -> SavedCredential {
        SavedCredential {
            version: 1,
            origin: "https://api.example".into(),
            school: "wesley".into(),
            email: "teacher@example.test".into(),
            user_id: "synthetic-user".into(),
            bearer: "synthetic-bearer".into(),
        }
    }
    #[test]
    fn scopes_are_private_and_isolated() {
        let key = credential_key("https://api.example", "wesley", "Teacher@Example.test ").unwrap();
        assert_eq!(
            key,
            credential_key("https://api.example", "WESLEY", "teacher@example.test").unwrap()
        );
        assert!(!key.contains("teacher"));
        for other in [
            credential_key("https://other.example", "wesley", "teacher@example.test"),
            credential_key("https://api.example", "other", "teacher@example.test"),
            credential_key("https://api.example", "wesley", "other@example.test"),
        ] {
            assert_ne!(key, other.unwrap());
        }
    }
    #[test]
    fn round_trip_metadata_tampering_and_forget() {
        let store = Arc::new(MemoryStore::default());
        let vault = CredentialVault::new(store.clone());
        let key = vault.save(saved()).unwrap();
        assert!(vault
            .load("https://api.example", "other", "teacher@example.test")
            .unwrap()
            .is_none());
        assert_eq!(
            vault
                .load("https://api.example", "wesley", "teacher@example.test")
                .unwrap()
                .unwrap()
                .user_id,
            "synthetic-user"
        );
        let mut bad = saved();
        bad.school = "another".into();
        store
            .0
            .lock()
            .unwrap()
            .insert(key.clone(), serde_json::to_string(&bad).unwrap());
        assert!(vault
            .load("https://api.example", "wesley", "teacher@example.test")
            .is_err());
        vault.remove(&key).unwrap();
        vault.remove(&key).unwrap();
        assert!(vault
            .load("https://api.example", "wesley", "teacher@example.test")
            .unwrap()
            .is_none());
    }
    #[test]
    fn missing_backend_never_falls_back_to_a_file() {
        struct Unavailable;
        impl CredentialStore for Unavailable {
            fn read(&self, _: &str) -> Result<Option<String>, String> {
                Err("unavailable".into())
            }
            fn write(&self, _: &str, _: &str) -> Result<(), String> {
                Err("unavailable".into())
            }
            fn remove(&self, _: &str) -> Result<(), String> {
                Err("unavailable".into())
            }
        }
        let vault = CredentialVault::new(Arc::new(Unavailable));
        assert!(vault.save(saved()).is_err());
        assert!(vault
            .load("https://api.example", "wesley", "teacher@example.test")
            .is_err());
        assert!(vault.remove("synthetic").is_err());
    }
    #[cfg(windows)]
    #[test]
    fn real_windows_credential_manager_round_trip() {
        let store = OsCredentialStore;
        let key = format!(
            "synthetic-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        struct Cleanup<'a>(&'a OsCredentialStore, &'a str);
        impl Drop for Cleanup<'_> {
            fn drop(&mut self) {
                let _ = self.0.remove(self.1);
            }
        }
        let _cleanup = Cleanup(&store, &key);
        store
            .write(&key, "synthetic-credential-never-real")
            .unwrap();
        assert_eq!(
            store.read(&key).unwrap().as_deref(),
            Some("synthetic-credential-never-real")
        );
        store.remove(&key).unwrap();
        assert!(store.read(&key).unwrap().is_none());
    }
}
