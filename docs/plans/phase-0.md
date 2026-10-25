# Phase 0 — Baseline, CI and development reset safety

## Goal

Establish a reproducible baseline in CI and prevent the destructive development payment-reset script from connecting to a production or ambiguous database without an explicit operator opt-in.

## Scope

1. Record baseline results for dependency installation, typecheck, API lint, and API tests.
2. Add GitHub Actions CI that installs the frozen pnpm workspace, runs typecheck and lint, and runs API tests against a disposable PostgreSQL service with repository migrations applied.
3. Require `ALLOW_DEV_RESET=true` before the payment-reset script may connect to a database. Reject malformed URLs and databases that do not appear local or explicitly development/test-oriented. Keep the existing `NODE_ENV=production` refusal.
4. Add tests for the reset-safety guard.

## Baseline commands

Run these against the unmodified baseline before making implementation changes:

- `pnpm install --frozen-lockfile`
- `pnpm typecheck`
- `pnpm --filter @schoolhub/api lint`
- `pnpm --filter @schoolhub/api test`

The repository's finance integration suite is enabled only when `TEST_DATABASE_URL` is set and its database name contains `test`. CI must set it to the PostgreSQL service database and apply migrations before running the suite.

## Environment limitation and baseline status

The execution environment for this phase cannot resolve `github.com` for a local clone, so it cannot install the workspace from the repository directly. Consequently, no local baseline command result is claimed. The new pull-request CI is the executable baseline; its first run must be inspected and any pre-existing failures recorded below before treating Phase 0 as green.

- Dependency install: pending CI run.
- Typecheck: pending CI run.
- API lint: pending CI run.
- API tests (including PostgreSQL finance integration suite): pending CI run.

## CI design

- Use Node.js 22 and the exact pnpm version pinned by the repository's `packageManager` field.
- Install with `pnpm install --frozen-lockfile`.
- Start a PostgreSQL service with a database named `schoolhub_test`, wait for health checks, and set both `DATABASE_URL` and `TEST_DATABASE_URL`.
- Apply existing migrations via `prisma migrate deploy` before API tests.
- Run repository typecheck, API lint, API tests and the web theme lint.
- Grant the workflow read-only repository contents permission.

## Reset-script safety policy

- Require the exact opt-in `ALLOW_DEV_RESET=true` even for dry-run mode, before creating a connection pool.
- Preserve the `NODE_ENV=production` hard stop.
- Parse `DATABASE_URL`; accept loopback/local database hosts or targets clearly marked for development, local use, or testing. Reject malformed, missing, or production-labelled targets.
- Log the parsed database host only after validation; never log credentials.
- Do not change reset semantics or financial data handling in this phase.

## Verification record

Fill in the following from the first CI run and the post-change CI run:

| Check | Baseline | After change |
| --- | --- | --- |
| Frozen install | Pending | Pending |
| Typecheck | Pending | Pending |
| API lint | Pending | Pending |
| Web theme lint | Pending | Pending |
| API unit tests | Pending | Pending |
| Finance PostgreSQL integration tests | Pending | Pending |

## Phase gate

Phase 0 is complete only when the workflow is green on the clean phase branch, the reset guard tests pass, and the exact baseline/post-change results are documented. Do not begin Phase 1 until the Phase 0 report is reviewed and approved.
