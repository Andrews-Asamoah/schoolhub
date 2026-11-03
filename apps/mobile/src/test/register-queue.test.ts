import AsyncStorage from "@react-native-async-storage/async-storage";
import { ApiError, SessionChangedError } from "@/lib/api-error";
import {
  MAX_QUEUED_REGISTERS,
  QUEUE_MAX_AGE_MS,
  REGISTER_QUEUE_KEY,
  clearRegisterQueue,
  enqueueRegister,
  flushRegisterQueue,
  isRetryableRegisterError,
  newIdempotencyKey,
  pendingRegisterCount,
} from "@/lib/register-queue";

let store: Record<string, string> = {};
beforeEach(() => {
  store = {};
  jest
    .mocked(AsyncStorage.getItem)
    .mockImplementation(async (k) => store[k] ?? null);
  jest.mocked(AsyncStorage.setItem).mockImplementation(async (k, v) => {
    store[k] = v;
  });
  jest.mocked(AsyncStorage.removeItem).mockImplementation(async (k) => {
    delete store[k];
  });
});

const batch = (date = "2026-11-02") => ({
  date,
  records: [{ studentId: "s1", status: "PRESENT" as const }],
});
const entry = (key: string, subdomain = "school", date?: string) => ({
  key,
  subdomain,
  batch: batch(date),
});

test("keys are unique and match the server's accepted format", () => {
  const keys = new Set(Array.from({ length: 200 }, () => newIdempotencyKey()));
  expect(keys.size).toBe(200);
  for (const key of keys) expect(key).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
});

test("only unknown-outcome failures are retryable; server rejections and session changes are not", () => {
  expect(
    isRetryableRegisterError(new TypeError("Network request failed")),
  ).toBe(true);
  for (const status of [408, 429, 500, 502, 503, 504])
    expect(isRetryableRegisterError(new ApiError(status, "x", {}))).toBe(true);
  for (const status of [400, 401, 403, 404, 409, 422])
    expect(isRetryableRegisterError(new ApiError(status, "x", {}))).toBe(false);
  expect(isRetryableRegisterError(new SessionChangedError())).toBe(false);
  expect(isRetryableRegisterError(new Error("fixture"))).toBe(false);
});

test("queues, counts per school, and stores no student names", async () => {
  expect(await enqueueRegister(entry("reg-aaaaaaaa"))).toBe(true);
  expect(await enqueueRegister(entry("reg-bbbbbbbb", "other"))).toBe(true);
  expect(await pendingRegisterCount("school")).toBe(1);
  expect(store[REGISTER_QUEUE_KEY]).not.toMatch(/name/i);
});

test("re-queuing the same key replaces rather than duplicates", async () => {
  await enqueueRegister(entry("reg-aaaaaaaa"));
  await enqueueRegister(entry("reg-aaaaaaaa"));
  expect(await pendingRegisterCount("school")).toBe(1);
});

test("refuses new registers when full instead of dropping older ones", async () => {
  for (let i = 0; i < MAX_QUEUED_REGISTERS; i++)
    expect(
      await enqueueRegister(entry(`reg-${String(i).padStart(8, "0")}`)),
    ).toBe(true);
  expect(await enqueueRegister(entry("reg-overflow1"))).toBe(false);
  expect(await pendingRegisterCount("school")).toBe(MAX_QUEUED_REGISTERS);
});

test("flush sends oldest first with the original key and clears synced entries", async () => {
  await enqueueRegister(entry("reg-aaaaaaaa", "school", "2026-11-01"), 1000);
  await enqueueRegister(entry("reg-bbbbbbbb", "school", "2026-11-02"), 2000);
  const send = jest.fn().mockResolvedValue({});
  const result = await flushRegisterQueue({
    subdomain: "school",
    send,
    now: 3000,
  });
  expect(send.mock.calls.map(([e]) => e.key)).toEqual([
    "reg-aaaaaaaa",
    "reg-bbbbbbbb",
  ]);
  expect(result).toEqual({ synced: 2, rejected: [], remaining: 0 });
  expect(store[REGISTER_QUEUE_KEY]).toBeUndefined();
});

