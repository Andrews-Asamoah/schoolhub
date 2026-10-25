import { describe, expect, it, vi } from "vitest";
import { createSequence, isSerializationFailure, withSerializableRetry } from "./finance.helpers.js";

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
