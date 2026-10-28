# SchoolHub — Internal Mock Report Publication

## Scope and branch
All implementation work targets `dev`, not `main`. This phase uses locked, independent internal Mock 1/Mock 2 examination data, not termly SBA or external WAEC/BECE results.

## Behaviour
- Managers select an existing active school grading system and generate mock reports only for a `LOCKED` exam session.
- All candidate marks and paper maximums must exist. `ABSENT` is not a zero. Absence in any paper makes the overall average/position unavailable, rather than presenting an invented average.
- Each pupil's `INTERNAL_MOCK` JSON source is frozen with the school, academic year, term, candidate identity, subject marks, grades, grading bands and competition class rank. Grades apply the explicitly documented *nearest whole percentage point* rule.
- Grade configurations must cover every integer from 0 to 100 exactly once. Reports are never silently recomputed if the school later edits its grading system.
- The assigned class teacher must write a recommendation on that pupil. A *different* headteacher must separately approve and recommend; the same actor cannot sign twice.
- Publication is school-wide for that mock session and blocked unless every frozen pupil report is individually approved and passes source-hash verification.
- Authenticated students and report-authorised guardians can list/download **published** school-issued mock PDFs only. Staff-only external BECE records do not use this module.
- PDFs contain attributable **electronic workflow approvals**, not certificate-based digital signatures or scanned handwritten signature images.
- Published reports are immutable and protected from deletion by a database guard. There is deliberately **no edit/reopen** route for a published report.

## Known follow-up requirements
- Controlled corrections and approved *new versions* for previously published exams, preserving all historical documents; this release generates the initial version only.
- Certificate-based PAdES signatures/handwritten signature-image policy, if a school specifically needs them.
- Optional subject-level class ranks, school-configurable aggregate weighting, evidence attachment review, retention/archival and export audit trails.
- WAEC BECE staff-only import and analytics; never disclose via the family PDF paths.

## CI gates
Schema generation, additive PostgreSQL migration, strict typecheck, API and browser builds, unit tests for grades/rank/printed PDF, and PostgreSQL integration for approval isolation and retention. Merge only with green CI and verified clean `dev` mergeability.

## Rollback
Do **not** drop new tables or delete published PDF-source versions or school audits. Revert the code deployment while preserving immutable report data. Grade and approval snapshots are source records and must survive rollback.
