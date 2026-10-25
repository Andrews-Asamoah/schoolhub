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

## Baseline and environment notes

This execution environment could not resolve `github.com` for a local clone, so the checks were run on GitHub Actions rather than locally. The baseline job checked out the pull request base commit `f0e9d20ba1500739ab655963a21d91ead75a4795`, before any Phase 0 changes.

**Baseline outcome: no pre-existing failures observed.** The frozen install, typecheck, API lint, database migrations, API tests and web theme lint all passed. The API suite reported 260 passing tests across 26 files; the PostgreSQL-backed `finance (database)` suite ran 25 tests.

- Baseline run: [GitHub Actions run 40215830582](https://github.com/Andrews-Asamoah/schoolhub/actions/runs/40215830582)
- Proposed branch run: [GitHub Actions run 40215830582](https://github.com/Andrews-Asamoah/schoolhub/actions/runs/40215830582)
- The earlier workflow run before improving baseline outcome reporting also passed, but the later run is the authoritative record because it exposes baseline step failures rather than masking them.

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

| Check | Baseline (`f0e9d20`) | Proposed branch |
| --- | --- | --- |
| Frozen install | Pass | Pass |
| Typecheck | Pass | Pass |
| API lint | Pass | Pass |
| Database migrations | Pass | Pass |
| Web theme lint | Pass | Pass |
| API test suite | 260 passed, 26 files | 266 passed, 27 files |
| PostgreSQL finance integration suite | 25 passed | 25 passed |
| Development reset guard tests | Not present | Included in passing suite |

## Phase gate

The latest CI run is green for both jobs (baseline and proposed branch). The new reset guard is covered by unit tests, and the API suite passes with PostgreSQL integration enabled. Phase 0's automated verification criteria are met. Do not begin Phase 1 until this Phase 0 report is reviewed and approved.
