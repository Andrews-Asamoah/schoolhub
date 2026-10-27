# SuperAdmin hardening and operations roadmap

This work is delivered in small, reviewable increments. Do not represent a dependency as healthy unless it has a real health check, and do not represent billing metrics as financial facts unless they come from persisted billing records.

## Phase 1 — Security and tenant isolation

- [x] Keep SuperAdmin API endpoints behind `SuperAdminGuard` (session, role, suspension, mandatory password change, and 2FA checks).
- [x] Keep administrative write endpoints rate-limited and audit sensitive school/subscription changes.
- [ ] Add step-up authentication for the highest-risk mutations using a short-lived, server-verified re-authentication proof.
- [ ] Expand negative authorization tests for every SuperAdmin mutation and tenant boundary integration tests.
- [ ] Verify authentication, password-change, and 2FA flows against the local seeded database and browser before merge.

## Phase 2 — Platform operations center

- [x] Add an authenticated, no-store SuperAdmin endpoint reporting application and database health.
- [x] Return a degraded state when the database check fails; do not expose connection errors.
- [x] Explicitly mark storage, notification delivery, and background jobs as not instrumented rather than reporting false green status.
- [ ] Add provider/worker-specific health contracts for storage, notifications, and jobs.
- [x] Add a theme-token-based UI panel with refresh, timestamps, database latency, explicit unmonitored states, and error/retry handling.
- [x] Expose deployment commit SHA and Prisma migration status; compare with `EXPECTED_MIGRATION_NAME` when deployment metadata provides it, otherwise report the comparison as not configured.

## Phase 3 — School onboarding and lifecycle

- [ ] Model onboarding progress from persisted school setup data, not a client-only checklist.
- [ ] Add secure owner invitations and recovery flows with expiry, single-use tokens, and rate limits.
- [x] Add opt-in 30-day trusted-device login for SuperAdmins with server-side revocation, audit events, and role enforcement.
- [x] Require a meaningful reason for school-administrator suspension; persist it on the membership and include it in the audit entry while retaining final-admin safeguards.
- [ ] Add lifecycle and authorization integration tests.

## Phase 4 — Billing and business analytics

- [ ] Review current subscription schema and existing payment/finance models before adding tables.
- [ ] Add plan catalogue and versioned pricing only where current schema does not already support it.
- [ ] Model invoices, payment attempts, verified payment events, receipts, renewals, grace periods, and reconciliation.
- [ ] Calculate revenue, conversion, and churn exclusively from persisted billing events with explicit time windows.
- [ ] Use integer minor units or database decimals; never use binary floating-point for money.

## Phase 5 — Audit, monitoring, and recovery

- [x] Keep centralized audit redaction for secret-like fields and write audit rows in the same transaction as the described change where supported.
- [ ] Review every high-risk mutation for audit coverage and ensure failures are recorded without leaking secrets.
- [ ] Add retention, pagination/export safeguards, and tamper-resistance appropriate to the deployment model.
- [ ] Document backup cadence, RPO/RTO targets, restore runbooks, and recurring restore tests.

## Verification gates

- Run API typecheck, API unit tests, frontend typecheck/build, and theme audit.
- Review generated Prisma migration SQL and test against a disposable database before applying to production.
- Manually verify the SuperAdmin browser flow and seeded data locally; remote repository access cannot validate local browser state or database contents.
- Do not merge until required checks pass and remaining instrumentation is clearly represented in the UI.
