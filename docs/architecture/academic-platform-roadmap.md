# Academic Platform Roadmap — Phase Gates

This roadmap tracks implementation and verification. A checkbox is complete only when the code exists on the reviewed branch and the linked CI/test evidence is available. The roadmap itself is not evidence that a capability has shipped. See the [current-state inventory](./academic-platform-current-state.md) for the initial source review and the CI baseline observed on `main`.

## Phase 0 — baseline and domain contract

- [x] Document architecture boundaries and mandatory invariants in [Academic Platform Architecture and Invariants](./academic-platform-invariants.md).
- [ ] Inventory current Prisma models, relations, migrations and services against the roadmap.
- [ ] Record the clean baseline for API tests, web tests, API/web typecheck, Prisma validation/generation, lint/theme checks and relevant CI workflows.
- [ ] Map each proposed capability to existing models and identify true schema gaps before adding models.
- [ ] Agree on academic policy decisions that cannot safely be guessed: attendance semantics, assessment states, grading/rounding, missing results, promotion criteria, external grade mappings and retention.
- [ ] Add automated cross-tenant and resource-authorization tests for the academic routes that will be reused.
- [ ] Review migration strategy and production-like test-data strategy.

**Exit gate:** architecture and domain mapping reviewed; baseline evidence recorded; unresolved policy questions assigned; no speculative duplicate domain models.

## Phase 1 — academic calendar and attendance

- [ ] Reuse existing academic year, term, enrollment and attendance concepts.
- [ ] Define school-scoped instructional days, holidays, closures and exceptions, including effective dates.
- [ ] Define register states so “not taken” is distinct from present/absent.
- [ ] Calculate attendance from dated enrollment and eligible instructional days using a versioned policy.
- [ ] Cover admission/withdrawal, transfers, partial days, lateness, approved exclusions and zero-eligible-day periods.
- [ ] Add tenant, role, date-range, uniqueness and concurrency tests.
- [ ] Verify historical attendance summaries remain reproducible.

**Exit gate:** approved policy, audited edits, reproducible summaries and tenant-isolation evidence.

## Phase 2 — shared approval and PDF publication

- [ ] Inventory and reuse existing report-card models and generation paths.
- [ ] Define reusable workflow transitions, approval authority and correction/revision semantics.
- [ ] Persist immutable publication snapshots with policy version, approvals, timestamps and file checksum.
- [ ] Enforce access control on PDF generation, storage and download.
- [ ] Test rejection/resubmission, duplicate publication, supersession and concurrent approval.
- [ ] Test PDF text, page count and visual layout.

**Exit gate:** published output is traceable, integrity-checked and correctable without silently mutating history.

## Phase 3 — internal examinations

- [ ] Define exam categories/sequences and the candidate/subject snapshot point.
- [ ] Validate assigned teacher/class/subject scope and mark bounds server-side.
- [ ] Validate completeness and distinguish missing, absent, withheld and exempt.
- [ ] Implement audited submission, review, return, approval and publication transitions.
- [ ] Make calculations deterministic and bind them to a grading-policy version.
- [ ] Prevent duplicate sequences and unsafe concurrent state changes.
- [ ] Prove one complete examination-to-PDF vertical slice before expanding exam types.

**Exit gate:** an authorised end-to-end exam workflow passes integration, security and PDF verification.

## Phase 4 — student development and behaviour

- [ ] Define a school-configurable, versioned indicator/rubric model.
- [ ] Restrict access to sensitive observations by role and purpose.
- [ ] Record author, timestamps, correction history and moderation/approval as appropriate.
- [ ] Separate behaviour/development indicators from academic marks and grades.
- [ ] Define parent/student visibility and retention before publication.
- [ ] Test access denials, correction workflows and report inclusion.

**Exit gate:** school-approved rubric, least-privilege access and traceable report inclusion.

## Phase 5 — configurable promotion and graduation

- [ ] Define versioned promotion rules, required subjects, weights, thresholds and rounding.
- [ ] Define missing/absent/withheld/exempt handling and elective eligibility.
- [ ] Provide a dry run with per-student explanations and exceptions.
- [ ] Require authorised approval and reasoned overrides.
- [ ] Persist the exact policy version and input snapshot used for each decision.
- [ ] Test policy boundaries, historical reproducibility and duplicate/concurrent decisions.

**Exit gate:** deterministic, explainable and auditable decisions; no silent recalculation of approved outcomes.

## Phase 6 — external examinations and BECE

- [ ] Define source evidence and candidate identity matching.
- [ ] Store original external subject/grade/status separately from school mappings and summaries.
- [ ] Track verification decision, verifier, import batch/row and correction history.
- [ ] Implement explicit subject and grade mappings for mock-to-external comparisons.
- [ ] Report unmatched subjects, absent candidates and incompatible grading scales.
- [ ] Label generated PDFs as school-produced summaries, not official certificates.
- [ ] Test imports, evidence permissions, mapping boundaries and reconciliation.

**Exit gate:** source facts are traceable and verified; comparisons are explainable; output cannot be mistaken for an official certificate.

## Phase 7 — boarding and residency

- [ ] Confirm enabled school types and operational needs before exposing the feature.
- [ ] Model effective-dated day, boarding and week-boarding status and transitions.
- [ ] Preserve past residency state for historical reporting.
- [ ] Define role access, reporting impact and retention.
- [ ] Test overlapping dates, transfers and report-date calculations.

**Exit gate:** residency is historical, tenant-scoped and optional for schools that do not use it.

## Phase 8 — WIS migration and production readiness

- [ ] Inventory and profile legacy source data; document mappings and assumptions.
- [ ] Run a non-destructive dry run and generate row-level exceptions.
- [ ] Reconcile source/target counts and critical totals by school, cohort, term and result type.
- [ ] Make repeat runs idempotent and preserve source identifiers/provenance.
- [ ] Validate migrated reports against selected legacy samples.
- [ ] Test backup restoration, operational monitoring, performance and recovery procedures.
- [ ] Obtain school-owner/domain-owner sign-off before cutover.
- [ ] Document cutover, rollback, data-freeze and post-cutover reconciliation.

**Exit gate:** reconciliation has no unexplained material differences; exceptions are signed off; restore and rollback procedures are rehearsed.

## Global merge/release gates

Every phase must pass the applicable checks below before it is marked complete:

- [ ] API and web typechecks/builds.
- [ ] Unit and integration tests, including transaction rollback and duplicate requests.
- [ ] Tenant-isolation and role/resource-authorization tests.
- [ ] Prisma schema validation/client generation and migration verification when schema changes.
- [ ] Existing regression suites.
- [ ] UI accessibility and theme-token checks for user-facing work.
- [ ] PDF verification for document-producing work.
- [ ] Performance/security evidence appropriate to the change.
- [ ] Review of auditability, privacy, retention and operational impact.
- [ ] CI green and reviewer approval; no unverified release claims.
