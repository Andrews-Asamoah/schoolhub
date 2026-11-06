import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  batchAttendanceSchema,
  type BatchAttendanceInput,
} from "@schoolhub/shared";
import { z } from "zod";
import { ApiError, SessionChangedError } from "./api-error";

/**
 * Offline queue for the teacher attendance register (the only offline write the
 * app supports). Privacy and safety rules:
 * - only transport failures and retryable server errors are ever queued; a
 *   request the server rejected (closure, exclusion, permissions) is never queued;
 * - every entry carries the Idempotency-Key it was first sent with, so a retry
 *   after an unknown outcome cannot double-apply;
 * - entries hold student ids and statuses only (no names) and are scoped to the
 *   school they were created in;
 * - the queue is wiped on sign-out, session expiry and role change
 *   (`wipeQueryCache`), expires after 14 days and holds at most 20 registers.
 */
export const REGISTER_QUEUE_KEY = "schoolhub:register-queue";
export const MAX_QUEUED_REGISTERS = 20;
export const QUEUE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

const entrySchema = z.object({
  key: z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/),
  subdomain: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  batch: batchAttendanceSchema,
});
export type QueuedRegister = {
  key: string;
  subdomain: string;
  createdAt: number;
  batch: BatchAttendanceInput;
};

export type FlushResult = {
  synced: number;
  rejected: { date: string; status: number }[];
  remaining: number;
};

/** A unique, format-valid idempotency key (uniqueness, not secrecy, is required). */
export function newIdempotencyKey(): string {
  const bytes = new Uint8Array(12);
  const cryptoObject = (
    globalThis as {
      crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array };
    }
  ).crypto;
  if (cryptoObject?.getRandomValues) cryptoObject.getRandomValues(bytes);
  else
    for (let i = 0; i < bytes.length; i++)
      bytes[i] = Math.floor(Math.random() * 256);
  const random = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `reg-${Date.now().toString(36)}-${random}`;
}

/** Outcome unknown or server temporarily unavailable: safe to retry with the same key. */
export function isRetryableRegisterError(error: unknown): boolean {
  if (error instanceof SessionChangedError) return false;
  if (error instanceof ApiError)
    return error.status === 408 || error.status === 429 || error.status >= 500;
  return error instanceof TypeError; // React Native reports network failure as TypeError
}

// All reads and writes are serialised so concurrent saves/flushes cannot clobber each other.
let chain: Promise<unknown> = Promise.resolve();
function locked<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.catch(() => undefined);
  return run;
}

async function load(now = Date.now()): Promise<QueuedRegister[]> {
  const raw = await AsyncStorage.getItem(REGISTER_QUEUE_KEY);
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const entries: QueuedRegister[] = [];
  for (const item of parsed) {
    const result = entrySchema.safeParse(item);
    if (result.success && now - result.data.createdAt <= QUEUE_MAX_AGE_MS)
      entries.push(result.data);
  }
  return entries;
}

async function save(entries: QueuedRegister[]) {
  if (!entries.length) await AsyncStorage.removeItem(REGISTER_QUEUE_KEY);
  else await AsyncStorage.setItem(REGISTER_QUEUE_KEY, JSON.stringify(entries));
}

/** Returns false when the queue is full (the caller must keep the marks on screen). */
export function enqueueRegister(
  entry: Omit<QueuedRegister, "createdAt">,
  now = Date.now(),
) {
  return locked(async () => {
    const entries = (await load(now)).filter((e) => e.key !== entry.key);
    if (entries.length >= MAX_QUEUED_REGISTERS) return false;
    entries.push({
      ...entry,
      batch: batchAttendanceSchema.parse(entry.batch),
      createdAt: now,
    });
    await save(entries);
    return true;
  });
}

export function pendingRegisterCount(subdomain: string): Promise<number> {
  return locked(
    async () => (await load()).filter((e) => e.subdomain === subdomain).length,
  );
}

export function clearRegisterQueue(): Promise<void> {
  return locked(async () => {
    await AsyncStorage.removeItem(REGISTER_QUEUE_KEY);
  });
}

/**
 * Sends queued registers oldest first. Stops at the first retryable failure so
 * ordering is preserved. Registers the server rejects are dropped (and reported)
 * because retrying cannot succeed; entries from another school are discarded.
 */
export function flushRegisterQueue(input: {
  subdomain: string;
  send: (entry: QueuedRegister) => Promise<unknown>;
  now?: number;
}): Promise<FlushResult> {
  return locked(async () => {
    const all = await load(input.now);
    const own = all.filter((e) => e.subdomain === input.subdomain);
    const result: FlushResult = { synced: 0, rejected: [], remaining: 0 };
    const kept: QueuedRegister[] = [];
    let stopped = false;
    for (const entry of own) {
      if (stopped) {
        kept.push(entry);
        continue;
      }
      try {
        await input.send(entry);
        result.synced += 1;
      } catch (error) {
        if (error instanceof ApiError && !isRetryableRegisterError(error)) {
          result.rejected.push({
            date: entry.batch.date,
            status: error.status,
          });
        } else {
          // Retryable, session change, or unknown: keep and stop.
          kept.push(entry);
          stopped = true;
        }
      }
    }
    result.remaining = kept.length;
    await save(kept);
    return result;
  });
}
