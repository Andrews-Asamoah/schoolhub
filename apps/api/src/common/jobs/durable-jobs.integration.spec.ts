import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { DurableJobsService } from "./durable-jobs.service.js";

const url = process.env.TEST_DATABASE_URL ?? "";
const enabled = (() => { try { return /test/i.test(new URL(url).pathname); } catch { return false; } })();
describe.skipIf(!enabled)("durable job claims and recovery (PostgreSQL)", () => {
  let db: PrismaClient;
  let jobs: DurableJobsService;
  const prefix = `jobs-test-${Date.now()}-`;
  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = (await import("../../prisma/prisma.client.js")).prisma;
    jobs = new DurableJobsService({ client: db } as never);
  });
  afterAll(async () => { if (db) { await db.backgroundJob.deleteMany({ where: { id: { startsWith: prefix } } }); await db.$disconnect(); } });
  it("deduplicates schedules and only one replica claims a pending job", async () => {
    const id = prefix + "concurrent";
    await Promise.all(Array.from({ length: 4 }, () => jobs.enqueue(id, "test", null, {})));
    let calls = 0;
    await Promise.all(Array.from({ length: 6 }, () => jobs.run(id, async () => { calls++; })));
    expect(calls).toBe(1);
    expect((await db.backgroundJob.findUniqueOrThrow({ where: { id } })).status).toBe("SUCCEEDED");
    await jobs.run(id, async () => { calls++; }); expect(calls).toBe(1);
  });
  it("persists failures and backoff rather than marking the schedule complete", async () => {
    const id = prefix + "retry";
    await jobs.enqueue(id, "test", null, {});
    await jobs.run(id, async () => { throw new Error("secret provider information"); });
    const row = await db.backgroundJob.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("PENDING"); expect(row.attempts).toBe(1); expect(row.completedAt).toBeNull();
    expect(row.nextAttempt.getTime()).toBeGreaterThan(Date.now()); expect(row.lastError).not.toContain("secret");
    await db.backgroundJob.update({ where: { id }, data: { nextAttempt: new Date(0) } });
    await new DurableJobsService({ client: db } as never).run(id, async () => {});
    expect((await db.backgroundJob.findUniqueOrThrow({ where: { id } })).status).toBe("SUCCEEDED");
  });
  it("recovers an expired worker lease and fences stale ownership", async () => {
    const id = prefix + "stale";
    await jobs.enqueue(id, "test", null, {});
    await db.backgroundJob.update({ where: { id }, data: { status: "RUNNING", leaseToken: "old-worker", leaseUntil: new Date(0), attempts: 1 } });
    await jobs.run(id, async () => {});
    const stale = await db.backgroundJob.updateMany({ where: { id, leaseToken: "old-worker" }, data: { status: "PENDING" } });
    expect(stale.count).toBe(0);
    expect((await db.backgroundJob.findUniqueOrThrow({ where: { id } })).attempts).toBe(2);
  });
  it("dead-letters a repeatedly crashed worker after its lease expires", async () => {
    const id = prefix + "dead";
    await jobs.enqueue(id, "test", null, {});
    await db.backgroundJob.update({ where: { id }, data: { status: "RUNNING", leaseToken: "crashed", leaseUntil: new Date(0), attempts: 5 } });
    let called = false; await jobs.run(id, async () => { called = true; });
    expect(called).toBe(false); expect((await db.backgroundJob.findUniqueOrThrow({ where: { id } })).status).toBe("DEAD");
  });
});
