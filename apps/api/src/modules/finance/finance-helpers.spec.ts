import { describe, expect, it, vi } from "vitest";
import { createSequence, isIdempotencyRace, isSerializationFailure, withSerializableRetry } from "./finance.helpers.js";

describe("createSequence", () => {
  it("starts at 00001 for a new prefix", () => {
    const seq = createSequence([], "RCT-2026-");
    expect(seq.next()).toBe("RCT-2026-00001");
    expect(seq.next()).toBe("RCT-2026-00002");
  });
  it("continues after the highest existing number, including legacy random ones", () => {
    const seq = createSequence(["RCT-2026-00007", "RCT-2026-48213", "RCT-2026-00002"], "RCT-2026-");
    expect(seq.next()).toBe("RCT-2026-48214");
  });
  it("sorts numerically, not alphabetically", () => {
    const seq = createSequence(["INV-2026-99999", "INV-2026-100000"], "INV-2026-");
    expect(seq.next()).toBe("INV-2026-100001");
  });
  it("ignores other prefixes, nulls and malformed suffixes", () => {
    const seq = createSequence(["RCT-2025-00500", null, "RCT-2026-abc", "RCT-2026-"], "RCT-2026-");
    expect(seq.next()).toBe("RCT-2026-00001");
  });
  it("never repeats a number across a bulk run", () => {
    const seq = createSequence([], "INV-2026-");
    const issued = new Set(Array.from({ length: 500 }, () => seq.next()));
    expect(issued.size).toBe(500);
  });
});

describe("isSerializationFailure", () => {
  it("recognises Prisma P2034 and Postgres 40001/40P01", () => {
    expect(isSerializationFailure({ code: "P2034" })).toBe(true);
    expect(isSerializationFailure({ meta: { code: "40001" } })).toBe(true);
    expect(isSerializationFailure({ meta: { code: "40P01" } })).toBe(true);
    expect(isSerializationFailure(new Error("could not serialize access due to concurrent update"))).toBe(true);
  });
  it("does not match unrelated errors", () => {
    expect(isSerializationFailure(new Error("boom"))).toBe(false);
    expect(isSerializationFailure({ code: "P2002" })).toBe(false);
    expect(isSerializationFailure(null)).toBe(false);
  });
});

describe("withSerializableRetry", () => {
  it("retries a serialization failure and then succeeds", async () => {
    const run = vi.fn().mockRejectedValueOnce({ code: "P2034" }).mockRejectedValueOnce({ code: "P2034" }).mockResolvedValue("ok");
    await expect(withSerializableRetry(run, { baseDelayMs: 1 })).resolves.toBe("ok");
    expect(run).toHaveBeenCalledTimes(3);
  });
  it("does not retry other errors", async () => {
    const run = vi.fn().mockRejectedValue(new Error("validation failed"));
    await expect(withSerializableRetry(run, { baseDelayMs: 1 })).rejects.toThrow("validation failed");
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("gives up after the attempt limit with the friendly error", async () => {
    const run = vi.fn().mockRejectedValue({ code: "P2034" });
    await expect(
      withSerializableRetry(run, { attempts: 3, baseDelayMs: 1, onExhausted: () => new Error("busy") }),
    ).rejects.toThrow("busy");
    expect(run).toHaveBeenCalledTimes(3);
  });
});

import { postingDateProblem } from "./finance.helpers.js";

describe("postingDateProblem", () => {
  const now = new Date("2026-10-25T12:00:00Z");
  const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
  it("accepts today, past dates and one day of time-zone slack", () => {
    expect(postingDateProblem(day("2026-10-25"), null, now)).toBeNull();
    expect(postingDateProblem(day("2026-01-02"), null, now)).toBeNull();
    expect(postingDateProblem(day("2026-10-26"), null, now)).toBeNull();
  });
  it("rejects future dates and invalid dates", () => {
    expect(postingDateProblem(day("2026-10-27"), null, now)).toMatch(/future/);
    expect(postingDateProblem(new Date("nope"), null, now)).toMatch(/valid/);
  });
  it("rejects dates on or before the closed-through date", () => {
    const locked = day("2026-09-30");
    expect(postingDateProblem(day("2026-09-30"), locked, now)).toMatch(/closed through 2026-09-30/);
    expect(postingDateProblem(day("2026-08-15"), locked, now)).toMatch(/closed/);
    expect(postingDateProblem(day("2026-10-01"), locked, now)).toBeNull();
  });
});

describe("isIdempotencyRace", () => {
  it("matches only unique violations on the idempotency key", () => {
    expect(isIdempotencyRace({ code: "P2002", meta: { target: ["schoolId", "idempotencyKey"] } })).toBe(true);
    expect(isIdempotencyRace({ code: "P2002", meta: { target: "payments_schoolId_idempotencyKey_key" } })).toBe(true);
    expect(isIdempotencyRace({ code: "P2002", meta: { target: ["paymentNumber", "schoolId"] } })).toBe(false);
    expect(isIdempotencyRace({ code: "P2034" })).toBe(false);
  });
  it("withSerializableRetry honours a custom retry rule", async () => {
    let calls = 0;
    const result = await withSerializableRetry(
      async () => {
        calls += 1;
        if (calls === 1) throw { code: "P2002", meta: { target: ["idempotencyKey"] } };
        return "ok";
      },
      { baseDelayMs: 1, retryIf: isIdempotencyRace },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });
});
