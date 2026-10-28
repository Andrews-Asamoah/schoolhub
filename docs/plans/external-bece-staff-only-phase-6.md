# SchoolHub — External Examinations (BECE), staff-only initial implementation

**Branch:** `dev`. Do not merge into `main`, and do not import the real WIS database as part of this work.

## Scope

- **Authorised staff only:** owners/admins manage sessions and candidate index numbers; appointed class teachers and admins enter results; headteachers review and independently lock the completed register. Appointments are checked within the school scope, not merely by globally claiming the teacher role.
- Create one BECE register per school, examination year and graduating JHS 3 class, from enrolled school pupils and class subjects. Candidate names/admission numbers and paper names/codes are snapshots; no modification to earlier termly mock or SBA records.
- BECE grades are restricted to the whole numbers **1–9**. `UNRECORDED` means no result row. Separate non-grade statuses `ABSENT`, `WITHHELD`, `CANCELLED` carry *no grade*. No fabricated mark/grade for missing or withheld results.
- Each manual grade transcription must specify a **school-held source reference**, such as the location of an authorised statement. The source reference is not a digital signature or evidence that WAEC itself verified the entry.
- Every changed result and index number is audited with before/after values, staff actor and optimistic version. The database independently validates grade/status and candidate-paper session ownership. Records are locked after the headteacher's attestation and cannot be changed via the entry routes.
- Analysis provides candidate/index completeness, paper-level recorded/pending counts, 1–9 grade distributions and non-grade status counts. **No assumed BECE aggregates, pass rates, school rankings or claims of official WAEC verification.**
- No BECE student/guardian endpoints, portal reports, verification website or public results checker.
- The whole register remains school-entered and clearly labelled `SCHOOL_ENTERED_UNVERIFIED`. It should not be presented as an official WAEC-hosted result.

## Follow-up slices

1. Validated bulk **Excel import** with dry-run preview, duplicate detection, school/class/index-number matching, explicit rejected rows and immutable import provenance; avoid CSV exports.
2. Controlled amendments to an attested/locked BECE register, requiring a separate reviewer and preserving original values.
3. Optional staff-only Excel/PDF/print exports with masked or appropriately permissioned identifiers, audit logging, retention rules and no public links.
4. Official WAEC source verification only if a separately authorised, supported source integration becomes available.

## Rollback

This is an additive Prisma migration. In a rollback, disable UI/API routes but **preserve staff-entered results, index numbers and audit records**; do not drop source tables on production rollback. PostgreSQL triggers prevent edits outside OPEN, but a privileged DBA deletion can still remove records; formal record-retention and archiving require a separate approved policy.

## Tests

CI must run Prisma generation, strict typecheck, migrations, Postgres-backed candidate/subject scope tests, status validation, duplicate/stale edits, headteacher lock, build and browser tests. Merge only with current-head green CI and GitHub's clean mergeability into `dev`.
