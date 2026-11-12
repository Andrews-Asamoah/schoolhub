// Reference model of the offline sync slice (attendance), used in Phase 0 to prove the protocol
// before any server code exists. It models three things precisely:
//   - DurableStore: a SQLite file. A transaction is atomic and committed data survives a crash.
//   - SyncServer:   an operation ledger keyed by device and opId, so a retry never applies twice.
//   - Device:       writes data and its outbox command in ONE transaction, then pushes.
// The same rules become the real API's tests in Phase 2. Pure JavaScript, no dependencies, so the
// spike screen can import it too.

export class CrashError extends Error {
  constructor(point) { super(`crash at ${point}`); this.name = "CrashError"; this.point = point; }
}
export class NetworkError extends Error {
  constructor(kind) { super(`network ${kind}`); this.name = "NetworkError"; this.kind = kind; }
}

/** Small seeded generator, so every failing run can be replayed from its seed. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Failure injection. Rates are per opportunity; `off()` stops all failures so a run can settle. */
export class Chaos {
  constructor(random, rates = {}) {
    this.random = random;
    this.rates = { crash: 0.06, dropRequest: 0.1, dropResponse: 0.12, duplicate: 0.08, partial: 0.08, ...rates };
    this.active = true;
  }
  off() { this.active = false; }
  roll(kind) { return this.active && this.random() < (this.rates[kind] ?? 0); }
  point(name) { if (this.roll("crash")) throw new CrashError(name); }
}

/** Models one SQLite file: transactions are all-or-nothing, and committed state outlives crashes. */
export class DurableStore {
  constructor() {
    this.state = { seq: 0, attendance: new Map(), outbox: new Map(), needsAttention: new Map() };
  }
  /** Runs `work` on a private copy. If it throws (including a crash) nothing changes. */
  transaction(work) {
    const draft = structuredClone(this.state);
    const result = work(draft);
    this.state = draft; // commit
    return result;
  }
}

/** The server's operation ledger. Locked registers are rejected, as the real API would. */
export class SyncServer {
  constructor({ lockedRegisters = new Set() } = {}) {
    this.lockedRegisters = lockedRegisters;
    this.ledger = new Map(); // `${deviceId}:${opId}` -> stored result
    this.attendance = new Map(); // `${classId}|${date}|${studentId}` -> { status, opId }
    this.applyCount = new Map(); // opId -> times the effect was applied (must never exceed 1)
    this.log = []; // applied operations, in the order the server applied them
  }

  push(deviceId, ops) {
    return [...ops].sort((a, b) => a.seq - b.seq).map((op) => {
      const key = `${deviceId}:${op.opId}`;
      const known = this.ledger.get(key);
      if (known) return { ...known, replayed: true };
      let result;
      if (this.lockedRegisters.has(`${op.payload.classId}|${op.payload.date}`)) {
        result = { opId: op.opId, status: "rejected", code: "REGISTER_LOCKED" };
      } else {
        for (const [studentId, status] of Object.entries(op.payload.marks)) {
          this.attendance.set(`${op.payload.classId}|${op.payload.date}|${studentId}`, { status, opId: op.opId });
        }
        this.applyCount.set(op.opId, (this.applyCount.get(op.opId) ?? 0) + 1);
        this.log.push({ deviceId, opId: op.opId, payload: op.payload });
        result = { opId: op.opId, status: "applied" };
      }
      this.ledger.set(key, result);
      return { ...result, replayed: false };
    });
  }
}

/** A connection that fails the ways real slow links fail. */
export class FlakyTransport {
  constructor(server, chaos) { this.server = server; this.chaos = chaos; }

  async push(deviceId, ops) {
    if (this.chaos.roll("dropRequest")) throw new NetworkError("request lost");
    if (this.chaos.roll("partial") && ops.length > 1) {
      // The connection dies part-way: the server applied only the first few commands.
      this.server.push(deviceId, ops.slice(0, 1 + Math.floor(this.chaos.random() * (ops.length - 1))));
      throw new NetworkError("connection cut mid-batch");
    }
    let results = this.server.push(deviceId, ops);
    if (this.chaos.roll("duplicate")) results = this.server.push(deviceId, ops); // delivered twice
    if (this.chaos.roll("dropResponse")) throw new NetworkError("response lost after the server applied it");
    return results;
  }
}

export class Device {
  constructor({ id, store, transport, chaos, clock = () => Date.now() }) {
    Object.assign(this, { id, store, transport, chaos, clock });
  }

  /** Records attendance. The data and its outbox command commit together or not at all. */
  record(classId, date, marks) {
    return this.store.transaction((draft) => {
      draft.seq += 1;
      const op = {
        opId: `${this.id}-${draft.seq}`,
        seq: draft.seq,
        type: "attendance.record",
        payload: { classId, date, marks },
        capturedAt: this.clock(),
      };
      for (const [studentId, status] of Object.entries(marks)) draft.attendance.set(`${classId}|${date}|${studentId}`, status);
      draft.outbox.set(op.opId, op);
      this.chaos.point("record:mid-transaction");
      return op;
    });
  }

  /** Sends pending commands and settles each answer. Safe to call again after any failure. */
  async sync() {
    const pending = [...this.store.state.outbox.values()].sort((a, b) => a.seq - b.seq);
    if (pending.length === 0) return 0;
    this.chaos.point("sync:before-send");
    const results = await this.transport.push(this.id, pending);
    this.chaos.point("sync:response-received-not-yet-recorded");
    this.store.transaction((draft) => {
      for (const result of results) {
        const op = draft.outbox.get(result.opId);
        if (!op) continue;
        if (result.status !== "applied") draft.needsAttention.set(result.opId, { op, code: result.code ?? result.status });
        draft.outbox.delete(result.opId); // never dropped silently: it is either applied or in needsAttention
      }
      this.chaos.point("sync:mid-settle");
    });
    return results.length;
  }
}
