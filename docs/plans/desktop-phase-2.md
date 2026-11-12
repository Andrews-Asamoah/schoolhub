# Desktop Phase 2 — sync platform

Branch: `desktop-version`. Started 12 November 2026 from `da16e58`.
Status: **device lifecycle implemented; sync platform incomplete**.

The user requested continuation into the next phase. Phase 0 runtime acceptance
and Phase 1 signed distribution remain release gates; this is not an offline
release. The complete scope is in the
[offline-first proposal](desktop-offline-first-proposal.txt).

## Delivered: installation registration and revocation

- `SyncDevice` records have school/account scope and a unique logical installation
  UUID. A nullable server-owned session foreign key binds a desktop session to
  one device. Existing browser sessions and existing business APIs retain their
  online behavior. Device deletion cascades bound sessions rather than silently
  returning them to an unbound state.
- Native code chooses the installation UUID from a fixed application-local data
  directory, scoped by API origin, selected school and server-verified user ID.
  Atomic publication handles concurrent app processes. Corrupt metadata causes
  an explicit failure instead of silently generating a replacement identity.
  Files contain only version/UUID, with hashed filenames; credentials stay in the
  OS credential store. No hardware identifiers or OS user names are collected.
- Registration runs after online sign-in and can be retried in the desktop
  status strip. Password changes and school/2FA access checks must finish first.
  The webview supplies a display name only; it cannot choose the storage path,
  account, bearer or installation UUID through the registration command.
- The API independently loads the persisted session, rejects browser and
  impersonated sessions, and prevents rebinding one session to another device.
  It enforces tenant membership, account/password/2FA policy, active subscription,
  desktop entitlement and minimum version through existing guards.
- Registration retries converge on one device. School-scoped PostgreSQL advisory
  locks serialize lifecycle changes before locking a session/device, preventing
  revocation from racing registration into leaving a live bound session. These
  locks are not the future change-feed cursor design.
- Revocation is idempotent, audited in the same transaction and removes every
  bound server session. Revoked identities cannot register again through this
  API. No automatic local data deletion is implemented. Offline leases and the
  eventual quarantine/wipe policy must be implemented with pending-work custody.
- My profile lists/revokes the signed-in user's installations. Settings gives
  explicit owners/admins a paginated school list and revoke controls. Headteacher
  inheritance in other administration APIs does not grant school device access.
  Revoke requires a reason; self-revocation on desktop checks existing pending
  mark drafts. Phase 2 must extend this check to the real native outbox.
- Lists omit credentials, installation IDs, session IDs and revocation reasons.
  Cross-school/cross-account revocation returns 404. An exported device guard
  reloads the live binding for future sync routes and never trusts a device ID
  header. No placeholder pull, push or lease endpoints are exposed.

## API contracts

All paths have the `/api` prefix. They are included in the route inventory.

| Method/path | Access and behavior |
| --- | --- |
| POST `/sync/devices` | Persisted desktop session; strict installation UUID/name/platform input; API reads version from guarded header; returns public registration metadata |
| GET `/sync/devices?scope=mine` | Authenticated school member; own installations; page/limit bounded |
| GET `/sync/devices?scope=school` | Explicit school owner/admin only; selected school's installations |
| POST `/sync/devices/:id/revoke` | Own installation or explicit owner/admin in selected school; reason required; ends bound sessions |

List/revoke endpoints permit an inactive subscription for browser safety controls;
normal desktop entitlement/version restrictions still apply. Settings/profile
screens retain their existing subscription navigation rules; this increment does
not add a separate inactive-school management screen.

Apply `20261112190000_sync_devices` with the normal API migration deployment
before starting this code. It also adds database platform/channel constraints.
No production database has been modified in this workspace.

A logical UUID identifies an installation, not physical hardware or a trusted
execution environment. Someone who deletes app metadata or has another valid
sign-in can create a new logical installation. Revocation invalidates registered
sessions and blocks that identity; it does not replace banning an account,
removing school membership or future device admission/seat policy. Administrator
re-approval of a revoked identity is not exposed in this increment.

## Validation

Local checks passed:

- API typecheck and 757 unit tests; frontend 77 tests.
- Normal web build and desktop web build, theme and native import/bundle guards.
- Rust library compiled with `--locked`; 11 non-listening native tests passed,
  including installation persistence, scope isolation, concurrent creation,
  corrupt metadata refusal and SQLCipher storage checks.
- Three protocol model tests passed, including 100 seeded kill/retry rounds.
- Updated route inventory (426 routes), inventory check and whitespace checks.

This environment cannot listen on local sockets. The 9 real authentication/
PostgreSQL tests and 10 native HTTP fixture tests are compiled/discovered but
require CI. The extended PostgreSQL suite covers concurrent retry, browser/body
spoofing, school/account/role isolation, all-session revocation, preservation of
browser sign-in, revoked re-registration and registration/revocation races.
Windows CI additionally exercises the real Credential Manager and shell build.
CI results for this increment must be checked before marking these gates passed.

## Remaining Phase 2 work

1. Transactional change log/tombstones with serialized committed cursor ordering;
   paginated pull, scoped snapshots and retention/reset behavior.
2. Operation ledger, schema/versioned command contracts and push authorization,
   conflict handling, replay/idempotency and captured-time rules.
3. Signed offline lease issuance/renewal, key custody and offline unlock.
4. Production encrypted local schema/migrations, atomic outbox/domain writes,
   slow-link sync engine and safe checkpoint/retry scheduling.
5. Sync status, Needs attention resolution, encrypted backup/export and outbox
   guards for logout/school removal/revocation custody.
6. Real PostgreSQL protocol/chaos coverage, native fault tests and Windows pilot
   acceptance with synthetic school accounts.

The current status strip reports registration only. It does not claim offline
readiness, successful data sync or an issued offline lease.
