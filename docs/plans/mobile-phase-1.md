# Mobile Phase 1: foundation

Owner decision (2026-11-02): only teacher, student and guardian role contexts
are in scope. Owner, admin, headteacher, staff, accountant and Super Admin
remain web-only. The server remains the authority for authentication,
permissions and resource scope. A client allowlist is not a server security
boundary. External/BECE features are disabled for all mobile v1 roles.

Branch: feat/mobile-phase-1-foundation, based on dev at 1c8f1d7 (the merge of
PR #185). Phase 0 landed before Phase 1 was published; this PR contains only
Phase 1 changes. Device checks were not performed in this environment.

The pasted baseline log came from the old dev snapshot b7cbd05. Its four
GlassTabBar errors are fixed by #185. The current dev base now includes that
fix, so future baseline jobs can typecheck it. Old failed logs remain historical
records. No Prisma or TypeScript major upgrade is required for those errors.

## Build and verify

- Reactive immutable session store with secure token storage, validated mobile
  roles, restoration race protection and protected role route groups.
- Typed/Zod endpoint registry checked against the controller inventory; scoped
  TanStack Query keys and hooks, safe cache lifecycle and role-change cleanup.
- Accessible TanStack Form/Zod field primitives, safe root error boundary and
  logging that accepts allowlisted codes only, never arbitrary payloads.
- Jest Expo/fetch mocks and component tests; endpoint and release regression
  checks in CI. No API or web changes, and no invented endpoints.

Super Admin screen migration and accountant-header tests from the supplied
plan are superseded by the owner's narrowed scope. School auth forms remain
Phase 3; payment forms and management/accountant apps are deferred from the current mobile scope.
The foundation includes only read-only school-role discovery/announcements
adapters, verified against current server response shapes. It does not pretend
to deliver the role apps or seeded-device login.

Acceptance: frozen install, shared build, mobile typecheck, strict lint,
formatter, Jest tests, endpoint verifier, script regression tests, Expo Doctor,
Android/iOS exports and release-source verification. Real output is retained
under docs/validation/mobile-phase-1. Device runs and screenshots remain pending.

## Final local acceptance result

Canonical transcript: `docs/validation/mobile-phase-1/foundation-final.txt`.
All 13 commands exited 0 using pnpm 12.4.1 (Node 24.22.1 locally; Node 22 in CI).

| Check | Result |
| --- | --- |
| Frozen install / shared build | Pass |
| Mobile typecheck / strict lint / formatting | Pass, no type or lint errors; lint allows zero warnings |
| Jest Expo / RNTL unit and component suite | 10 suites, 58 tests passed |
| Endpoint inventory verifier | 2 declarations verified |
| Endpoint and release script regression tests | 26 passed |
| Expo Doctor, online | 20/20 passed |
| Android export + source-map check | Pass, 6,227,372-byte Hermes bundle |
| iOS export + source-map check | Pass, 6,234,188-byte Hermes bundle |
| Release application source inventory | 9 entry/role files; no dev/demo, management, accountant, platform or BECE routes |
| Web/API source and dependency scope | No source changes; all non-mobile importers and 1,111 reachable snapshots preserved |

The optional @parcel/watcher native build is explicitly disabled: these CI tests
run serially without watch mode. Jest Expo 58 and RNTL 14 use the supported test
renderer; deprecated react-test-renderer was not added as a direct dependency.
Lucide's own CommonJS build is mapped for Jest, while production keeps its
normal React Native export. No mock replaces the components being tested.
Jest may emit its one-second open-handle advisory while UI callbacks drain; the
suite exits normally with code 0. No force-exit flag or timeout suppression is
used. The shared package retains its existing tsdown/experimental-TS warning.

## Implemented behavior

- Immutable subscribed sessions distinguish pending restoration, role selection,
  required password/2FA steps, paused subscriptions and ready sessions. Disk role
  values never authorize access. Server membership is filtered to three roles.
- Logout/401 clears credentials and caches. A nonsecret logout marker prevents
  rehydrating an old token if SecureStore deletion fails. Tokens never enter
  AsyncStorage. Role/account changes invalidate caches and stale form submissions.
- Request generations reject delayed auth tokens, stale session bodies and late
  API errors/successes after logout or account changes, including pending secure
  writes. Real Better Auth transport tests verify ownership and revocation with
  the captured pre-logout credential. Local logout happens before remote revocation.
- Stack.Protected gates only teacher/student/guardian groups; root navigation
  derives from session state. Role homes are explicit placeholders, not live
  dashboards or sample data. Dev previews offer no Admin/Accountant role and
  their staff-directory demo is removed.
- Every declared business adapter has a checked inventory method/path/role list
  and validates its response. Runtime role/status/BECE checks run before fetch.
  The announcements adapter supports legacy audience strings the API returns;
  author details and other unused properties are stripped.
- Protected headers are rebuilt from session state. Discovery omits x-school-role;
  all finance scope headers are removed. Anonymous lookup cannot inherit tokens.
- Scoped query keys, cancellation and guarded mutation invalidation prevent
  account/role crossover. No paused mutations or role-specific notices/timetables
  persist. Only explicitly public school metadata is eligible for future caching.
- Accessible text/select FormField primitives and a tested TanStack Form/Zod
  login controller are ready for Phase 3. The root error fallback works without
  providers/fonts and displays/logs no raw error or user data.

Phase 3 must consume only guarded auth responses (`isCurrentAuthResponse`) and
the session store; it must never establish a session from an unverified response
body or cached Better Auth atom after its request generation has changed.

## Not completed or claimed

Device/emulator tests, seeded-role sign-in, screenshots and native release builds
were not run. Phase 3 still implements school-code lookup/login, dedicated auth
screens and role selection UI. Role homes/shared features remain later phases.
No API, push-device endpoint, database migration, live school dashboard, finance
or management mobile feature is implemented by this phase. The backend still
owns authorization; a restricted client is not an authorization boundary.

PR #185 is merged. Keep this phase's PR as a draft pending device verification. No manual check is
waived or falsely reported as complete merely because implementation continued.
