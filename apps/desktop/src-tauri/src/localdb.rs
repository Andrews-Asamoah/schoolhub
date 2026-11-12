//! The encrypted local database (SQLite with SQLCipher). The webview never opens the file: it calls
//! a narrow set of commands that run here, so the key stays in Rust.

use rusqlite::{params_from_iter, types::Value as SqlValue, types::ValueRef, Connection};
use serde::Deserialize;
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("database error: {0}")]
    Sql(#[from] rusqlite::Error),
    #[error("{0}")]
    Invalid(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Debug, Deserialize)]
pub struct Statement {
    pub sql: String,
    #[serde(default)]
    pub params: Vec<Value>,
}

pub struct Database {
    conn: Connection,
    path: PathBuf,
}

/// What `db_inspect` reports, used to prove the file on disk is not plain SQLite.
#[derive(Debug, serde::Serialize)]
pub struct Inspection {
    pub path: String,
    pub bytes: u64,
    pub plaintext_header: bool,
    pub cipher_version: Option<String>,
}

const SQLITE_MAGIC: &[u8] = b"SQLite format 3\0";

fn to_sql(value: &Value) -> Result<SqlValue, DbError> {
    Ok(match value {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(*b as i64),
        Value::Number(n) => match n.as_i64() {
            Some(i) => SqlValue::Integer(i),
            None => SqlValue::Real(n.as_f64().ok_or_else(|| DbError::Invalid("number out of range".into()))?),
        },
        Value::String(s) => SqlValue::Text(s.clone()),
        // Callers store structured data as JSON text, so the database never guesses at shapes.
        Value::Array(_) | Value::Object(_) => return Err(DbError::Invalid("parameters must be null, boolean, number or string".into())),
    })
}

fn from_sql(value: ValueRef<'_>) -> Value {
    match value {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::from(i),
        ValueRef::Real(f) => serde_json::Number::from_f64(f).map(Value::Number).unwrap_or(Value::Null),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(b) => Value::String(hex::encode(b)),
    }
}

