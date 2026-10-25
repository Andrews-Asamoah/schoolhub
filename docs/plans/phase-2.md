# Phase 2 — Accurate reporting, student statements and arrears

## Goal

Remove the 500-row reporting blind spot, give finance staff and guardians accurate statement views, and implement the approved arrears/fee-clearance policy without creating duplicate receivables.

## Scope and implementation order

1. **Plan and baseline**
   - Pin the implementation to the Phase 0 CI branch; keep Phase 0 in the proposed history.
   - Reconfirm the finance API, school/term/guardian models, fee badge, finance workspaces and API test harness.
   - Preserve tenant guards and existing role/academic-context rules.

2. **Server-side report data**
   - Add `GET /finance/summary` with date, academic-year and term scope; return billed, collected, outstanding, overdue, payment-method and class totals, plus ageing buckets.
   - Replace unlimited/500-row list reads with stable cursor pagination for bills and payments: `{ items, nextCursor, total }`.
   - Enforce query parsing, school scoping and search/status/class/method/date filters at the API. Derive overdue from due date and positive balance rather than mutable status.
   - Add additive indexes for school/date/status/cursor paths.

3. **Statement of account (pre-ledger stage)**
   - Extend the existing ledger route's access constraints and add `GET /finance/students/:id/statement` with term/year/all scope and optional date/year/term filters.
   - Put request/response contract types in `packages/shared`.
   - Use only bills and payments in this phase; produce dated entries, opening and closing balances, running balances, ageing and unallocated credit without treating reversed receipts as collections.
   - Respect the existing finance-role and academic-context rules. Guardian access goes through a separate own-ward endpoint rather than the finance endpoint.

4. **Arrears and billing**
   - Add an additive, reversible-policy migration for school `arrearsPolicy` (`SHOW_ONLY` default, `BLOCK_CLEARANCE_UNTIL_PAID`) and source-bill snapshots for the new bill's brought-forward section.
   - A snapshot is informational: old bills remain open, their balances are not added to the new bill's posted amount, and no second charge is created. Student-level due and clearance calculations aggregate all eligible open bills.
   - Make payment allocation choose the oldest open bill and spill across its bill items and next bills. Until the Phase 5 credit/prepayment model exists, reject any amount that exceeds total open receivables rather than silently creating a credit.
   - Add term-end review data for students with old outstanding balances and former-student marking only if existing supported status/model fields allow it without destructive history.
   - Add optional late-fee configuration only if an existing effective-dated policy model supports it; otherwise defer rather than add an unreviewed legal/finance rule. Default remains off.
   - Optional fee items require explicit `optionalItemIds`; no optional item is billed by default.

5. **Guardian and UI**
   - Add an own-wards-only guardian fees/statement endpoint in the students module and replace the guardian fee placeholder.
   - Fix loading/error fee status to `unknown`, never falsely report fully paid; implement the school arrears clearance policy in the server fee-status result.
   - Refactor dashboard/debtor/report/chart data to use server summaries; reports must use academic year/term rather than browser-calendar sums.
   - Add the accountant statement workspace and role-appropriate navigation; use Print/PDF/Excel only in new statement UI, without adding a CSV export. Existing product-wide CSV export removal is the separately numbered Phase 1 and is intentionally not part of this phase.

6. **Tests and verification**
   - Add unit tests for pagination filters/counts, statement running balances, oldest-first spill-over, arrears no-double-count, optional-item defaults, and clearance policy.
   - Add PostgreSQL integration coverage for more than 500 rows and guardian cross-family denial, plus tenant-isolation tests for new endpoints.
   - Run `pnpm typecheck`, `pnpm --filter @schoolhub/api lint`, `pnpm --filter @schoolhub/api test` and web typecheck/theme checks through CI. Fix failures attributable to this branch.

## Accounting and safety invariants

- Use `Prisma.Decimal` for money in API calculations; only serialize numbers/strings at the API boundary.
- Every finance query is constrained by `schoolId`; student IDs, year IDs, term IDs, class IDs and cursors supplied by the client are validated against that school.
- Old-term receivables remain on their original bills; brought-forward snapshots are display-only.
- No migration may rewrite existing monetary balances. Use additive schema and create a rollback note for schema changes.
- Preserve payment idempotency, locking, sequential receipt numbers, period-lock logic and audit behavior.

## Phase gate

The phase is complete only when the API contracts, UI and migrations are implemented and the required CI checks pass. Record changed files, migrations, checks, unresolved dependencies and deferred items here. Stop before Phase 3 until this report is reviewed and approved.
