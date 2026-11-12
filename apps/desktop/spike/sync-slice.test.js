import { describe, expect, it } from "vitest";
import { ChangeLog } from "./change-feed.js";
import { Chaos, CrashError, Device, DurableStore, FlakyTransport, mulberry32, NetworkError, SyncServer } from "./sync-slice.js";

const CLASSES = ["class-a", "class-b", "class-locked"];
const DATES = ["2026-11-02", "2026-11-03"];
const STUDENTS = ["s1", "s2", "s3", "s4"];

/** One randomized run: devices record and sync while crashing and losing packets, then settle. */
async function runScenario(seed) {
  const random = mulberry32(seed);
  const chaos = new Chaos(random);
  const server = new SyncServer({ lockedRegisters: new Set(["class-locked|2026-11-02"]) });
  const stores = [new DurableStore(), new DurableStore(), new DurableStore()].slice(0, 1 + Math.floor(random() * 3));
  const acknowledged = [];
  const device = (index) => new Device({ id: `dev${index}`, store: stores[index], transport: new FlakyTransport(server, chaos), chaos, clock: () => 1_700_000_000_000 });
  let devices = stores.map((_, index) => device(index));
  const steps = 30 + Math.floor(random() * 50);

  for (let step = 0; step < steps; step++) {
    const index = Math.floor(random() * devices.length);
    try {
      if (random() < 0.65) {
        const marks = Object.fromEntries(STUDENTS.filter(() => random() < 0.7).map((s) => [s, random() < 0.8 ? "P" : "A"]));
        if (Object.keys(marks).length === 0) continue;
        const op = devices[index].record(CLASSES[Math.floor(random() * CLASSES.length)], DATES[Math.floor(random() * DATES.length)], marks);
        acknowledged.push({ deviceId: devices[index].id, opId: op.opId });
      } else {
        await devices[index].sync();
      }
    } catch (error) {
      if (error instanceof CrashError) devices[index] = device(index); // the app restarts; only the store survives
      else if (!(error instanceof NetworkError)) throw error;
    }
  }

  chaos.off(); // the connection finally behaves: everything must now settle
  devices = stores.map((_, index) => device(index));
  for (let round = 0; round < 5; round++) for (const d of devices) await d.sync();
  return { server, stores, acknowledged };
}

