# Internal Examinations — numbered JHS 3 mocks (first implementation slice)

**Target:** `dev`. Builds upon the academic platform and separate versioned term report engine. No `main` changes.

## Operational decisions

- School managers create **Mock 1**, **Mock 2** and later mock sessions for graduating JHS 3 classes. Sequence increments atomically per school, year and class; no duplicate numbers. Each session has its own snapshot roster and assigned subject papers.
- This is an **internal school examination**, not an official WAEC/BECE result. No external-result data, grades or WAEC lookups are exposed to guardians or students.
- The subject teacher assigned to a class subject can enter marks for that paper. Class teachers and managers can review within their school/class scope but cannot overwrite marks using the subject-teacher endpoint.
- Subject-paper maximum defaults to 100. Marks are constrained to 0–maximum and two decimal places; real absences are recorded with `ABSENT` and **no invented zero**.
- Entries carry `expectedVersion` to reject a stale browser save. All changes write audit records. A paper cannot be finalized until every snapshot candidate has either a mark or an explicit absence.
- Management opens draft sessions and locks the completed mock. Locked papers cannot be edited or quietly reopened.
- The database verifies paper/candidate session identity, mark range and lock state even if an application caller bypasses the UI.
- Entry is intentionally independent of terminal/SBA assessment tables and external BECE tables.

## Follow-up required to complete the wider plan

- Server-generated **signed mock report PDFs** and parent/student publication using the separate class-teacher and headteacher approval workflow.
- Configurable school-specific grade bands and positions on completed mock reports.
- Examination corrections via an explicit approval/amendment chain; never rewrite locked scores silently.
- Roster transfers and withdrawal exceptions must be handled through controlled corrections instead of silently changing the initial snapshot.
- Broader internal exam kinds (non-JHS3), historical imports and external staff-only BECE reporting are separate phases.

## Rollback

The migration adds new tables and enums; do not delete examination marks/audits in a rollback. Roll back application endpoints and UI independently, preserving all session and score data until a reviewed contract migration.

## Validation

Schema generation, TypeScript, web build, PostgreSQL migrations, unit tests, permission denial, numbering uniqueness, optimistic version conflicts, lock states, full CI and PR mergeability are mandatory before merging to `dev`.
