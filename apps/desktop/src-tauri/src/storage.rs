//! Synthetic-data feasibility storage, deliberately not connected to application IPC.
//! A production implementation must obtain a per-account key from the OS store,
//! verify a server-issued identity/lease, and back up before forward migrations.
use rusqlite::{params, Connection, Result};
use std::path::Path;

fn open(path: &Path, key: &str) -> Result<Connection> {
    let db = Connection::open(path)?;
    db.pragma_update(None, "key", key)?;
    // Fail closed if an unencrypted SQLite library was linked accidentally.
    let cipher: String = db.pragma_query_value(None, "cipher_version", |row| row.get(0))?;
    if cipher.is_empty() {
        return Err(rusqlite::Error::InvalidQuery);
    }
    // Forces a key check before touching schema or returning the connection.
    db.query_row("SELECT count(*) FROM sqlite_master", [], |row| {
        row.get::<_, i64>(0)
    })?;
    db.pragma_update(None, "journal_mode", "WAL")?;
    db.pragma_update(None, "synchronous", "FULL")?;
    let version: i64 = db.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if version > 1 {
        return Err(rusqlite::Error::InvalidQuery);
    }
    if version == 0 {
        db.execute_batch(
            "BEGIN IMMEDIATE;
             CREATE TABLE attendance (student_id TEXT PRIMARY KEY, status TEXT NOT NULL);
             CREATE TABLE outbox (sequence INTEGER PRIMARY KEY AUTOINCREMENT,
               op_id TEXT NOT NULL UNIQUE, payload TEXT NOT NULL);
             PRAGMA user_version = 1;
             COMMIT;",
        )?;
    }
    Ok(db)
}

fn record(db: &mut Connection, op_id: &str, status: &str, fail: bool) -> Result<()> {
    let tx = db.transaction()?;
    tx.execute(
        "INSERT INTO attendance VALUES ('synthetic-student', ?1)
                ON CONFLICT(student_id) DO UPDATE SET status = excluded.status",
        [status],
    )?;
    if fail {
        return Err(rusqlite::Error::InvalidQuery);
    }
    let payload =
        serde_json::json!({"studentId": "synthetic-student", "status": status}).to_string();
    tx.execute(
        "INSERT INTO outbox (op_id, payload) VALUES (?1, ?2)",
        params![op_id, payload],
    )?;
    tx.commit()
}

#[test]
fn cipher_reopen_wrong_key_atomicity_and_forward_version() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("synthetic.db");
    let mut db = open(&path, "synthetic-test-key-never-use-in-production").unwrap();
    record(&mut db, "operation-1", "PRESENT", false).unwrap();
    assert!(record(&mut db, "operation-2", "ABSENT", true).is_err());
    let status: String = db
        .query_row("SELECT status FROM attendance", [], |r| r.get(0))
        .unwrap();
    assert_eq!(status, "PRESENT");
    // Duplicate outbox insertion must also roll back the corresponding local edit.
    assert!(record(&mut db, "operation-1", "ABSENT", false).is_err());
    let status: String = db
        .query_row("SELECT status FROM attendance", [], |r| r.get(0))
        .unwrap();
    assert_eq!(status, "PRESENT");
    drop(db);
    assert!(open(&path, "wrong-key").is_err());
    let db = open(&path, "synthetic-test-key-never-use-in-production").unwrap();
    let count: i64 = db
        .query_row("SELECT count(*) FROM outbox", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 1);
    let header = std::fs::read(&path).unwrap();
    assert_ne!(&header[..16], b"SQLite format 3\0");
    assert!(!header
        .windows(b"synthetic-student".len())
        .any(|w| w == b"synthetic-student"));
    db.pragma_update(None, "user_version", 2).unwrap();
    drop(db);
    assert!(open(&path, "synthetic-test-key-never-use-in-production").is_err());
}
