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

## Guardian absence requests implemented

- Add `20261105020000_attendance_excuse_requests`, an additive request/evidence/review table with date/status/decision constraints and matching Prisma relations.
- Guardians may submit a 1–31 day explanation for a currently linked ward, with one optional PDF/image up to 5 MB. Reuse private storage, existing PDF scanning/image sanitization, durable upload reservations and orphan cleanup. Object keys are never returned.
- Guardian history/evidence is restricted to the submitting guardian and a still-linked ward in the active school. Teachers, students, accountants, other guardians and other schools cannot retrieve the evidence.
- Owner/admin/headteacher review requires a decision reason and expected version. A dual-role guardian cannot review their own family's request. A second decision returns a conflict. Transactions commit the review, notification and audit together.
- Request/decision notifications contain generic portal instructions, not medical reasons or evidence. Approval never writes attendance marks or exclusions; authorised register staff retain that responsibility.
- Guardian Attendance and management Attendance include the workflow; headteacher/owner work queues include pending request counts. Histories are paginated and filterable, with explicit retry/conflict states.
- Add real HTTP/PostgreSQL tests for ward/role/school evidence boundaries and decision consistency, unit privacy/review tests and desktop/mobile browser submission/download/review/conflict-retry tests.

### Local update after pulling dev

```bash
pnpm install --frozen-lockfile
pnpm db:deploy
pnpm --filter @schoolhub/api prisma:generate
pnpm --filter @schoolhub/api exec prisma migrate status
```

Do not create an extra migration for these changes. Evidence uploads use the existing private bucket and document-scanning configuration; text-only requests do not require an uploaded file. The migration chain was replayed in PGlite and Prisma reported an empty schema diff; GitHub CI additionally applies migrations and runs integration tests against PostgreSQL.

### Performance verification

The dashboard family hub remains lazy-loaded; production builds succeed. Main-entry bundle profiling remains visible through Vite's build report (approximately 1.3 MB minified; large-chunk warnings remain nonblocking). Do not hide these warnings or claim that a network/device-specific loading budget has been proven by a local build.
