# P4 read-only readiness runbook

1. Apply the additive P3/P4 migrations to a restored production database copy.
2. Run `pnpm --filter @schoolhub/api prisma:generate` (verify the exact workspace command in package.json) and repository CI with PostgreSQL service.
3. For each pilot school call `GET /finance/periods/readiness?year=YYYY&month=MM`. The endpoint cannot close periods.
4. Confirm the expected blocking checks: P2 ledger immutability, P3 recognised revenue and credits, P5 reconciliations, P6 statutory reconciliation, and independent approval.
5. `POST /finance/periods/prepare` with `{"year":2026,"month":9}` stores an OPEN month and preparation check rows; inspect checks and confirm no ledger rows, lock changes, events or snapshots were created.
6. Do not change `FinancePeriodLock` to imply an approved close. Continue its legacy semantics until a separately reviewed compatibility migration.
7. After the upstream phases are implemented, test snapshot hashing, journal freeze, approval decisions, reopen ordering and second-snapshot version before enabling close actions.

**Important:** P4 close and reopen are intentionally NOT exposed by this phase's API. `canClose` must remain `false` until the hard gates are satisfied. Existing legacy period lock is not a P4 accounting close.

## As-of journal preview (P4 incremental capability)
- `GET /finance/periods/snapshot-preview?year=2026&month=9` calculates posted journal opening balances, within-month debit/credit movements, closing balances and a deterministic SHA-256 hash.
- Hash version 2 binds the **school ID**, period start/end, account identities and their amounts. Reordering input accounts does not change the hash.
- Uses a PostgreSQL repeatable-read snapshot; will refuse to run if I1, I2 or I3 is failing. Requires a completed month.
- The preview creates NO period close, snapshots, journal entries or period locks. It cannot substitute for cash/bank, student AR, payroll or deferred revenue period-specific reconciliations.
- This is a journal-basis as-of view; close approval and persisted snapshots are separate, gated phases.
