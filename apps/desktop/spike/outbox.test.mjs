import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { init, connect, queue, push } from './outbox-model.mjs';

function fixture(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'schoolhub-desktop-'));
  const client = join(dir, 'client.db');
  const server = join(dir, 'server.db');
  init(client, server);
  try { fn(client, server); } finally { rmSync(dir, { recursive: true, force: true }); }
}
function rows(path, sql) {
  const db = connect(path);
  try { return db.prepare(sql).all().map(r => ({ ...r })); } finally { db.close(); }
}

test('100 seeded process-termination and retry rounds preserve every acknowledged record exactly once', () => {
  fixture((client, server) => {
    let seed = 20261111;
    const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
    function crash(mode, id, student, stage) {
      const result = spawnSync(process.execPath, [fileURLToPath(new URL('./crash-worker.mjs', import.meta.url)),
        mode, client, server, id, student, stage], { encoding: 'utf8', timeout: 10000 });
      assert.ifError(result.error);
      assert(result.signal === 'SIGKILL' || (process.platform === 'win32' && result.status !== 0),
        `Worker did not terminate at ${stage}: ${result.status} ${result.stderr}`);
    }
    for (let i = 0; i < 100; i++) {
      const id = `synthetic-operation-${i}`;
      const student = `synthetic-student-${i}`;
      crash('queue', id, student, ['client-before-commit', 'client-after-commit'][random(2)]);
      const local = rows(client, 'SELECT * FROM attendance').length;
      const pending = rows(client, 'SELECT * FROM outbox').length;
      assert.equal(local, i + pending, 'local edit and outbox must commit together');
      queue(client, id, { student, status: 'PRESENT', baseVersion: 0 });
      crash('push', id, student, ['server-before-commit', 'server-after-commit', 'ack-before-commit', 'ack-after-commit'][random(4)]);
      push(client, server);
      assert.equal(rows(client, 'SELECT * FROM outbox').length, 0);
      assert.equal(rows(server, 'SELECT * FROM operations').length, i + 1);
      assert.equal(rows(server, 'SELECT * FROM attendance').length, i + 1);
      assert(rows(server, 'SELECT * FROM attendance').every(r => r.version === 1));
    }
    assert.deepEqual(rows(client, 'SELECT * FROM attendance ORDER BY student'),
      rows(server, 'SELECT student, status FROM attendance ORDER BY student'));
  });
});

test('stale writes preserve the server value and move to Needs attention', () => {
  fixture((client, server) => {
    queue(client, 'first', { student: 'synthetic', status: 'PRESENT', baseVersion: 0 });
    push(client, server);
    queue(client, 'stale', { student: 'synthetic', status: 'ABSENT', baseVersion: 0 });
    push(client, server);
    assert.equal(rows(server, 'SELECT * FROM attendance')[0].status, 'PRESENT');
    const attention = rows(client, 'SELECT * FROM attention');
    assert.equal(attention.length, 1);
    assert.equal(JSON.parse(attention[0].result).outcome, 'conflict');
    assert.equal(rows(client, 'SELECT * FROM outbox').length, 0);
  });
});

test('reusing an operation id for changed data rolls back the local edit', () => {
  fixture((client) => {
    queue(client, 'same', { student: 'synthetic', status: 'PRESENT', baseVersion: 0 });
    assert.throws(() => queue(client, 'same', { student: 'synthetic', status: 'ABSENT', baseVersion: 0 }), /payload-mismatch/);
    assert.equal(rows(client, 'SELECT * FROM attendance')[0].status, 'PRESENT');
    assert.equal(rows(client, 'SELECT * FROM outbox').length, 1);
  });
});
