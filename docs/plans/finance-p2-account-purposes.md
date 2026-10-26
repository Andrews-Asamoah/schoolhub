# P2 — Verified system account-purpose mappings

Accountants prepare effective-dated DRAFT mappings to existing active school accounts.
Only a different owner/headteacher (or platform superAdmin with recorded support reason)
may activate them. Existing chart-account balances and historical journals are never edited.

## APIs
- GET `/finance/account-purposes` shows school mappings and source chart accounts.
- POST `/finance/account-purposes` creates a DRAFT, requiring purpose, account ID,
  effective-from date (today or later), optional end date and a documented source note.
- POST `/finance/account-purposes/{mappingId}/approve` independently activates a draft,
  after checking account ownership, accounting type, receivable category and overlaps.

## Purposes
- STUDENT_RECEIVABLE: asset in the Accounts Receivable category.
- FEE_REVENUE: revenue account.
- BAD_DEBT_EXPENSE / CONCESSION_EXPENSE: expense accounts.
- DEFERRED_REVENUE / STUDENT_CREDIT_LIABILITY: liability accounts.

## Production control
An application posting service must resolve exactly one ACTIVE and in-range mapping for
its date. Missing or conflicting mapping blocks posting. Accounts are never
auto-created or silently guessed from category or code.

Before allowing source-specific P3 postings, school owners must approve these mappings,
the P2 maker/checker and journal integrity controls must pass, and all applicable
P3 revenue/refund policies and accounts must be verified. The P3 preflight now reports
missing mapping purposes; canPost remains false until its remaining gates are implemented.

Revisions must be future-effective and cannot overlap active date intervals.
Previous mappings retain their verified historical provenance.
