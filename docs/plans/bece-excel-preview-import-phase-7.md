# BECE Excel imports — dry-run, atomic application and immutable provenance

The import workflow is strictly **staff only**, for a graduating JHS 3 BECE register that has already been opened. It is not a WAEC integration or external result checker.

## Procedure

1. School owners/admins set the candidate index numbers in the register first, then download a selected **subject-specific Excel (.xlsx) template**. Index numbers are formatted as TEXT to retain leading zeros. The template includes frozen subject codes, prior grades/statuses and optimistic result versions.
2. Complete the Status (`GRADED`, `ABSENT`, `WITHHELD`, `CANCELLED`), Grade (integer 1–9 only when GRADED), and a source reference identifying the school-held result statement. Empty status means *skip*, not zero or absent.
3. Upload the exact workbook for **Preview**. The service only reads: it matches existing index numbers and subject codes within the selected school/exam, rejects formulas, numeric index numbers, duplicates, unknown candidates, invalid statuses/grades, bad evidence references, altered headers, stale versions, oversized files and replays. Every rejected row includes its Excel row number and reason.
4. A whole-workbook commit is available only when all actionable rows validate and at least one result has changed. The file is **uploaded again** and its SHA-256 checked against the preview hash. After acquiring the same exam lock used for direct entry, the transaction reads the current DB records and repeats the validations. Either **all** validated updates and audit records commit, or **none** do.
5. Commit retains an append-only import batch: school, exam, importing staff actor, file name, SHA-256 and count; every changed result has a before/after version, source reference, Excel row number and batch ID in the audit log. Raw Excel contents are not stored.
6. Successful re-import of identical file bytes in the same exam is blocked. Importing a locked exam is blocked by service checks and database triggers.

**Limits:** .xlsx only (not .xls/.xlsm or CSV); 3 MB maximum; 600 result rows per workbook; six fixed column headings; at most one subject-specific template at a time.

**Privacy:** No BECE results are exposed to the student or guardian portals. The Excel template is served by an authenticated, school-scoped admin endpoint with private/no-store headers. The preview is explicitly school-entered and **NOT independently verified by WAEC**.

**Remaining next phases:** independent amendments to attested BECE results (maker/checker), staff-only printable/PDF/Excel analysis and controlled archival. The original WIS SQL dump was not read or imported.

**Rollback:** retain the import provenance table and audit records; disable UI/API endpoints without dropping or rewriting historical school-entered BECE records.

**CI gate:** no merge unless Prisma migration, API/frontend builds, unit + PostgreSQL integration tests, privacy checks and GitHub mergeability on the tested head SHA all succeed.
