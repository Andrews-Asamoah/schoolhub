# Academic Platform Architecture and Invariants

Status: Phase 0 foundation; design contract for the academic platform roadmap.

This document is a set of implementation constraints, not a claim that every capability below already exists. Each feature phase must demonstrate compliance through code review and tests before it is considered complete.

## 1. Existing domain capabilities to reuse

The current Prisma schema already includes academic-year and term records, classes, enrollments, subjects, attendance, assessment templates/components/scores, grading systems/grade scales, report-card sets/cards, promotion records, and school-scoped audit logs. Existing services include the attendance and assessments modules.

Before adding a new model or service, inspect and extend the existing domain unless there is a documented reason not to. Do not create parallel versions of an existing academic-year, term, enrollment, grading, attendance, or report-card concept.

Important existing files include:

- `apps/api/prisma/schema/academics.prisma`
- `apps/api/prisma/schema/assessment.prisma`
- `apps/api/prisma/schema/school.prisma`
- `apps/api/src/modules/attendance/attendance.service.ts`
- `apps/api/src/modules/assessments/assessments.service.ts`
- `apps/api/src/common/academic-context.ts`
- `apps/api/src/common/scope/teacher-access.ts`
- `apps/api/src/common/scope/teacher-scope.service.ts`

Schema/model names and relations must be re-verified against the current branch before implementation. This document does not authorize a destructive schema rewrite.

## 2. Core domain boundaries

Keep responsibilities explicit and reusable:

1. **Academic calendar** — school-scoped academic years, terms, instructional days, holidays, closures and effective dates.
2. **Enrollment history** — student placement and status over time, including admission, withdrawal, transfer and class changes. Current class fields are convenient projections; historical decisions must use dated enrollment records where available.
3. **Assessment definition** — exam/assessment identity, category, sequence, subject/class scope, schedule and lifecycle.
4. **Marking and grading policy** — versioned definitions for components, maximum marks, weights, grade bands, rounding and missing/absent/exempt outcomes.
5. **Result calculation** — deterministic functions that accept explicit inputs and policy versions and return results without performing hidden database writes.
6. **Approval and publication** — workflow state transitions, authorised approvers, immutable publication snapshots, revision/supersession links and publication evidence.
7. **Student development** — structured, access-controlled observations and behaviour/development indicators, distinct from academic marks.
8. **Promotion/graduation policy** — versioned, explainable rules and separately recorded decisions.
9. **External examination evidence** — imported or manually captured source facts, evidence, identity matching and verification decisions, kept distinct from school-generated summaries.
10. **Residency history** — effective-dated day/boarding/week-boarding status where enabled.
11. **Audit and operations** — attributable changes, safe diagnostics, migration reconciliation and operational recovery.

Reuse existing models when their meaning fits. Introduce new models only for genuinely new concepts, not to duplicate these boundaries.

## 3. Tenant and authorization invariants

- Every school-owned record must be scoped to the authenticated school on every read and write; never trust a client-supplied school ID as authority.
- Verify ownership through the full relation path when a model does not carry `schoolId` directly (for example, score → student/term/template).
- Cross-tenant requests should fail closed and should not reveal whether another school's record exists.
- Use least-privilege role and resource-scope checks. A school manager role alone must not bypass explicit workflow policy or teacher/class/subject assignment rules.
- Apply the same controls to exports, generated PDFs, uploaded evidence, background jobs, caches, notifications and bulk import/export paths.
- Superadmin cross-school access, if required, must be an explicit audited capability rather than an accidental consequence of omitting a tenant filter.
- Do not put student medical details, marks, credentials, tokens or unnecessary personal data into application logs.

## 4. Academic calendar and attendance rules

Attendance and attendance statistics must use a defined date range and the student's effective enrollment interval.

For a reporting interval:

- **Eligible instructional days** are school instructional days that overlap the student's active enrollment interval.
- **Excluded days** are approved calendar closures or other explicitly approved exclusions that were not instructional days for that student/cohort.
- **Possible attendance days** = eligible instructional days after approved exclusions.
- **Attendance percentage** = days present divided by possible attendance days × 100, when possible attendance days is greater than zero.

Policy decisions that must be explicit before calculation include half-days, late arrival, early departure, excused absence, register not taken, student admission/withdrawal mid-term, transfers and overlapping exclusions. An excused absence is still an absence unless an approved policy explicitly defines otherwise. A missing register is unknown, not automatically present or absent. Zero possible days must produce a defined not-applicable result rather than division by zero.

Each published attendance summary must be reproducible from its calendar version, enrollment interval, register records, exclusions and calculation policy version.

## 5. Assessment and examination lifecycle

Use explicit state transitions; do not treat a boolean lock as a complete workflow.

Minimum conceptual states:

- Draft / configured
- Marks entry open
- Submitted for review
- Returned for correction (with reason)
- Approved
- Published
- Superseded (for a corrected publication)

Not every assessment needs every state, but transitions must be defined and authorised. Rejection and resubmission must be auditable. Published data must not be silently edited in place.

At the defined submission/lock point, freeze or version the relevant candidate, class, subject, assessment-component and grading-policy context. Prevent duplicate exam sequences and conflicting state transitions with database constraints and transaction/concurrency controls, not only UI validation.

Mark-entry APIs must verify student enrollment, assessment scope, subject assignment and mark bounds server-side. Repeating a request should not create duplicate scores or duplicate publication side effects.

## 6. Calculation and policy versioning