impl Database {
    /// Opens (or creates) the database with a 256-bit key given as 64 hex characters. A wrong key
    /// fails here, not later, because the first read cannot decrypt the file.
    pub fn open(path: &Path, key_hex: &str) -> Result<Self, DbError> {
        if key_hex.len() != 64 || !key_hex.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err(DbError::Invalid("the database key must be 64 hex characters".into()));
        }
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        conn.execute_batch(&format!("PRAGMA key = \"x'{key_hex}'\";"))?;
        // Forces a decrypt: fails with "file is not a database" on a wrong key.
        conn.query_row("SELECT count(*) FROM sqlite_master", [], |row| row.get::<_, i64>(0))?;
        // Durable by default: the outbox is written in the same transaction as the data it describes,
        // so a power cut must never lose one without the other.
        conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;")?;
        Ok(Self { conn, path: path.to_path_buf() })
    }

    pub fn exec(&self, sql: &str, params: &[Value]) -> Result<usize, DbError> {
        let values = params.iter().map(to_sql).collect::<Result<Vec<_>, _>>()?;
        Ok(self.conn.execute(sql, params_from_iter(values))?)
    }

    pub fn query(&self, sql: &str, params: &[Value]) -> Result<Vec<Map<String, Value>>, DbError> {
        let values = params.iter().map(to_sql).collect::<Result<Vec<_>, _>>()?;
        let mut stmt = self.conn.prepare(sql)?;
        let names: Vec<String> = stmt.column_names().iter().map(|n| n.to_string()).collect();
        let mut rows = stmt.query(params_from_iter(values))?;
        let mut out = Vec::new();
        while let Some(row) = rows.next()? {
            let mut map = Map::new();
            for (index, name) in names.iter().enumerate() {
                map.insert(name.clone(), from_sql(row.get_ref(index)?));
            }
            out.push(map);
        }
        Ok(out)
    }

    /// All statements or none. Returns the rows changed by each.
    pub fn transaction(&mut self, statements: &[Statement]) -> Result<Vec<usize>, DbError> {
        let tx = self.conn.transaction()?;
        let mut changed = Vec::with_capacity(statements.len());
        for statement in statements {
            let values = statement.params.iter().map(to_sql).collect::<Result<Vec<_>, _>>()?;
            changed.push(tx.execute(&statement.sql, params_from_iter(values))?);
        }
        tx.commit()?;
        Ok(changed)
    }

    pub fn inspect(&self) -> Result<Inspection, DbError> {
        let mut header = [0u8; 16];
        {
            use std::io::Read;
            let mut file = std::fs::File::open(&self.path)?;
            let _ = file.read(&mut header)?;
        }
        let cipher_version = self.conn.query_row("PRAGMA cipher_version", [], |row| row.get::<_, String>(0)).ok();
        Ok(Inspection {
            path: self.path.display().to_string(),
            bytes: std::fs::metadata(&self.path)?.len(),
            plaintext_header: header.starts_with(SQLITE_MAGIC),
            cipher_version,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const KEY: &str = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
    const OTHER: &str = "ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100";

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("schoolhub-db-test-{}-{}", std::process::id(), name));
        let _ = std::fs::remove_dir_all(&dir);
        dir.join("test.sqlite")
    }

    #[test]
    fn the_file_on_disk_is_encrypted() {
        let path = temp("encrypted");
        let db = Database::open(&path, KEY).unwrap();
        db.exec("CREATE TABLE pupils (name TEXT)", &[]).unwrap();
        db.exec("INSERT INTO pupils VALUES (?)", &[json!("Ama Mensah")]).unwrap();
        let info = db.inspect().unwrap();
        assert!(!info.plaintext_header, "the file must not start with the SQLite header");
        assert!(info.cipher_version.is_some(), "SQLCipher must be compiled in");
        drop(db);
        let raw = std::fs::read(&path).unwrap();
        assert!(!raw.windows(10).any(|w| w == b"Ama Mensah"), "stored names must not appear in plain text");
    }

    #[test]
    fn a_wrong_key_cannot_open_the_file() {
        let path = temp("wrongkey");
        Database::open(&path, KEY).unwrap().exec("CREATE TABLE t (x INTEGER)", &[]).unwrap();
        assert!(Database::open(&path, OTHER).is_err());
        assert!(Database::open(&path, KEY).is_ok());
    }

    #[test]
    fn rejects_a_malformed_key() {
        assert!(matches!(Database::open(&temp("badkey"), "short"), Err(DbError::Invalid(_))));
    }

    #[test]
    fn round_trips_every_parameter_type() {
        let db = Database::open(&temp("types"), KEY).unwrap();
        db.exec("CREATE TABLE t (n INTEGER, f REAL, s TEXT, b INTEGER, z TEXT)", &[]).unwrap();
        db.exec("INSERT INTO t VALUES (?, ?, ?, ?, ?)", &[json!(42), json!(2.5), json!("text"), json!(true), Value::Null]).unwrap();
        let rows = db.query("SELECT * FROM t", &[]).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["n"], json!(42));
        assert_eq!(rows[0]["f"], json!(2.5));
        assert_eq!(rows[0]["s"], json!("text"));
        assert_eq!(rows[0]["b"], json!(1));
        assert_eq!(rows[0]["z"], Value::Null);
    }

    #[test]
    fn refuses_object_parameters() {
        let db = Database::open(&temp("object"), KEY).unwrap();
        db.exec("CREATE TABLE t (x TEXT)", &[]).unwrap();
        assert!(db.exec("INSERT INTO t VALUES (?)", &[json!({"a": 1})]).is_err());
    }

    #[test]
    fn a_failed_transaction_changes_nothing() {
        let mut db = Database::open(&temp("rollback"), KEY).unwrap();
        db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY)", &[]).unwrap();
        let statements = vec![
            Statement { sql: "INSERT INTO t VALUES (1)".into(), params: vec![] },
            Statement { sql: "INSERT INTO t VALUES (2)".into(), params: vec![] },
            Statement { sql: "INSERT INTO t VALUES (1)".into(), params: vec![] }, // duplicate key
        ];
        assert!(db.transaction(&statements).is_err());
        assert_eq!(db.query("SELECT count(*) AS n FROM t", &[]).unwrap()[0]["n"], json!(0));
    }

    #[test]
    fn data_survives_closing_and_reopening() {
        let path = temp("reopen");
        let mut db = Database::open(&path, KEY).unwrap();
        db.exec("CREATE TABLE outbox (id TEXT PRIMARY KEY)", &[]).unwrap();
        db.transaction(&[Statement { sql: "INSERT INTO outbox VALUES (?)".into(), params: vec![json!("op-1")] }]).unwrap();
        drop(db);
        let db = Database::open(&path, KEY).unwrap();
        assert_eq!(db.query("SELECT id FROM outbox", &[]).unwrap()[0]["id"], json!("op-1"));
    }
}
