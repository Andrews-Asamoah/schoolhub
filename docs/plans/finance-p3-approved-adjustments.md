# P3 — Pilot source-specific credit notes and write-offs

## Functionality
- DRAFT via existing `POST /finance/adjustments/drafts`
- Accountant submits the draft via `POST /finance/adjustments/{id}/submit`.
- Independent owner/headteacher approves or rejects via `POST /finance/adjustments/{id}/decide`, with reason. No self approval.
- Accountant other than approver posts via `POST /finance/adjustments/{id}/post`.
- Approved CREDIT_NOTE: Dr mapped fee revenue, Cr mapped student AR.
- Approved WRITE_OFF: Dr mapped bad-debt expense, Cr mapped student AR.
- The posted transaction, invoice and item balances, student outstanding amount, adjustment status and audit row commit atomically.

## Fail-closed requirements
1. `financeSettings.p3AdjustmentsEnabled` must be explicitly enabled after pilot reconciliation.
2. An independently approved revenue policy must exist.
3. Source bill must have a matching accrual invoice journal and be after accrual cutover.
4. The billed invoice's original receivables (and for credit notes, revenue) accounts must be identical to the approved effective-dated P2 account-purpose mappings.
5. The current invoice and component balances must cover the approved adjustment amount. Transaction dates cannot be locked.
6. A different owner/headteacher or audited superAdmin must have approved the unmodified payload.
7. Status and line mutation after submission is forbidden by PostgreSQL triggers.

## Out of scope, still blocked
Waivers require explicit concession treatment; prepaid credits and cash refunds require student-credit liabilities and P5 bank controls. Deferred fee recognition, retroactive legacy fee adjustments and P4 formal closing remain disabled until their separate accounting gates are met.

## Verification
Run the CI migration, typecheck, PostgreSQL integration tests, and I1/I2/I3 across restored pilot school data. Review invoice-status rendering for the new ADJUSTED state. Do not globally enable P3 adjustments; approve the policy and account mappings per school.
