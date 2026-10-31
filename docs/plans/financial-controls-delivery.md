# Reconciliation and close workflow

Target: dev. This replaces disconnected components with stored statements, scoped API operations and accountant/reporting screens. Do not declare production acceptance from a local unit-test result.

## Delivered workflow

- CSV/XLSX statement decoding, explicit mappings, 5 MB/5000-row limits, precise decimals and opening-plus-movement verification.
- Persisted immutable statement rows and file SHA256; duplicate-file/overlapping-period rejection. Duplicate rows require a documented review.
- Account lookup restricts imports to the current school's active cash/bank asset accounts. Separate bank/wallet chart accounts must already exist; this change does not invent or reroute historical payment accounts.
- Partial and many-to-one matching of existing postings, capped on both sides; all mutations serialized by school. Database triggers also enforce ownership, direction and allocation limits.
- Every statement line must be allocated before submission; unresolved book entries become itemized deposits in transit/unpresented payments. Statements must follow approved prior statements without a balance/date gap.
- Maker-checker decisions: owner/headteacher, different from preparer, meaningful note, exact submitted evidence hash. Rejected evidence can return to draft with its old decision/snapshot retained in AuditLog. Approved evidence is immutable.
- Reconciliation imports never create receipts or journals. Bank charges/corrections use existing independent manual-journal approval/posting, then are matched to statement evidence. Transfers need valid paired account postings.
- Close requests bind historical journal snapshot, AR checks and approved bank/cash reconciliation evidence. Independent approval recomputes evidence and verifies its hash before saving an immutable versioned snapshot and setting CLOSED/legacy posting lock atomically.
- Reopen requests require independent approval and apply only to the latest closed month; previous snapshots and events remain intact. A subsequent valid reclose adds a new snapshot version.
- Finance source changes serialize against close collection; database posting guards reject closed-period entries. The legacy lock endpoint cannot lower a boundary beneath an approved CLOSED period.

## Conservative restrictions and acceptance

- Closing is MONTH-only. Term/year financial statements aggregate months; they are not separate close lifecycles here.
- Nonzero payable/accrued balances and deferred-revenue/student-credit control balances block closing until supported settlement/subledger evidence exists. This intentionally does not silently certify missing statutory/P3 controls.
- Approved bank evidence remains immutable. After reopening a period, a preparer can create a new reconciliation version, correct its matches and obtain new independent approval. Earlier versions retain their snapshots and match rows.
- Original source bytes are retained in the database with immutable decoded rows and SHA256. Retrieval is authenticated, school-scoped, audited and attachment-only with no-store/nosniff headers. Apply database encryption and retention policies operationally.
- All bank/wallet accounts must be configured accurately before use. This release does not split combined historical accounts automatically.
- Required acceptance: real PostgreSQL CI migration/workflow tests; browser review for accountant/owner/headteacher; statement overlap/concurrent allocation tests; actual bank/mobile-money pilot; source retention and migration review. No live financial data has been changed by development.
