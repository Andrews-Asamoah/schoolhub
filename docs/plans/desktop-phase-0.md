# Desktop Phase 0 — feasibility spike

Started 11 November 2026 from dev `d3ed87c4ccf4c889eba65fd7a36b9209afc33a91`.
Status: **in progress; no go/no-go decision yet**.

Desktop work targets the `desktop-version` branch.

The source plan is the [9 November offline-first desktop proposal](desktop-offline-first-proposal.txt). This first
increment establishes reproducible experiments without changing production
attendance, marks, auth, licensing or the web runtime. It does not complete
Phase 0 and must not be treated as an offline product release.

## Delivered in this increment

- `apps/desktop` workspace with dependency-free Node configuration checks and
  executable synthetic outbox experiments.
- Tauri v2 shell configured to embed the actual `apps/web/dist` build. No native
  commands or plugin permissions are granted. Release devtools are disabled.
  Bundling/installers are disabled; the full web route tree is still present.
- A private Rust SQLCipher storage experiment. Tests cover the encryption
  library check, wrong keys, reopening, atomic edit/outbox rollback, duplicate
  operation rollback and refusing a newer database schema.
- 100 seeded process-termination/retry rounds at SQLite commit/ack boundaries,
  plus stale-write and payload-reuse checks. These are **plain SQLite protocol
  model tests**, not a real API or encrypted crash test.
- A PostgreSQL concurrency experiment for a transactional, serialized cursor
  counter. It checks both commit and rollback while a second writer waits.
- Separate CI jobs for the protocol/cursor and Windows SQLCipher/shell build.
  Native dependency resolutions are committed in Cargo.lock.

## Acceptance and evidence

| Gate | Current evidence | Remaining work |
| --- | --- | --- |
| Existing web build | Shared build and web production build passed locally | Observe CI |
| Web regression suite | 10 files, 61 tests passed locally | Observe CI |
| Atomic local queue/retry | 100 seeded process-termination rounds passed locally | Repeat with the actual Rust encrypted store and real API |
| SQLCipher | Rust tests passed on Linux | Windows build/test and OS key custody |
| Tauri embeds actual web assets | Config and build wiring added | Windows compile and interactive rendering |
| Sign-in and 2FA | Existing browser auth and native mobile limitations reviewed | Rust HTTP with cookie jar; real API challenge and logout/revocation tests |
| Attendance vertical slice | Synthetic version/idempotency experiment passes | Call real attendance services, preserve original term, test auth/locks/conflicts |
| Commit-safe cursor | PostgreSQL experiment added | Run experiment; choose mechanism, test scoped pull/snapshot/pagination |
| Slow link | No evidence yet | 64 kbps, 1 s latency, 10% packet loss; interrupted upload/download |
| PDF save/print | No evidence yet | WebView2 interactive test and user-chosen file paths |
| Third-party sync comparison | Not started | Time-box one engine against SchoolHub authorization/deployment needs |
| Performance | No Windows measurements yet | Cold start <3 s, idle RAM <250 MB; record hardware/runtime |
| Installer | Disabled in this increment | Measure app-only and WebView2-bundled packages separately |

Local verification transcript summary: `docs/validation/desktop-phase-0/README.md`.
Do not promote any pending gate to passed based solely on configuration or a
model test. CI compilation cannot establish interactive runtime behavior.

## Corrections carried forward from review

1. Existing attendance idempotency is retry protection, not optimistic conflict
   detection. New operations require a base version and explicit conflict state.
2. Sync commands must retain original term/year IDs; current service paths use
   the current term. Do not bypass deadlines, roster rules or locks to work
   around that restriction.
3. A monotonic timer is not trustworthy proof of capture time across restarts or
   on a user-controlled device. Late submissions need a bounded policy and
   auditable review behavior; licensing and clock rules remain configurable.
4. Scope removal is a replication event even without deletion. Assignment/role
   changes must remove unauthorized local rows and cached documents.
5. Do not expose generic SQL execution over IPC. Only scoped native operations
   should be callable after server identity and OS key custody are established.
6. Revocation must block access promptly, with an explicit unsent-work recovery
   policy. Do not silently wipe unsynced work.
7. Idempotency in production must bind school, user, device, operation and
   canonical payload, and persist the outcome atomically with the domain write.
   The model deliberately omits these identity dimensions.

## Next implementation sequence

1. Obtain Windows build results and run the embedded web UI on a Windows 10+
   machine with a recorded WebView2 version.
2. Prove Rust HTTP against the configured API origin with redirects disabled,
   an in-memory 2FA challenge cookie jar and secrets held outside the webview.
   Test required password changes as well as TOTP and recovery codes.
3. Prove per-user/school database keys using Windows Credential Manager. Test
   restart, wrong account, key loss and lock/unlock without storing passwords.
4. Connect the encrypted attendance/outbox transaction to a synthetic pilot
   account through real domain services and prove a push/pull round trip.
5. Extend concurrency tests to the selected change-feed mechanism and run the
   crash matrix through real PostgreSQL/API transactions under throttling.
6. Complete PDF/print, third-party engine comparison and hardware measurements;
   record an explicit go/no-go and updated estimate.

The original proposal's lease duration, lapsed-subscription grace period,
device limits, supported Windows fleet and signing ownership remain open.
They do not block these isolated synthetic-data experiments.
