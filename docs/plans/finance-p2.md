# P2 — Immutable general-ledger foundation (increment 1)

## Implemented in this change
- Append-only journal headers and debit/credit lines (one mirrored journal per legacy paired Transaction).
- Atomic database trigger: an ordinary Transaction INSERT automatically creates exactly two lines; a journal failure rolls back the source posting.
- Valid historical transactions backfilled without changing their transaction dates, amounts, accounts, transaction IDs or cached balances.
- Invalid legacy entries (non-positive amount, self-pair, tenant mismatch) intentionally remain unmirrored and fail I3; do not guess at corrections.
- Database trigger blocks UPDATE/DELETE of posted transaction and journal rows, using an explicit archival-purge context only for approved retention workflows and test fixture cleanup.
- Closed-date and cross-tenant account checks at transaction-insert boundary.
- I3 detects unmirrored, incomplete or mismatched journals and is included in nightly invariant checks.
- Database integration tests cover atomic journal construction, immutable rows, account-pair validation and I1/I2/I3.

## Remaining P2 work before closing this phase
- Multi-line source-neutral journal posting API, balanced-header constraints checked at commit, and system-owned chart-of-account purpose keys.
- Independently approved manual journals, corrections and reversing entries with idempotency; reject draft/approved mutations.
- Full historical preflight, production-copy migration and per-school journal exception remediation.
- Period-closing concurrency controls and a consistent as-of trial balance, account reconciliation, reversal traceability.
- Database role hardening: remove arbitrary ability to set archival-purge GUC from routine application credentials.
- P0/P1 follow-up improvements remain separate.

## Deployment gates
1. Run `pnpm --filter @schoolhub/api prisma:generate`, full typecheck, lint, integration tests against migrated PostgreSQL, and build. Apply migrations to a restored production copy before live.
2. Run `GET /finance/ledger/integrity` for each school and confirm I1/I2/I3 PASS. A nonzero I3 is a blocking historical-data exception.
3. Keep P3 posting and P4 closing disabled until all P2 exit criteria and the downstream reconciliation/approval gates pass.

## Safety
Do not mutate transactions to repair discrepancies. Use independently approved reversing and correcting entries once that path exists. Archive purge is not an ordinary finance operation and must not be exposed via a web route.
