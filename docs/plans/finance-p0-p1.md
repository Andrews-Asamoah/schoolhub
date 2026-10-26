# Finance P0 + P1 implementation gate

Source: SchoolHub Finance Hardening and Completion Plan (26 October 2026).

## Current main baseline
- The finance service has independent postIncome/postExpense/postAccrualEntry/payroll posting methods; PostingService and immutable ledger are not installed.
- The finance write limiter is an in-memory sliding window (unsafe across multiple processes).
- The 2026 payroll profile is coded into finance.service.ts, and generation rejects dates outside September–December 2026.
- Only the existing paired Transaction ledger and finance date lock are available. P0 invariants I1/I2 require a verified data baseline; P1 must not activate unverified statutory schedules.

## Approach
1. Expand payroll settings schema and approval policy records (no existing records rewritten), and deploy migration on a copy.
2. Read active effective-dated schedules and schemes for payroll drafts, snapshot inputs, and refuse missing/overlapping settings; do not auto-activate guessed rates. Add tests for resolution.
3. Route transaction writers into a single posting service, preserving exact accounting semantics, then add architectural CI enforcement. Do this before declaring P0 done.
4. Add I1/I2 integration and nightly checks, independent approvals, database-backed rate limiter, payroll correction runs, immutable payslip reprints, loans/allowances/deductions, and recognition at approval.
5. Backfill existing staff pay profiles effective from an approved date, and enforce non-overlapping effective dates and school isolation.

## Safety
This initial staged branch must not change live payroll calculations before certified effective-dated schedules exist. A failed lookup must fail closed, never fall back silently. Existing draft runs must remain intact. Do not merge before CI, Postgres integration and production-copy balance checks are green.

## Exit gates
P0: I1/I2 pass for every school, only PostingService writes ledger rows, write limiter shared across instances, maker-checker audited.
P1: January 2027 payroll uses approved effective-dated settings; correction run/snapshot and general-ledger reconciliation repeat exactly; accountant signs off official tax and contribution references.
