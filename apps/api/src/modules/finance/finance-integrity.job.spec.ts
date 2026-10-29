import { describe, expect, it, vi } from "vitest";
import { financeIntegrityDueDay, FinanceIntegrityJob } from "./finance-integrity.job.js";
describe("durable daily finance scheduling", () => {
  it("catches up after the scheduled hour and handles midnight boundaries", () => {
    expect(financeIntegrityDueDay(new Date("2026-10-29T01:59:00Z"))).toBe("2026-10-28");
    expect(financeIntegrityDueDay(new Date("2026-10-29T02:00:00Z"))).toBe("2026-10-29");
    expect(financeIntegrityDueDay(new Date("2026-10-29T18:00:00Z"))).toBe("2026-10-29");
  });
  it("does not schedule duplicates when restarted and uses per-school checks", async () => {
    const enqueue = vi.fn(); const run = vi.fn().mockImplementation(async (_id, handler) => handler({ schoolId: "school-a", scheduledDay: "2026-10-29" }));
    const integrity = { check: vi.fn().mockResolvedValue({ I1: { status: "PASS" }, I2: { status: "PASS" }, I3: { status: "PASS" } }) };
    const prisma = { client: { school: { findMany: vi.fn().mockResolvedValue([{ id: "school-a" }]), findUnique: vi.fn().mockResolvedValue({ id: "school-a" }) },
      backgroundJob: { findMany: vi.fn().mockResolvedValue([{ id: "daily-job" }]) } } };
    const worker = new FinanceIntegrityJob(prisma as never, integrity as never, { enqueue, run } as never);
    await worker.tick(new Date("2026-10-29T18:00:00Z"));
    await worker.tick(new Date("2026-10-29T19:00:00Z"));
    expect(enqueue.mock.calls.map(args => args[0])).toEqual(["finance-integrity:school-a:2026-10-29", "finance-integrity:school-a:2026-10-29"]);
    expect(integrity.check).toHaveBeenCalledWith("school-a");
  });
});
