//! Non-secret installation metadata. Credentials never go into these files.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::Path,
};
use uuid::Uuid;

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Installation {
    version: u8,
    id: String,
}
const ERROR: &str =
    "Could not read this installation's identity. Contact support before resetting it.";

pub(crate) fn identity(
    root: &Path,
    origin: &str,
    school: &str,
    user_id: &str,
) -> Result<String, String> {
    fs::create_dir_all(root).map_err(|_| ERROR)?;
    let scope = format!(
        "{:x}",
        Sha256::digest(format!("{origin}\0{school}\0{user_id}").as_bytes())
    );
    let target = root.join(format!("{scope}.json"));
    if !target.exists() {
        let metadata = Installation {
            version: 1,
            id: Uuid::new_v4().to_string(),
        };
        // Publish a complete file atomically. Concurrent processes converge on
        // the first file; never read a partly written UUID or replace an old one.
        let temporary = root.join(format!("{}.tmp", Uuid::new_v4()));
        let result = (|| -> Result<(), String> {
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary)
                .map_err(|_| ERROR)?;
            file.write_all(&serde_json::to_vec(&metadata).map_err(|_| ERROR)?)
                .map_err(|_| ERROR)?;
            file.sync_all().map_err(|_| ERROR)?;
            drop(file);
            match fs::hard_link(&temporary, &target) {
                Ok(()) => Ok(()),
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => Ok(()),
                Err(_) => Err(ERROR.into()),
            }
        })();
        let _ = fs::remove_file(temporary);
        result?;
    }
    let mut bytes = Vec::new();
    fs::File::open(target)
        .map_err(|_| ERROR)?
        .take(257)
        .read_to_end(&mut bytes)
        .map_err(|_| ERROR)?;
    if bytes.len() > 256 {
        return Err(ERROR.into());
    }
    let metadata: Installation = serde_json::from_slice(&bytes).map_err(|_| ERROR)?;
    let parsed = Uuid::parse_str(&metadata.id).map_err(|_| ERROR)?;
    if metadata.version != 1 || parsed.get_version_num() != 4 {
        return Err(ERROR.into());
    }
    Ok(parsed.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn persists_across_restarts_and_scopes_without_account_names() {
        let dir = tempfile::tempdir().unwrap();
        let first = identity(
            dir.path(),
            "https://api.example",
            "wesley",
            "synthetic-user",
        )
        .unwrap();
        assert_eq!(
            first,
            identity(
                dir.path(),
                "https://api.example",
                "wesley",
                "synthetic-user"
            )
            .unwrap()
        );
        assert_ne!(
            first,
            identity(
                dir.path(),
                "https://api.example",
                "another",
                "synthetic-user"
            )
            .unwrap()
        );
        assert_ne!(
            first,
            identity(dir.path(), "https://api.example", "wesley", "other-user").unwrap()
        );
        assert_ne!(
            first,
            identity(
                dir.path(),
                "https://other.example",
                "wesley",
                "synthetic-user"
            )
            .unwrap()
        );
        for entry in fs::read_dir(dir.path()).unwrap() {
            assert!(!entry
                .unwrap()
                .file_name()
                .to_string_lossy()
                .contains("synthetic"));
        }
    }
    #[test]
    fn concurrent_processes_converge_and_corruption_never_rotates_identity() {
        let dir = tempfile::tempdir().unwrap();
        let handles: Vec<_> = (0..8)
            .map(|_| {
                let path = dir.path().to_path_buf();
                std::thread::spawn(move || {
                    identity(&path, "https://api.example", "wesley", "user").unwrap()
                })
            })
            .collect();
        let ids: Vec<_> = handles
            .into_iter()
            .map(|handle| handle.join().unwrap())
            .collect();
        assert!(ids.iter().all(|id| id == &ids[0]));
        let file = fs::read_dir(dir.path())
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        fs::write(file, b"broken").unwrap();
        assert!(identity(dir.path(), "https://api.example", "wesley", "user").is_err());
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }
}
