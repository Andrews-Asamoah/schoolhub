# Academic Platform — Current-State Inventory

Baseline branch inspected: `dev` at `e7584cc2104ac35f859cb1d2ad50c6731c59d02b` (2026-10-27). All feature PRs target `dev`.

This is a source-level inventory, not a complete security audit. A model existing in Prisma does not prove the workflow is complete or safe; service/controller behaviour and tests still need review.

## Existing schema capabilities

| Domain | Existing models / fields observed | Implementation implication |
|---|---|---|
| Academic calendar | `AcademicYear`, `Term`; each has date bounds and `isCurrent`. | Reuse these as the academic period backbone. Validate date ordering and school-level current-period invariants in services and database strategy. |
| Class structure | `Class`, `Department`, `Subject`, `ClassSubject`, `SubjectTeacher`, `ClassTeacherAssignment`, `TeacherAssignment`. | Extend existing class/subject/teacher scope rather than adding parallel assignment models. Review effective-date and tenant relation integrity. |
| Enrollment | `Enrollment` is present in `academics.prisma`; students also have current class-related fields. | Use enrollment records for historical cohort/attendance decisions; review status/date semantics and enforce consistent school ownership across student, class, year and term. |
| Attendance | `Attendance` in `assessment.prisma`, unique by `studentId + date`, with status, marker and timestamps. | The record supports one daily state per student. It does not by itself represent a missing/not-taken register, instructional calendar, approved exclusions or partial-day sessions; design those explicitly if needed. |
| Assessment setup | `AssessmentTemplate`, `AssessmentComponent`, `AssessmentTemplateClass`, `AssessmentExtension`. | Reuse template/component concepts; verify immutable snapshots/versioning before treating templates as historical policy. |
| Marks/results | `AssessmentScore`, `ComponentScore`; unique score key across student, subject, term and template. | Existing uniqueness helps prevent duplicate score records. Review state transitions, completeness, policy versioning and transaction/concurrency handling before expanding examination lifecycle. |
| Grading | `GradingSystem`, `GradeScale`; scales have minimum/maximum scores and grade points. | Reuse grading definitions but define validation for overlapping/gapped bands, score bounds, rounding and historical version behaviour. |
| Report cards | `ReportCardTemplate`, `ReportCardSet`, `ReportCardSetClass`, `ReportCard`. | Reuse existing report-card entities. Review their exact snapshot, PDF storage, checksum, publication/revision and approval semantics before adding a generic publication layer. |
| Remarks/development | `Remark`, `BehavioralRemark`. | Assess current fields, visibility and access rules before adding indicators. Behavioural records need privacy-aware authorization and retention, not just UI visibility. |
| Promotion | `PromotionRecord` exists in the school schema and is related to source/destination classes and students. Classes include `nextPromotionClassId` and `isGraduatingClass`. | A record and destination pointer are not sufficient to prove configurable, versioned, explainable promotion policy exists. Inspect current promotion service before deciding extension points. |
| Audit | `School` relates to `AuditLog`. | Confirm all academic state changes are audited consistently, with actor, action, target, outcome and safe change metadata. Do not assume model presence guarantees coverage. |
| Tenant root | `School` owns academic years, classes, students, subjects, report cards, assessment templates and audit logs; locale/timezone defaults include `en-GH` and `Africa/Accra`. | Tenant scoping is already a first-class schema concept. Every new relation and file workflow must preserve it. |

## Existing service entry points observed

- `apps/api/src/modules/attendance/attendance.service.ts`: attendance write path resolves current academic context, checks date bounds and enrollment, and restricts register marking to an assigned class teacher.
- `apps/api/src/modules/assessments/assessments.service.ts`: assessment score write path uses a transaction, resolves current term, checks student/subject/template/enrollment and uses teacher scope.\n- `apps/api/src/modules/assessments/report-publication.controller.ts` and `report-publication.service.ts`: existing report-card set creation, generation, review and publish flow, with school-scoped workspace/set lookup and student/guardian published-report retrieval.\n- `apps/api/src/modules/assessments/assessment-entry.ts` and `assessment-entry.spec.ts`: pure calculation/validation helpers and unit tests already exist.
- `apps/api/src/common/academic-context.ts`: shared academic context helper.
- `apps/api/src/common/scope/teacher-access.ts` and `teacher-scope.service.ts`: existing assignment-based authorization helpers.

These checks are useful foundations. They do not eliminate the need for targeted negative tests, cross-tenant tests, transaction/concurrency tests and historical-report tests.

## CI baseline on dev

The `dev` branch was inspected at commit `e7584cc2104ac35f859cb1d2ad50c6731c59d02b`.

At the time of this update the existing CI workflow only matched pull requests and pushes for `main`, so **no passing CI result has been established for a dev-targeted academic feature PR**. The dev CI trigger must be enabled, and the resulting checks must pass, before a feature PR can be merged.

The earlier successful workflow on a different branch is not accepted as proof of the dev base or feature changes.

## Gaps to verify before schema expansion

1. **Calendar semantics:** instructional-day and closure records are not represented by the observed `AcademicYear`/`Term` fields alone.
2. **Attendance completeness:** a missing register must be distinguishable from a completed register containing absences.
3. **Historical policy:** templates and grading scales need a deliberate immutable/versioned policy strategy if they can be edited after scores are recorded.
4. **Publication integrity:** a report-card review/publication workflow exists, so inspect its state transitions and persistence in detail. Verify whether report cards store immutable data snapshots, PDF checksum, approval history, version/supersession and publication metadata before designing additions.
5. **Promotion explainability:** verify the existing promotion workflow and whether each decision records the exact rule version, input snapshot and exception rationale.
6. **External exam provenance:** do not reuse ordinary school marks as if they were verified external exam facts; identify existing source/evidence models before adding new ones.
7. **Residency:** inspect student/boarding-related models across the full schema before proposing a new residency table.
8. **Security regression tests:** confirm tenant-boundary and authorization denial coverage for every route used by the vertical slice.
9. **Migration discipline:** check the current migration history and schema-generation process before writing migrations; do not delete or rewrite applied migrations to simplify development.

## Next action

Finish the service/controller/test inventory and record the policy decisions required for the first vertical slice. Then implement the smallest complete internal-examination workflow using existing models wherever possible, with any schema addition justified by a documented gap.
