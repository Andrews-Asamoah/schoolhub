# School attendance rollout — first safety slice

**Base:** dev. **Rollout:** OFF for existing and new schools until expressly activated.

- `schools.attendancePolicyActiveFrom` is null by default. An authorised school manager may set today or a future date with a mandatory audited reason.
- A term completed before the activation date retains the original number-of-recorded-days attendance method.
- In a transition term, recorded daily marks before activation count on the historical recorded-only basis; on/after activation the configured eligible instructional dates form the denominator. Missing post-activation registers remain unknown, never absences.
- `attendanceRate` is null if post-activation eligible dates are unmarked; `provisionalRate` is calculated from recorded eligible days only, and clearly labelled in student and guardian portals. `coverageRate` and `unmarkedDays` are explicit.
- No retrospective activation is allowed through the normal API, reducing risks to already-published historical reports. Imported records need separate reviewed reconciliation.
- School-role permission checks apply at controller level; calendar and enrolment changes remain governed by the existing domain controls.

## Rollback

The additive migration may remain deployed while the feature is disabled by setting `attendancePolicyActiveFrom` back to null via the owner/headteacher admin action, supplying a reason. This restores the old attendance-rate calculation without rewriting attendance rows. Do not drop the column in a live rollback; remove it only in a separate reviewed contract migration.

## Limitations and next slices

This is not a completed term-register reconciliation workflow: approved exclusion management UI, class-level unmarked-day reporting, effective-dated withdrawals, comprehensive PostgreSQL concurrency/authorisation tests, PDF snapshots and staff-only BECE remain separate deliverables. Rollout policy is a calendar-day model, not a partial-day/session model.