describe("offline attendance sync slice", () => {
  it("survives 200 randomized crash-and-retry runs without losing or duplicating a record", async () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { server, stores, acknowledged } = await runScenario(seed);
      const context = `seed ${seed}`;

      // 1. Nothing left behind: every outbox is empty once the connection works.
      for (const store of stores) expect(store.state.outbox.size, `${context}: outbox`).toBe(0);

      // 2. Nothing applied twice, however many retries and duplicate deliveries happened.
      for (const [opId, count] of server.applyCount) expect(count, `${context}: ${opId} applied`).toBe(1);

      // 3. Nothing lost: every acknowledged record is either applied on the server or flagged for attention.
      const flagged = new Set(stores.flatMap((store) => [...store.state.needsAttention.keys()]));
      const applied = new Set(server.log.map((entry) => entry.opId));
      for (const { opId } of acknowledged) {
        expect(applied.has(opId) !== flagged.has(opId), `${context}: ${opId} must be applied XOR flagged`).toBe(true);
      }

      // 4. A rejection is explained and is for the locked register only.
      for (const store of stores) {
        for (const { op, code } of store.state.needsAttention.values()) {
          expect(code, context).toBe("REGISTER_LOCKED");
          expect(`${op.payload.classId}|${op.payload.date}`, context).toBe("class-locked|2026-11-02");
        }
      }

      // 5. Server state is exactly what replaying its own log gives: the last applied command for each cell wins.
      const replayed = new Map();
      for (const { opId, payload } of server.log) {
        for (const [studentId, status] of Object.entries(payload.marks)) replayed.set(`${payload.classId}|${payload.date}|${studentId}`, { status, opId });
      }
      expect(server.attendance, context).toEqual(replayed);
    }
  });

  it("is reproducible: the same seed gives the same outcome", async () => {
    const a = await runScenario(42);
    const b = await runScenario(42);
    expect(a.server.log).toEqual(b.server.log);
    expect(a.acknowledged).toEqual(b.acknowledged);
  });

  it("a crash in the middle of recording leaves neither the data nor the command", () => {
    const store = new DurableStore();
    const chaos = new Chaos(() => 0, { crash: 1 });
    const device = new Device({ id: "d", store, transport: null, chaos });
    expect(() => device.record("class-a", "2026-11-02", { s1: "P" })).toThrow(CrashError);
    expect(store.state.attendance.size).toBe(0);
    expect(store.state.outbox.size).toBe(0);
    expect(store.state.seq).toBe(0);
  });

  it("when the response is lost after the server applied a command, the retry is recognised, not re-applied", async () => {
    const server = new SyncServer();
    const store = new DurableStore();
    const quiet = new Chaos(() => 0, { crash: 0, dropRequest: 0, partial: 0, duplicate: 0, dropResponse: 1 });
    const flaky = new Device({ id: "d", store, transport: new FlakyTransport(server, quiet), chaos: quiet });
    flaky.record("class-a", "2026-11-02", { s1: "P" });
    await expect(flaky.sync()).rejects.toBeInstanceOf(NetworkError);
    expect(server.log).toHaveLength(1); // the server did apply it
    expect(store.state.outbox.size).toBe(1); // but the device does not know
    quiet.off();
    await flaky.sync();
    expect(server.log).toHaveLength(1); // not applied a second time
    expect(server.applyCount.get("d-1")).toBe(1);
    expect(store.state.outbox.size).toBe(0);
  });

  it("flags a locked register instead of dropping it, and keeps the command", async () => {
    const server = new SyncServer({ lockedRegisters: new Set(["class-a|2026-11-02"]) });
    const store = new DurableStore();
    const chaos = new Chaos(() => 0, { crash: 0, dropRequest: 0, dropResponse: 0, duplicate: 0, partial: 0 });
    const device = new Device({ id: "d", store, transport: new FlakyTransport(server, chaos), chaos });
    device.record("class-a", "2026-11-02", { s1: "P" });
    await device.sync();
    expect(store.state.outbox.size).toBe(0);
    expect([...store.state.needsAttention.values()][0].code).toBe("REGISTER_LOCKED");
    expect(server.attendance.size).toBe(0);
  });
});

describe("change feed cursor", () => {
  /** Transactions that start and commit in different orders, with the client pulling between steps. */
  function interleave(seed, pull) {
    const random = mulberry32(seed);
    const log = new ChangeLog();
    const open = [];
    const delivered = [];
    let cursor = 0;
    const take = () => { const result = pull(log, cursor); cursor = result.cursor; delivered.push(...result.rows.map((row) => row.seq)); };
    for (let step = 0; step < 40; step++) {
      const roll = random();
      if (roll < 0.35 || open.length === 0) { const tx = log.begin(); log.write(tx, `e${step}`); open.push(tx); }
      else if (roll < 0.8) { const tx = open.splice(Math.floor(random() * open.length), 1)[0]; log.commit(tx); }
      else take();
    }
    for (const tx of open) log.commit(tx);
    take();
    take();
    return { delivered, written: log.rows.map((row) => row.seq) };
  }

  it("the safe cursor delivers every change exactly once, in order, however commits interleave", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { delivered, written } = interleave(seed, (log, cursor) => log.safePull(cursor));
      expect(delivered, `seed ${seed}`).toEqual(written);
    }
  });

  it("the naive 'highest seen' cursor really does skip changes (why the horizon rule exists)", () => {
    let runsWithSkips = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const { delivered, written } = interleave(seed, (log, cursor) => log.naivePull(cursor));
      if (delivered.length < written.length) runsWithSkips++;
    }
    expect(runsWithSkips).toBeGreaterThan(0);
  });
});