test("a retryable failure keeps that entry and everything after it, in order", async () => {
  for (const [i, k] of [
    "reg-aaaaaaaa",
    "reg-bbbbbbbb",
    "reg-cccccccc",
  ].entries())
    await enqueueRegister(entry(k), 1000 + i);
  const send = jest
    .fn()
    .mockResolvedValueOnce({})
    .mockRejectedValueOnce(new TypeError("Network request failed"));
  const result = await flushRegisterQueue({
    subdomain: "school",
    send,
    now: 2000,
  });
  expect(send).toHaveBeenCalledTimes(2);
  expect(result).toEqual({ synced: 1, rejected: [], remaining: 2 });
  expect(
    JSON.parse(store[REGISTER_QUEUE_KEY]!).map((e: { key: string }) => e.key),
  ).toEqual(["reg-bbbbbbbb", "reg-cccccccc"]);
});

test("a server rejection is dropped and reported, and later entries still send", async () => {
  await enqueueRegister(entry("reg-aaaaaaaa", "school", "2026-11-01"), 1000);
  await enqueueRegister(entry("reg-bbbbbbbb", "school", "2026-11-02"), 1001);
  const send = jest
    .fn()
    .mockRejectedValueOnce(new ApiError(403, "closed", {}))
    .mockResolvedValueOnce({});
  const result = await flushRegisterQueue({
    subdomain: "school",
    send,
    now: 2000,
  });
  expect(result).toEqual({
    synced: 1,
    rejected: [{ date: "2026-11-01", status: 403 }],
    remaining: 0,
  });
});

test("a session change stops the flush without discarding the register", async () => {
  await enqueueRegister(entry("reg-aaaaaaaa"), 1000);
  const send = jest.fn().mockRejectedValue(new SessionChangedError());
  const result = await flushRegisterQueue({
    subdomain: "school",
    send,
    now: 2000,
  });
  expect(result.remaining).toBe(1);
});

test("entries from another school are never sent and are discarded", async () => {
  await enqueueRegister(entry("reg-aaaaaaaa", "other"), 1000);
  const send = jest.fn();
  await flushRegisterQueue({ subdomain: "school", send, now: 2000 });
  expect(send).not.toHaveBeenCalled();
  expect(store[REGISTER_QUEUE_KEY]).toBeUndefined();
});

test("expired and corrupt entries are ignored", async () => {
  await enqueueRegister(entry("reg-aaaaaaaa"), 1000);
  const send = jest.fn();
  const result = await flushRegisterQueue({
    subdomain: "school",
    send,
    now: 1000 + QUEUE_MAX_AGE_MS + 1,
  });
  expect(send).not.toHaveBeenCalled();
  expect(result.remaining).toBe(0);
  store[REGISTER_QUEUE_KEY] = "{not json";
  expect(await pendingRegisterCount("school")).toBe(0);
  store[REGISTER_QUEUE_KEY] = JSON.stringify([
    { key: "short", subdomain: "school" },
  ]);
  expect(await pendingRegisterCount("school")).toBe(0);
});

test("concurrent flushes cannot send the same register twice", async () => {
  await enqueueRegister(entry("reg-aaaaaaaa"), 1000);
  const send = jest.fn(async () => {
    await new Promise((r) => setTimeout(r, 5));
    return {};
  });
  await Promise.all([
    flushRegisterQueue({ subdomain: "school", send, now: 2000 }),
    flushRegisterQueue({ subdomain: "school", send, now: 2000 }),
  ]);
  expect(send).toHaveBeenCalledTimes(1);
});

test("sign-out style clearing removes every queued register", async () => {
  await enqueueRegister(entry("reg-aaaaaaaa"));
  await clearRegisterQueue();
  expect(await pendingRegisterCount("school")).toBe(0);
});
