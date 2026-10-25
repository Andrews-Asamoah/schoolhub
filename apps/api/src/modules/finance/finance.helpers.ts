/** Pure helpers for the finance service (no database access, easy to unit test). */

/**
 * Build a gap-free, school-scoped sequence such as RCT-2026-00001.
 *
 * `existing` is every number already issued with this prefix. The next number
 * is one more than the highest numeric suffix, so older randomly generated
 * numbers (e.g. RCT-2026-48213) are never reused. The caller must hold a
 * per-school advisory lock while reading `existing` and issuing numbers.
 */
export function createSequence(existing: ReadonlyArray<string | null>, prefix: string, width = 5) {
  let highest = 0;
  for (const value of existing) {
    if (!value || !value.startsWith(prefix)) continue;
    const suffix = value.slice(prefix.length);
    if (!/^\d+$/.test(suffix)) continue;
    highest = Math.max(highest, Number(suffix));
  }
  return {
    next(): string {
      highest += 1;
      return prefix + String(highest).padStart(width, "0");
    },
  };
}

/** True for PostgreSQL serialization failures / deadlocks surfaced by Prisma. */
export function isSerializationFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: unknown; meta?: { code?: unknown }; message?: unknown };
  if (err.code === "P2034") return true;
  if (err.meta?.code === "40001" || err.meta?.code === "40P01") return true;
  const message = typeof err.message === "string" ? err.message : "";
  return /could not serialize access|serialization failure|deadlock detected/i.test(message);
}

/** True when a unique-index violation was on the payment idempotency key (a duplicate request racing itself). */
export function isIdempotencyRace(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: unknown; meta?: { target?: unknown }; message?: unknown };
  if (err.code !== "P2002") return false;
  const target = Array.isArray(err.meta?.target) ? err.meta!.target.join(",") : String(err.meta?.target ?? "");
  const message = typeof err.message === "string" ? err.message : "";
  return /idempotencyKey/i.test(target) || /idempotencyKey/i.test(message);
}

/**
 * Run a transaction and retry it when PostgreSQL aborts it
 * because of a concurrent conflict. Any other error is rethrown immediately.
 * When every attempt conflicts, `onExhausted` builds the error to throw.
 */
export async function withSerializableRetry<T>(
  run: () => Promise<T>,
  options: { attempts?: number; baseDelayMs?: number; retryIf?: (error: unknown) => boolean; onExhausted?: (cause: unknown) => Error } = {},
): Promise<T> {
  const attempts = options.attempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 25;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (!(options.retryIf ?? isSerializationFailure)(error)) throw error;
      lastError = error;
      if (attempt < attempts) {
        const delay = baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * baseDelayMs);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw options.onExhausted ? options.onExhausted(lastError) : lastError;
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Why a transaction cannot be dated `date`, or null when it is fine.
 * - not a real date
 * - in the future (one day of slack for time zones)
 * - on or before the date the books were closed through
 */
export function postingDateProblem(date: Date, lockedThrough: Date | null, now: Date = new Date()): string | null {
  if (Number.isNaN(date.getTime())) return "Enter a valid date.";
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (isoDay(date) > isoDay(tomorrow)) return "Transactions cannot be dated in the future.";
  if (lockedThrough && isoDay(date) <= isoDay(lockedThrough)) {
    return `The books are closed through ${isoDay(lockedThrough)}. Use a later date, or ask for the period to be reopened.`;
  }
  return null;
}
