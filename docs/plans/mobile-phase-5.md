# Mobile Phase 5: Guardian

Phase 5 adds the guardian experience to the existing mobile client. Work is on
the current Phase 4 branch as requested; this intentionally combines both
phases' uncommitted changes. The implementation uses only Guardian-authorized
routes from `docs/architecture/route-inventory.json`. It does not change the
API, web application, shared package, or database, and does not add external
exam/BECE routes.

## Implemented

- Guardian tabs for Home, Children, Fees, Notices and More.
- Active-child selection in a bottom sheet, with the selection shared across
  guardian tabs and detail screens for the active app session.
- Family dashboard with attendance rate, all-time fee balance, today's
  timetable preview and latest published notice.
- Child profile hub, attendance summary/history and weekly timetable.
- View-only fee statement with balance, activity and running balances.
- Guardian-published academic report cards and internal mock results, with
  authenticated PDF downloads through the mobile download adapter.
- Published announcements, active clubs and school houses.
- Zod endpoint adapters and school-scoped React Query hooks. Guardian data
  opts out of persistence; profile and published report schemas strip
  unnecessary fields before the UI consumes them.
- UI states for loading, retryable errors, empty results and data, plus tests
  for guardian endpoint authorization/schema handling and child/fee screens.

## Validation and remaining acceptance

- `pnpm --filter @schoolhub/mobile typecheck`
- `pnpm --filter @schoolhub/mobile lint`
- `pnpm --filter @schoolhub/mobile test`
- `pnpm --filter @schoolhub/mobile verify:endpoints`
- `pnpm --filter @schoolhub/mobile test:release`

Seeded guardian-account testing, Android/iOS device acceptance, accessibility
review and light/dark screenshots remain manual gates and are not claimed as
completed by automated validation. The native development client must also be
rebuilt and reinstalled after the Phase 4 `expo-asset` dependency change before
device-level startup can be considered verified.
