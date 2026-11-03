# Mobile Phase 3: authentication and endpoint layer

Branch: `feat/mobile-phase-3-auth`, based on current `dev`.
Scope: `apps/mobile` only. Mobile roles remain teacher, student and guardian;
BECE/external examinations remain blocked.

## Implemented

- The endpoint adapter supports GET, POST, PUT, PATCH and DELETE, validates
  request bodies with Zod before transport, safely encodes path/query values,
  and preserves protected-role, discovery and external-exam checks.
- Explicit public and session-only scopes cover only inventoried school lookup,
  login resolution, password recovery and password change routes. Anonymous
  requests strip authorization and role headers. Role discovery still omits
  `x-school-role`.
- `defineDownload` stores authenticated PDF bytes in the app cache, shares them
  with `expo-sharing`, and deletes the temporary file in a `finally` block.
  `useInfiniteEndpointQuery` supports page-number lists with `{ data, meta }`;
  authenticated mutations continue to use `useScopedMutation`.
- School lookup applies validated tenant branding and stores only the
  subdomain. Sign-in resolves usernames to email through the inventoried public
  route, then uses guarded Better Auth responses and server role discovery.
  Unsupported roles are locally cleared and signed out; only teacher, student
  and guardian memberships are retained.
- Added role selection, required password change, subscription retry/sign-out,
  two-factor setup guidance, and neutral password-recovery request/reset
  screens. Native two-factor sign-in is deferred; challenge-required accounts
  are directed to the school's web portal.
- Updated the mobile README and auth-event copy. Added endpoint, body/query,
  download cleanup, pagination, auth response generation, role filtering,
  password form and non-enumerating error tests.

## Decisions and API boundary

- Owner decision N1: forced password changes happen in-app through the existing
  `POST /api/account/change-password` route.
- The route inventory and API controller/service/DTO schemas were checked
  before adding endpoint declarations. No API, web, shared-package or
  dependency changes were made.
- Bearer-authenticated API requests from native clients may omit `Origin` and
  still require authentication and tenant/resource guards. The cookie-based
  Better Auth two-factor challenge needs additional Expo server/origin
  configuration, so native challenge verification is deferred and the API
  remains unchanged.
- Password-recovery email currently links to the school web origin. The mobile
  app can submit recovery requests and complete a reset when given the token;
  changing the email link destination would require a separately approved API
  change and is not included.

## Acceptance status

The automated gate is recorded in
`docs/validation/mobile-phase-3/foundation-final.txt`.

| Check | Result |
| --- | --- |
| Shared build, mobile typecheck, lint and formatting | Pass |
| Jest | 17 suites, 89 tests passed |
| Endpoint/release/auth regression tests | 40 passed; 7 declarations verified |
| Contrast audit | 1,624 pairs passed |
| Android/iOS production exports | Pass; 17 app sources each, with no development, mock or Super Admin routes |
| Expo Doctor | Not completed; `npx expo-doctor` produced no output and was stopped |
| Frozen install | Skipped; dependency manifests and lockfile are unchanged |

Seeded-account sign-in, device/emulator accessibility and visual acceptance,
screenshots, and a live API test remain outstanding. Keep the phase PR in draft
until those manual checks are completed; automated tests do not substitute for
them.
