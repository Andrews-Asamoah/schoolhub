# Phase 2 — Accurate finance reporting, statements and arrears

## Baseline and branch

- Base branch: `main`.
- Base commit: `d77e08a09fe8201963e05625b3cef64065862b97`.
- Work branch: `phase-2/server-reporting-statements-arrears`.
- Phase 0's CI and baseline plan exist on main at the time this plan was written. The unmerged phase-0 branch is not used as the base.

## Goals

1. Replace browser-derived finance totals with school-scoped server calculations that are correct beyond 500 records.
2. Add cursor-paginated bills/payments APIs with filter support and independent total counts.
3. Complete the student statement API for term, year, and all-time scopes with opening/running/closing balances and ageing, while respecting current role/term access rules.
4. Carry unpaid earlier-term balances forward as a labelled snapshot on new invoices without creating a duplicate charge, and allocate future payments oldest-open-bill-first.
5. Exclude optional fee items unless explicitly selected for bill generation.
6. Add the school arrears policy with a safe `SHOW_ONLY` default and enforce clearance blocking when configured.
7. Replace the guardian fees placeholder with an endpoint scoped to the signed-in guardian's linked wards.
8. Remove the misleading “Fully Paid” fallback while fee status is loading or unavailable.
9. Add tests for over-500 record reporting, statement running balances, carry-forward non-duplication, spill-over allocation, guardian isolation, and optional-item selection.

## Accounting and safety rules

- Bills are not double-counted: carry-forward is a source-referenced snapshot for invoice presentation, not a new receivable.
- Until the receivables ledger is implemented in the later accounting phase, statements derive entries from existing bills, payments, and recorded reversals. Their response must explicitly label data sources and must not claim to be the future ledger.
- All money arithmetic in new server calculations uses `Prisma.Decimal`; no JavaScript floating-point aggregation for money.
- Every query is scoped to `schoolId`, and each guardian statement request must prove the ward belongs to the current guardian.
- Tenant checks, role gates, audit safeguards, period locks, and payment idempotency safeguards must be preserved.
- Schema changes are additive. Snapshot/backfill work must not alter existing bill balances.
- This phase is implemented on its own branch and will stop at the approval gate.

## Implementation sequence

1. Inspect finance schema, service/controller contracts, current enrollment and guardian relationships, access rules, UI data dependencies, and test harness.
2. Add this plan before implementation changes.
3. Add an additive migration for arrears policy and a source-referenced previous-balance snapshot on bills; add indexes for reporting and pagination.
4. Implement safe school-scoped server-side finance summary, cursor pagination/filter validation, statement scopes and fee-status policy enforcement.
5. Update bill generation for optional item selection and brought-forward snapshot; preserve old open bills and audit the generated snapshot without charging it again.
6. Update payment allocation to deterministic oldest-open-bill-first with spill-over to subsequent balances; keep transaction and audit writes atomic.
7. Add guardian-scoped ward statement endpoint and replace the placeholder UI; add accountant statement workspace, academic year/term controls, navigation, server numbers, pagination, and status error handling.
8. Add unit/integration/property-style tests and run the repository's required verification suite.

## API design planned

- `GET /finance/summary?from&to&yearId&termId`: totals for billed, collected, outstanding, overdue, collection rate; method/class breakdowns; 0–30, 31–60, 61–90, and 90+ ageing.
- `GET /finance/bills` and `GET /finance/payments`: `{ items, nextCursor, total }`, with cursor, limit and relevant query filters. The default limit is bounded; the total is calculated independently of the page.
- `GET /finance/students/:id/statement?scope=term|year|all&from&to&yearId&termId`: opening balance, date-ordered entries with running balances, closing balance, ageing and unallocated credit.
- Guardian-only fees endpoint under students that accepts only a linked ward ID and derives the guardian from the authenticated user.

## Phase 1 dependency note

Phase 1 (global removal of CSV exports and the shared Print/PDF/Excel export menu) was not performed before this phase was requested. This phase must not add any new CSV export. Phase 2 statement and guardian fee views will use supported print/PDF/Excel paths where available without expanding scope into the global Phase 1 export refactor.

## Verification

- Required: `pnpm typecheck`, `pnpm --filter @schoolhub/api lint`, `pnpm --filter @schoolhub/api test`.
- Add database-backed integration cases for pagination and isolation; run them in CI against a fresh PostgreSQL service with migrations applied.
- Add data fixtures with over 500 bills/payments; verify page totals and summary totals against Decimal aggregates.
- Verify carry-forward is snapshot-only and doesn't increase the billed receivable a second time.
- Verify optional items are excluded by default and included only by selected IDs.
- Verify fee-status policy changes clearance output without misleading loading/error UI.
- Record exact CI results and any environmental limitation in this file.

## Phase gate

Do not begin Phase 3 or any unrelated work after Phase 2. At the end, report changed files, migration behavior and reversibility, tests and CI results, assumptions, and remaining work. Stop and await explicit approval.
