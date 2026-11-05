# Portal audit remediation — 5 November 2026

## Defect fixes

- F01: Guardian dashboard dispatches the family hub and never calls staff analytics.
- F02/F03: A principal/organization/role boundary cancels and destroys the old cache before mounting a new context. All sign-out entry points share cleanup and failure handling. Cross-tab role events use the same boundary; session expiry/account replacement clears private preferences.
- F04: Teacher aggregate analytics no longer fetch or return identifiable school-wide admission activity. Teacher roster/mark scope remains server-enforced.
- F05: SBA/mock drafts survive changed server snapshots and navigation with tab-local 24-hour recovery scoped to account, school, role, term and paper. Route/tab-close and role/period changes warn about unsaved work. SBA writes include original marks and term; a transaction advisory lock plus expected-mark check rejects stale writes. Mock edits retain their original expected version. Explicit discard is available after conflicts.
- F06: Role page lists are explicit and unknown roles are denied. Management menus/direct URLs exclude personal family/student destinations.
- F07: Headteacher management controls match the API's existing administrator inheritance. Finance and independent recommendation roles remain separate.
- F08: SuperAdmin lists, recovery and final-administrator checks use primary plus additional owner/admin/headteacher roles.
- F09: New cursor-paged inbox/sent endpoints use timestamp+ID ordering, scoped search and total unread counts. Web provides older-history loading. Legacy array endpoints remain compatible with deployed mobile clients.
- F10: Attendance failures hide zero-valued KPI cards and announce the unavailable state with retry.
- F11: Chart labels now explicitly describe the admission history of *currently active* students, not historical enrollment. Money aggregation uses decimals; collections are labelled cash collections rather than accrual revenue.

## Validation

Web typecheck/build, theme check, 30 web unit tests, 572 API unit tests, existing 11 browser suites, new portal-boundary browser checks, API lint/typecheck and route inventory were exercised locally. Database-dependent tests run in CI; a new PostgreSQL fixture races two SBA writes and asserts only one draft succeeds. Existing nonblocking API lint and large-chunk warnings remain.

## Feature work

The follow-on changes add role-specific work queues, shared family ward context, published-report history filters and per-school operations readiness. The absence-request proposal is a separate reviewed workflow: it must never directly mutate the attendance register.

## Role-specific features implemented

- Teacher dashboard shows assigned weekly lessons, class registers, owned ungraded submissions and assigned open mock papers; it does not call school-wide analytics.
- Headteacher dashboard adds latest-version mock/term recommendations, publication queues, corrections and attendance-review entry points. Existing independent approval/publication controls remain authoritative.
- Admin/owner/headteacher data-quality checks flag missing guardian links, missing current-term enrollment, unassigned teaching subjects and possible duplicate identities. Duplicate checks explicitly sample the first 5,000 records and require human review.
- Student dashboard adds current-term upcoming assignments and feedback status, scoped to the authenticated pupil's enrollment.
- Guardian selection is shared across attendance, timetable, fees and published reports, scoped to account/school and cleared on logout. Published SBA/mock history can be filtered by child, academic year and term.
- SuperAdmin school detail adds configuration/migration readiness, notification-failure counts and worker incidents without exposing payloads. Only failed finance-integrity checks can be requeued; the school/job/status checks and audit reason are enforced server-side.
- Add desktop/mobile portal-workflow and mark-draft recovery browser checks to CI. No schema migration is needed for these additions.
