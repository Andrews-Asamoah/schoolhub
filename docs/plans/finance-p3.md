# Finance P3 — revenue adjustments, student credits, deferred revenue
Baseline: main at a43ef546d14729b6edb917faec517ea8fa111d51 (26 October 2026).

## Important dependency
P2 immutable journals, journal approval/reversal, system account keys and opening balances are NOT on main. P3 must not post ledger adjustments until those gates are green. Existing billing rejects surplus receipts; no balance is silently converted to student credit.

## Implementation stages
1. Expand-only tables with school/bill/student ownership, currency-precision constraints and draft status. Add bill adjustment amounts and fee-item recognition policy (default AT_INVOICE).
2. Draft validation that prevents misallocated, duplicate, zero and over-limit adjustments; expose read-only listing/preflight. These DRAFT rows have NO accounting effects.
3. After P2 and accountant policies, add submit→approve→post via PostingService (never update a posted journal), test AR/discount/concession invariants, write-offs and term revenue schedules.
4. Add credit liability receipts, application/refunds and bank-routing after P5; preserve reversibility.
5. Pilot with production-copy AR and cash reconciliation before switching any school on.

## Exit gate NOT YET MET
I3/I4/I5 on production copy; real journal-backed credit notes, waivers, write-offs, overpayments, refunds, deferred recognition; postings/reversals reproduce exactly. Require independently approved write-off limits, revenue recognition, refund policies and verified revenue account mappings.

## Rollback
Schema only: do not contract tables until no references/rows exist. Disabling P3 requires only keeping all associated writes blocked (disabled by default). Never delete historic posted adjustments.
