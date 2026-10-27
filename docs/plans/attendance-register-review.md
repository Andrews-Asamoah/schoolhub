# Attendance register review and authorised exclusions

Target branch: **dev**. No changes to existing marks or account access defaults.

## Scope

- Class-level unmarked days show **eligible / marked / missing** pupil counts.
- Counts honour the term's weekday policy, holidays/make-up days, student
  admission/effective enrolment dates and individually approved exclusions.
- Non-activated schools receive clearly labelled **diagnostic preview only**.
  Historical attendance rates remain unchanged.
- Teachers see register completeness only for classes they teach. School
  managers may review all current-year classes, approve/revoke exclusions and
  declare school-wide closures. Students and guardians cannot call these
  management endpoints.
- A school's holiday/closure **affects every class**, not just the class in
  focus. The UI requires a school-wide acknowledgement and audit reason.
- A closure is rejected if *any* student already has an attendance record on
  that date, or if term reports have been published. Full-calendar replacement
  also refuses to turn days containing saved attendance into closures.
- Calendar operations and register writes acquire the same Postgres
  transaction advisory lock. A concurrency regression test exercises the
  register-versus-closure race.

## Coverage and caveats

Register completeness currently uses a student's saved **daily** attendance
status as the mark. A per-session or half-day attendance model is intentionally
out of scope. The dashboard is for the current academic year and term; adding
historical term selection and per-class date-range filters is a separate slice.

A class/term with no eligible students is not counted as an unmarked register.
Approving exclusions when attendance already exists is blocked, so the original
record cannot be silently discarded. Prior effective-dated transfers remain
the responsibility of the enrolment lifecycle workflow.

## Tests

- Pure logic tests: partial registers, effective enrolment, excluded days,
  empty roster, duplicated dates.
- Real Postgres integration tests: school-isolation, teacher class scope,
  reviewed exclusions and auditing, recorded-day holiday rejection, and
  concurrent attendance entry vs closure.

## Rollback

This phase introduces no database migration and no new persisted entities.
Revert the web/API feature commit if necessary; the existing calendar,
exclusion and attendance records remain unchanged. Existing school behaviour
can also be kept on the recorded-days method through the default-off
attendance activation policy. Do not delete audit records as part of rollback.
