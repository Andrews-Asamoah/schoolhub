# Finance P5 — cash, bank and mobile-money reconciliation

Source: *SchoolHub Finance: Hardening and Completion Plan* (26 October 2026), Phase 5.

## Preconditions (blocking)

This branch starts the P5 foundation, **not** live reconciliation. As inspected on 26 October 2026, main has a date-based FinancePeriodLock and paired Transaction postings but does not yet implement the complete P2 PostingService/immutable JournalEntry/approval architecture or P4 approved AccountingPeriod close/snapshots. Do not turn on reconciliation, change receipt routing, or declare I7 green until both prior exit gates pass on production-like data.

## Phased implementation

1. Add independently tested decimal-safe statement matching and reconciliation calculations (this branch).
2. Add FinanceAccount and effective-dated payment-method routing using additive migrations. Preserve the existing cash and combined-bank accounts; **do not automatically split unidentifiable historical transactions**. Require a verified bank/wallet inventory, explicit opening dates/balances, and maker-checker approved reclassification journal entries.
3. Add CSV/Excel statement import with saved field mappings, dry-run preview, file-level idempotency and overlap check; cross-file identical lines must be reviewable rather than silently deleted because legitimate bank transactions may share date/amount/reference. Keep source files secured, audit imports and limit rows and file size.
4. Implement exact-reference candidates, amount/date suggestions and settlement-batch matching. Suggest before auto-matching until a school-specific reviewed confidence policy exists. Constrain every target to the same school, account, sign and currently unallocated amount. Never post a receipt solely because of a statement line.
5. Bank charges and transfers create journals only through P2 PostingService, with posting date guards and a unique statement-line source reference. Allow no double posting.
6. Reconciliation uses immutable statement balance evidence and book entries as-of the period end; reconcile uncleared deposits and unpresented disbursements, do not double-count cleared items. Store the itemised bridge/snapshot and prevent changes to approved reconciliations. Submit only for zero difference; an independent authorised approver signs.
7. Cashbook and physically counted cash variance require approved adjusting journals. Add I7 to nightly checks and P4 close checklist, flagging all un-reconciled active accounts.

## Rollout and safety

Each step: additive migration; production-copy dry run; tenant isolation; negative tests; exact Prisma.Decimal throughout; transaction + school-level advisory locks for matching and approvals; strict API pagination. Existing historical postings are immutable. No money, balances, financial accounts or live routing changes in this initial PR.

## Gate

A real bank statement and a real mobile-money statement must each import, match, reconcile to zero and receive independent approval. The duplicate import must be rejected. I7, I1–I6 and I10 green on a production copy; CI and audit checks pass. Document tested rollback and retain flags OFF before pilot sign-off.