- Calculation code should be deterministic and separated from I/O where practical.
- Use decimal-safe arithmetic for marks, percentages and financial-like values; define rounding mode and stage explicitly.
- Every approved policy must have a stable version or immutable revision.
- Store the policy/version identifier used for every published result or promotion decision.
- Recalculation under a new policy must be an explicit, authorised operation with a preview and audit trail.
- Missing, absent, withheld, exempt and incomplete results are different domain states and must not be collapsed into zero without an approved rule.
- Dry-run outputs should explain inputs, applicable rules, intermediate calculations, exceptions and final outcomes.

## 7. Published report and document integrity

A published report should preserve enough immutable data to reproduce what the recipient saw, even after marks, policy definitions or student placement later change.

The publication record should capture, as appropriate:

- School, student, class/cohort and academic period identifiers plus display snapshots.
- Assessment/exam identity and the candidate/subject snapshot used.
- Mark/result snapshot and calculation-policy version.
- Approval decisions, approver identities, timestamps and reasons.
- Publication version, publisher and publication timestamp.
- Generated file reference, media type and content checksum.
- Link to the superseded publication when corrected.

Corrections create a new publication version and retain the prior version under the applicable retention policy. Restrict document retrieval using the same tenant and recipient authorization as the source data. A visual signature image alone is not proof of cryptographic authenticity; describe signatures accurately and use integrity verification appropriate to the threat model.

## 8. External examinations and evidence

Store external examination facts separately from SchoolHub's interpretation or summary. Preserve the exam authority, examination year/session, candidate identifier, subject and original grade/status, source/evidence reference, import batch/row, verification status, verifier and timestamps, and any correction/supersession history.

A school-generated PDF must be labelled as a school-generated summary and must not imply that it is an official examination authority certificate. Mock-to-external comparisons must use explicit subject and grade mappings and report unmatched subjects, absent candidates, missing results and incompatible grading scales instead of silently excluding them.

## 9. Promotion and graduation decisions

Promotion policies must be versioned and define cohort eligibility, required subjects, weighting, rounding, missing/absent/withheld/exempt handling, elective selection, thresholds, exceptions, approval and graduation criteria.

Every dry run must explain the rules and calculations for each student. Approval records the exact policy version and input snapshot used. Changing a policy must not silently rewrite previously approved decisions. Manual overrides require a reason, permission check and audit entry.

## 10. Data integrity, privacy and operations

- Add database-level uniqueness and foreign-key constraints for critical invariants wherever supported; application validation alone is insufficient.
- Use transactions for multi-record state transitions and idempotency keys or equivalent safeguards for retried high-impact operations.
- Use effective-dated records for facts that change over time; avoid overwriting history needed to explain past reports.
- Define access, retention, correction and deletion rules for student records, behavioural notes, uploaded evidence and published documents.
- Protect data in transit and at rest using the deployment platform's supported controls; keep secrets out of source control.
- Backups are not proven until restoration is periodically tested and documented.
- Use structured logs, correlation/request IDs, actionable alerts and safe error messages. Avoid logging sensitive payloads.
- Set and measure performance targets for large classes, bulk imports, report generation and concurrent mark entry before production rollout.
- Keep schema migrations additive where practical, reviewed, repeatable and tested against a production-like copy. Do not delete applied migration history to repair a local database.
- Any WIS migration must have source-to-target mappings, dry-run validation, reconciliation totals, exception reports, repeatability/idempotency and an explicit sign-off. Do not mix legacy migration into the initial academic vertical slice.

## 11. Required verification for each phase

A phase is not complete solely because the UI renders or typechecking passes. Its PR must include relevant evidence for:

- Unit tests for calculations and state transitions, including boundaries and invalid inputs.
- Integration tests for database constraints, transactions, duplicate requests and rollback.
- Authorization tests for allowed and denied roles/scopes.
- Cross-tenant isolation tests for reads, writes, downloads and generated documents.
- Regression tests for existing academic records and report workflows.
- Migration validation and rollback/recovery plan where schema changes occur.
- PDF tests that inspect extracted text, page count and rendered layout, not only a byte snapshot.
- Performance tests appropriate to expected school sizes and concurrency.
- Accessibility, keyboard operation and semantic feedback for user-facing flows.
- Documented user acceptance criteria and unresolved risks.

Security and migration failures are release blockers. Do not claim compliance or certification based solely on this document.

## 12. Delivery sequence

1. **Phase 0 — baseline and domain contract:** inventory existing schema/services, record current test baseline, confirm policy decisions, map tenant boundaries, and agree on invariants.
2. **Thin vertical slice:** take one internal examination from setup through mark submission, authorised review, deterministic calculation, publication snapshot and verified PDF. This validates shared contracts before broad implementation.
3. **Calendar and attendance:** build on the verified academic context and define instructional-day/absence semantics.
4. **Reusable approval/reporting:** extract proven workflow and publication primitives without duplicating current report-card capabilities.
5. **Internal examinations:** expand assessment types, sequence controls, completeness validation and approval.
6. **Development and behaviour:** add privacy-aware structured observations and report integration.
7. **Promotion/graduation:** implement versioned, explainable policy and decision records.
8. **External examinations:** add evidence and verification, then mapped comparisons.
9. **Boarding/residency:** add effective-dated residency only where the school enables it.
10. **WIS migration and production readiness:** execute as a separately gated workstream after target domain contracts and reconciliation are stable.

Phase order may be adjusted only after documenting dependencies and preserving the invariants above.
