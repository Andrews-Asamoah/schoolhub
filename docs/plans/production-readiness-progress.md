# Production-readiness delivery and acceptance register

Source plan: SchoolHub Production Readiness Plan, 28 October 2026.
Implementation base: `dev` commit `00aa448819f729f0c57ea87124725c691a4feb93`.

A code implementation is not a production acceptance sign-off. Use the exact PR head CI results for validation; do not copy a previous commit's green status.

## Delivery status

| Workstream | Implemented in this change | Still required before production acceptance |
|---|---|---|
| Baseline | Generated controller route/guard/role inventory with stale-output check | Manually review service resource scope and audit coverage for all routes; production access and branch rulesets |
| Private files | Separate private bucket; stored keys; authenticated tenant/role checks; leadership audience; no-store; upload/download/delete audits | Configure the bucket without ANY public endpoints; migrate old files and purge cached public URLs |
| Uploads | Image decode/re-encode and pixel limits; PDF parsing and active-content rejection; fail-closed ClamAV scanning for production PDFs | Deploy and monitor ClamAV with updated signatures; load-test adversarial documents |
| Cleanup | Durable pre-upload cleanup reservations and transactional cancellation; retries and dead letters | Exercise storage outage and process-kill recovery against staging R2 |
| Finance scheduling | Durable per-school daily runs, startup catch-up, atomic claims, lease heartbeats, retry/backoff, dead letters | Exercise live operational alerts and obtain accountant acceptance |
| Origins/proxy | Shared explicit HTTPS origin policy; production school-admin 2FA default; shutdown hooks; preserved nginx headers and explicit external scheme | Set owned domain roots, trusted proxy hops and external scheme; verify the real TLS chain |
| Deployment | API entrypoint executable in container | Digest/CI-gated image promotion, migration gating, container smoke tests |
| School operations | Existing academic, attendance, BECE and finance implementation retained | Full term/year journeys, policy-versioned promotion, migration reconciliation |
| Notifications | Existing in-app records retained; durable job infrastructure available | Provider delivery contracts, transactional outbox, receipt validation and cost limits |
| Recovery | Existing runbook retained | Actual encrypted backup/PITR setup, object copies, measured restore, operator ownership |

## Route inventory

Run `node apps/api/scripts/route-inventory.mjs` after changing controllers. CI runs the same script with `--check`.
`docs/architecture/route-inventory.json` records HTTP method/path, controller, guard and role annotations. It deliberately labels resource scope and audit as requiring service review. It excludes Better Auth plugin endpoints, which are covered separately by the real sign-in/2FA E2E suite. Static annotations alone do not prove isolation.

## Role acceptance matrix

| Actor | Required acceptance evidence | Current evidence |
|---|---|---|
| Owner/admin/headteacher | Staff + leadership documents; signature administration; account policy and publication approval | New real PostgreSQL HTTP document role tests; existing auth/assessment suites |
| Teacher | Staff documents, assigned classes/subjects only; no leadership documents | New HTTP document audience tests; existing teacher-scope suites |
| Accountant | Staff documents; financial approvals and reconciled reports; no leadership files | New HTTP document audience tests; existing finance integration suites |
| Staff | Staff documents, restricted personal records; no leadership files | New HTTP document audience tests; service resource review remains |
| Guardian/student | Their own authorised published academic records; no staff document/signature or BECE access | New document denial tests; existing report/BECE denial suites; complete browser journey remains |
| SuperAdmin | Enforced 2FA, audited tenant entry and privileged actions | Existing real database 2FA E2E and SuperAdmin tests; support-access policy review remains |
| Revoked member | Copied private links stop working immediately | New HTTP test uses live membership suspension with an existing session identity |

## Operator handoff — private storage

1. Back up the database and object store. Apply committed migrations with `pnpm db:deploy`.
2. Set `R2_PRIVATE_BUCKET_NAME` to a separate bucket. Disable its r2.dev URL and all public custom domains. The API refuses to reuse the public bucket. Verify anonymously that a known private object cannot be read.
3. Set `CLAMAV_HOST` (private network) and optionally `CLAMAV_PORT`. Production PDFs are rejected while scanning is unavailable; image uploads are decoded and re-encoded before storage.
4. Set `TENANT_ROOT_DOMAINS` to the comma-separated domains you own, use HTTPS `WEB_ORIGIN`, and set the web container's `PUBLIC_SCHEME=https` behind TLS termination. `PUBLIC_SCHEME=auto` is suitable for direct local HTTP. Set `TRUST_PROXY` to the actual trusted hop count and restrict direct upstream access.
5. Run `pnpm --filter @schoolhub/api exec tsx scripts/migrate-private-storage.ts` for a read-only inventory. Unknown/external URLs are blocked, never fetched. A nonzero exit means unresolved rows remain.
6. Set `MIGRATION_ACTOR_ID` to an active SuperAdmin user id. Run with `--apply` to validate, copy and checksum-verify files before a compare-and-swap database update. Existing file URLs remain unavailable to the app until migration. Each copy has a durable cleanup reservation to recover abandoned uploads.
7. Verify downloads in staging for each role. Re-run `--apply --remove-public` only after verification to delete the old public objects. The script retains internal migration records for resumption. Provider/CDN cache purges are a separate operator task; previous copies cannot be assumed revoked.
8. Monitor `background_jobs` for `DEAD` or overdue `PENDING`/expired `RUNNING` records. Retry only after diagnosing the failure; handlers must remain idempotent. Upload cleanup reservations are delayed 24 hours and removed transactionally when the metadata commits.

No live storage migration, public deletion, production deployment, restore drill, provider notification or legacy-school import has been executed by this code change.

## Durable finance semantics

The scheduler runs the latest due 02:00 UTC check on startup and each minute, with a stable school/date identity. It resumes already-enqueued older jobs. If the application was offline before a date could be scheduled, the startup check evaluates the current ledger; it does not fabricate a historical ledger snapshot for that missed day. Logs distinguish scheduled day from actual check time. Repeated integrity failures dead-letter after five attempts and require investigation; never repair the ledger automatically.
