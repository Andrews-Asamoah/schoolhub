# P2 — Controlled manual journal workflow

## API
- `GET /finance/manual-journals`: list school journal batches and associated paired transaction IDs
- `POST /finance/manual-journals`: accountant creates a balanced 2–50 line DRAFT, with stable idempotency key
- `POST /finance/manual-journals/{journalId}/submit`: the creator freezes their draft, preserving a SHA-256 payload hash and generic FinanceApprovalRequest
- `POST /finance/manual-journals/{journalId}/decide`: a *different* school owner/headteacher (or platform superAdmin with support reason) approves/rejects with a note. Enforces a one-reviewer MANUAL_JOURNAL policy. No accountant can approve ordinary journals.
- `POST /finance/manual-journals/{journalId}/post`: accountant other than approver posts the approved batch atomically, using the existing FinancePostingService paired ledger door
- `POST /finance/manual-journals/{journalId}/reversal`: creates a *new* inverse DRAFT, which must follow the same maker-checker process before posting. Original source rows are never edited.

## Safety/limitations
- Manual journals are **not** the billing adjustment, supplier invoice or cash refund API. Finance operators must use source-specific workflows for AR, revenue, payroll and bank control accounts. Revenue policy and credit controls are still gated.
- The multi-line journal is decomposed into matched positive paired transactions. It is journal-batch balanced, with all pairs posted within one serializable DB transaction. Journal headers/lines themselves are not amended once submitted.
- The generic approval request is created and decided inside the same transaction as journal state; payload hash is verified at approval and posting.
- No statutory rates or prepopulated school chart purposes are invented.
- Pre-existing P2 journal immutability and P0 period-lock rules remain in force; a reversal cannot backdate into a locked period.
- This feature requires user training and reconciliation before exposure to live users. It is not yet the final P2 release; in particular, system account-purpose keys and P3/P4 controls still need sign-off.

## CI and rollout
After the additive migration, run the repository typecheck, Postgres migration/integration tests and build. Validate I1/I2/I3 on a restored production copy for every school before the first manual journal posting.
