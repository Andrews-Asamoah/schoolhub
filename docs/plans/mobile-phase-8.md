# Mobile Phase 8: offline attendance register (part 1)

Scope: teacher attendance register only. Push notifications and native two-factor
are **not** part of this change (see "Not done").

## What was already on `dev` (PR #191)

`POST /api/attendance/batch` accepts an `Idempotency-Key` header and persists it
in `attendance_batch_replays` (unique per school, user and key, with an input hash).

## What this change adds

- **API:** a retry of an already-saved batch is answered from the replay record
  **before** the future-date, term, calendar, enrolment and assignment checks, so a
  register that was saved but whose response was lost still reports success after
  the day, term or assignment has changed. Lookup is scoped to school + user + key.
  The same key with a different body is a 409. Concurrent first writes still
  resolve through the unique index. Added `attendance-batch-replay.spec.ts`
  (mock-based; verified to fail without the change).
- **Mobile adapter:** endpoints may declare `idempotent: true` (write methods
  only) and accept a validated `idempotencyKey`, sent as `Idempotency-Key`.
  Any other endpoint rejects a key.
- **Offline queue** (`src/lib/register-queue.ts`): only transport failures, 408,
  429 and 5xx are queued; server rejections (closed day, exclusion, permissions) are
  never queued or retried. Each entry keeps the key it was first sent with. Entries
  hold student ids and statuses only, are scoped to the school, expire after 14 days,
  are capped at 20, are serialised against concurrent flushes, and are wiped with the
  query cache on sign-out, session expiry and role change.
- **Register screen:** a save that fails with an unknown outcome is queued and
  explained; queued registers sync on opening the screen, when the app returns to the
  foreground, after a successful save, and from a "Sync now" button. Rejected queued
  registers are reported by date and removed.

## Verification

Mobile: typecheck, strict lint, formatting, 28 suites / 243 tests, contrast,
85 endpoint declarations, 41 release tests, Android and iOS exports with release
verification. API: new unit spec passes (3 tests) and fails against the previous
service; `oxlint` clean on touched files.

## Not done / not verified

- API `tsc` and the Prisma-backed integration suite were **not run** (Prisma engine
  download is blocked in the authoring sandbox); CI must confirm them.
- No device was used: offline behaviour (airplane mode, app backgrounding) needs the
  manual checks in `docs/validation/mobile-device-acceptance.md`.
- Push notifications (`POST/DELETE /api/notifications/devices`, `expo-notifications`)
  need owner approval and a physical device.
- Native two-factor sign-in remains deferred (Phase 4A).
- Replay rows are never purged; add a retention job (the `schoolId, createdAt` index exists).
