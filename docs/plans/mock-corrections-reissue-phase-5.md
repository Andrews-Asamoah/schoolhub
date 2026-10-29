# Controlled Internal Mock Corrections and Reissues

Target and merge branch: **dev** (never main). No real WIS data was imported.

## Correction lifecycle

1. A school manager or assigned subject teacher requests a correction to a **published** Mock 1/Mock 2 report, identifying the candidate, subject, replacement mark or explicit absence, base report version, and a mandatory explanation.
2. The server verifies tenant, class, candidate, paper maximum, snapshot hash, exact previous value and current published version. One pending request per mock prevents overlapping rank recalculations.
3. A **different** authenticated headteacher approves or rejects with a separate reason. Neither the requester nor an ordinary teacher can approve.
4. An approved request creates *new report versions for the entire candidate cohort*, recalculating each average and competition rank from the **frozen previously published** grading bands. The original source score, approvals and PDF remain immutable. No locked InternalExamMark rows are overwritten.
5. Every new version returns to GENERATED. The assigned class teacher then submits a recommendation, followed by a distinct headteacher approval. Management republishes the fully approved cohort atomically. The portal shows only the newest published report for each pupil/mock; older releases remain retained for staff audit.
6. A rejected request remains in the immutable audit history; no new versions are created.

## Important operational decisions

- Absence is null, never an implicit zero. Re-ranking honours the historical grade configuration frozen with the previously published source. Subject score changes are not folded into terminal SBA.
- **Do not** assume a corrected report is immediately visible to parents: the original approved published version remains visible until the new report set completes its independent signoffs and publication.
- Pupil/guardian PDF endpoints deny direct access to a superseded report ID once a newer published version exists. Historical PDF snapshots are retained for controlled staff records, not silent family distribution.
- The SQL guard enforces append-only request decision history and blocks unreviewed and self-reviewed decisions.
- Corrected PDFs include a version/provenance notice; these are attributable electronic staff workflow approvals, not cryptographic PAdES signatures.
- BECE results remain staff-only and are never processed through this module.

## Deferred

- Retraction of erroneous published results prior to a correction; appeals; privileged audit-history PDF export; explicit school-configurable retention policies; signature-certificate infrastructure; batch import verification.
- An approved correction currently generates full-cohort fresh recommendations to keep ranking internally consistent; a more granular impact-analysis engine can be considered later.

## Rollback/verification

The migration adds an independently retained correction table and immutable reissue versions. Revert only the application release; do not delete historical source snapshots, decisions or audit events. Check Prisma generation, migrations, TypeScript, unit and PostgreSQL tests, browser E2E and clean PR mergeability on the current SHA before merging to dev.
