// Executable protocol experiment using synthetic records and plain SQLite.
// This is neither the production encrypted store nor the SchoolHub API.
import { DatabaseSync } from 'node:sqlite';

export function connect(path) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
  return db;
}

export function init(clientPath, serverPath) {
  const client = connect(clientPath);
  client.exec(`CREATE TABLE IF NOT EXISTS attendance (student TEXT PRIMARY KEY, status TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS outbox (seq INTEGER PRIMARY KEY AUTOINCREMENT, op_id TEXT UNIQUE NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS attention (op_id TEXT PRIMARY KEY, result TEXT NOT NULL);`);
  client.close();
  const server = connect(serverPath);
  server.exec(`CREATE TABLE IF NOT EXISTS attendance (student TEXT PRIMARY KEY, status TEXT NOT NULL, version INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS operations (op_id TEXT PRIMARY KEY, payload TEXT NOT NULL, result TEXT NOT NULL);`);
  server.close();
}

export function queue(path, opId, payload, checkpoint = () => {}) {
  const db = connect(path);
  try {
    db.exec('BEGIN IMMEDIATE');
    const previous = db.prepare('SELECT payload FROM outbox WHERE op_id = ?').get(opId);
    if (previous) {
      if (previous.payload !== JSON.stringify(payload)) throw new Error('operation-payload-mismatch');
    } else {
      db.prepare(`INSERT INTO attendance VALUES (?, ?)
        ON CONFLICT(student) DO UPDATE SET status=excluded.status`).run(payload.student, payload.status);
      db.prepare('INSERT INTO outbox (op_id, payload) VALUES (?, ?)').run(opId, JSON.stringify(payload));
    }
    checkpoint('client-before-commit');
    db.exec('COMMIT');
    checkpoint('client-after-commit');
  } finally {
    db.close();
  }
}

export function push(clientPath, serverPath, checkpoint = () => {}) {
  const client = connect(clientPath);
  const server = connect(serverPath);
  try {
    for (const command of client.prepare('SELECT * FROM outbox ORDER BY seq').all()) {
      const payload = JSON.parse(command.payload);
      server.exec('BEGIN IMMEDIATE');
      const previous = server.prepare('SELECT * FROM operations WHERE op_id = ?').get(command.op_id);
      let result;
      if (previous) {
        if (previous.payload !== command.payload) throw new Error('operation-payload-mismatch');
        result = JSON.parse(previous.result);
      } else {
        const current = server.prepare('SELECT * FROM attendance WHERE student = ?').get(payload.student);
        result = (current?.version ?? 0) !== payload.baseVersion
          ? { outcome: 'conflict', current: current ?? null }
          : { outcome: 'applied', version: (current?.version ?? 0) + 1 };
        if (result.outcome === 'applied') {
          server.prepare(`INSERT INTO attendance VALUES (?, ?, ?)
            ON CONFLICT(student) DO UPDATE SET status=excluded.status, version=excluded.version`)
            .run(payload.student, payload.status, result.version);
        }
        server.prepare('INSERT INTO operations VALUES (?, ?, ?)')
          .run(command.op_id, command.payload, JSON.stringify(result));
      }
      checkpoint('server-before-commit');
      server.exec('COMMIT');
      checkpoint('server-after-commit');
      // Local acknowledgement and Needs attention transition are atomic too.
      client.exec('BEGIN IMMEDIATE');
      if (result.outcome !== 'applied') {
        client.prepare('INSERT OR REPLACE INTO attention VALUES (?, ?)')
          .run(command.op_id, JSON.stringify(result));
      }
      client.prepare('DELETE FROM outbox WHERE op_id = ?').run(command.op_id);
      checkpoint('ack-before-commit');
      client.exec('COMMIT');
      checkpoint('ack-after-commit');
    }
  } finally {
    client.close();
    server.close();
  }
}
