# Mobile Phase 6: Student

Phase 6 adds the student experience to the existing mobile client. Work stays
on the current Phase 4 branch as requested; this combines the prior mobile
phases and the Student app changes. Only student-authorized endpoints in
`docs/architecture/route-inventory.json` are used. External exams and BECE
remain out of scope.

## Implemented

- Student tabs for Home, Timetable, Learning, Attendance and More.
- Student dashboard with class and house context, the fee-status badge,
  attendance summary, today's timetable, current assignments and school notices.
- Weekly timetable, assignment details and bounded text-only submissions.
- Attendance summary and recent records; unavailable rates are not presented as
  zero.
- Current subjects and classmates, joined clubs, active school clubs and houses.
- Current assessment results, published academic reports and published
  internal mock results, with authenticated PDF downloads.
- Shared announcements, notifications, messages, profile, academic context and
  security screens remain reachable from More.
- Student-role endpoint adapters and school-scoped React Query hooks. Student
  query results opt out of persistence; profile, report and fee schemas retain
  only fields required by the mobile UI.
- Loading, retryable error, empty and success states, plus endpoint authorization,
  response-minimization, assignment validation and screen interaction tests.

## Automated validation

- `pnpm --filter @schoolhub/mobile typecheck`
- `pnpm --filter @schoolhub/mobile lint`
- `pnpm --filter @schoolhub/mobile test` — 24 suites, 162 tests passed.
- `pnpm --filter @schoolhub/mobile verify:endpoints` — 52 endpoint declarations
  match the inventory.
- `pnpm --filter @schoolhub/mobile test:release` — 41 release tests passed.
- `pnpm --filter @schoolhub/mobile audit:contrast` — 1,624 contrast pairs
  passed.
- `pnpm --filter @schoolhub/mobile format:check`
- `pnpm --filter @schoolhub/mobile exec expo export --platform ios`
- `pnpm --filter @schoolhub/mobile exec expo export --platform android`

Seeded student-account checks, Android/iOS device acceptance, accessibility
review and light/dark screenshots remain manual gates and are not claimed as
completed by automated validation. The native development client must also be
rebuilt and reinstalled after the Phase 4 `expo-asset` dependency change before
device-level startup can be considered verified. Phase 7 adds the Teacher app.
