# Mobile Phase 3: school authentication

Branch: `feat/mobile-phase-3-auth`, based on current `dev` at
`1ea4e0ebcd71af501c9da5352c0e15a49127d1d9` (merged #188).
Refreshed dev during validation and merged `050e70c` without conflicts; its house
import changes are preserved. Phase 3 introduces no edits to those web/shared
files relative to the updated dev base.
Mobile supports teacher, student and guardian contexts only. There is no platform
administrator entry, privileged school-role app or external examination feature.

## Verified contracts and API adjustment

Read the installed Better Auth bearer/two-factor implementation, the server's
auth factory, origin policy, tenant guard and account/recovery services before
implementation. Password sign-in issues `set-auth-token`; the client does not
establish sessions from response-body tokens or cached Better Auth atoms.

MFA sign-in first returns `twoFactorRedirect` and a signed `better-auth.two_factor`
cookie. That challenge has no usable bearer session. The verify endpoint needs
that cookie, so Better Auth's origin check requires a trusted origin. Added only
`schoolhub://` to the shared exact origin policy and its tests, as permitted by
section 7. No origin-check bypass, Expo server plugin, database migration or new
endpoint was added. Existing HTTPS/development origin rules remain enforced.

A new real-PostgreSQL API test covers native-origin bearer enrolment, TOTP
confirmation, password/challenge sign-in, header-token issuance, bearer-only
school-role discovery and teacher-scoped school access. It creates its own
synthetic account and uses the existing test cleanup. There is no local
PostgreSQL/Docker service here; that integration case runs in CI.

The controller inventory explicitly says Better Auth plugin routes are separately
tested rather than controller routes. Verified SDK routes are sign-in/email,
get-session, sign-out, two-factor/enable, verify-totp and verify-backup-code.
All controller adapters below match `route-inventory.json` and current services.

| Method / API-relative path | Client use / server authority |
| --- | --- |
| GET /schools/public/:subdomain | Anonymous branding; retain name/logo/colours/code only, strip contact and other fields |
| POST /schools/public/:subdomain/resolve-login | Anonymous identifier resolution; generic sign-in failure preserves account privacy |
| GET /schools/roles | Authenticated discovery; deliberately omit x-school-role; server validates membership and account steps |
| POST /account/change-password | Authenticated own-account change; shared password schema, allowed before tenant-role discovery |
| POST /account/password-recovery/request | Anonymous generic-response request, optional school scope; controller-level AllowAnonymous was reviewed |
| POST /account/password-recovery/complete | Anonymous reset-token completion; shared password rules; server validates/consumes token |

The endpoint verifier has explicit reviews for these empty-role-metadata
controllers; it does not generally permit routes without role metadata. Seven
adapters verify in total, including the pre-existing announcements adapter.
No web source, shared contracts or dependency/lockfile change is included.

## Implemented flow

- School code form, validated public lookup, branding and remembered school.
  Only public branding metadata may be cached; there are no private auth queries
  or password/token mutation variables in the persisted cache.
- Username/email resolution then Better Auth email/password sign-in. Responses
  must belong to the current request generation. Unsupported/platform accounts
  are cleared and directed to the web portal; they never enter a mobile role app.
- Short-lived MFA cookie bridge: only the signed challenge cookie is retained,
  only in SecureStore when persisted, only sent on verification, and bounded to
  five minutes. No session-cookie jar or private Better Auth disk cache is used.
  All other auth uses the secure header bearer token. Cookie/identity/finance
  headers are scrubbed, native auth requests use the exact native origin and
  implicit cookie handling is disabled. Trusted-device bypass is never requested.
- Six-digit authenticator and backup-code sign-in. Enrolment displays the manual
  authenticator setup key and backup codes in memory only, then verifies TOTP.
- Mandatory password change happens before role discovery, because the real
  tenant guard rejects temporary-password users at /schools/roles. Subscription
  and MFA-required responses preserve their dedicated screens instead of being
  mistaken for logout. Completion revalidates the session and memberships.
- Central destinations and Stack.Protected groups cover loading, signed out,
  MFA challenge/setup, password change, paused subscription and role selection.
  Root providers stay mounted during later auth transitions so feedback survives
  route changes. Required steps cannot enter a business role route.
- Server-returned roles are filtered to the three supported roles. Single-role
  accounts enter their workspace; multiple roles choose a context. A protected
  shared role switcher is reachable from the workspace placeholder and clears
  query scope when switching. Role dashboards remain later phases.
- Password recovery request and completion, confirmation validation and generic
  account-existence feedback. Anonymous calls strip Origin/Referer so email links
  use the server-configured HTTPS web origin; app-scheme email delivery is not
  requested. A pasted HTTPS reset link is parsed locally and only its token is
  sent for completion. Incoming reset-token parameters are staged in SecureStore
  and scrubbed from router parameters; screen cleanup/success removes the key.
- Friendly, static error messages, a 60-second 429 cooldown, labelled TanStack
  Form/Zod fields, password reveal controls, keyboard-aware layout, skeletons,
  offline information, tenant contrast protection and reduced-motion navigation.
- Auth/JSON requests have 20-second deadlines and preserve caller cancellation,
  including startup role discovery. Logout/cancel invalidates the local session
  immediately; late auth bodies, secure writes, API responses and old form work
  cannot establish another generation's session.

## Automated validation

Canonical real output: `docs/validation/mobile-phase-3/foundation-final.txt`.
The gate runs frozen install/shared build, mobile typecheck, zero-warning lint,
formatting, contrast, tests, endpoint/release/real-client transport checks, Expo
Doctor, source-mapped Android/iOS exports with release-source checks, and API
typecheck/lint/origin-policy tests. Local Node is 24.22.1, pnpm 12.4.1; CI is Node 22.

Final local gate: **17/17 commands exited 0**.

| Check | Result |
| --- | --- |
| Frozen install / shared build | Pass |
| Mobile typecheck / strict lint / formatting | Pass, zero lint warnings |
| Unit / component tests | 15 suites, 98 tests passed |
| Contrast audit | 1,624 pairs passed |
| Endpoint inventory | 7 declarations verified |
| Endpoint / release / real-client auth transport tests | 36 passed |
| Expo Doctor | 20/20 passed |
| Android export / release sources | Pass, 6,462,292-byte Hermes bundle |
| iOS export / release sources | Pass, 6,469,036-byte Hermes bundle |
| Production app source inventory | 21 allowed app files; no dev/mock, unsupported-role or BECE routes |
| API typecheck / lint / origin-policy unit tests | Pass; 3 origin-policy tests passed |
| Native MFA server integration | PostgreSQL test added; run by CI, unavailable locally |

Tests cover the three roles, account-step ordering, MFA and backup-code handling,
unsupported accounts, role selection, 429 feedback, stale work, public recovery
origin stripping, pasted reset links, cancellation/deadlines, field validation
and disabled retries. Real Better Auth client tests verify request/response
ownership, MFA cookie/header transport and logout during pending secure writes.
Verifier regressions accept reviewed public routes and reject incorrect scopes.

Jest may emit the existing one-second open-handle advisory while callbacks drain;
it exits normally. No force-exit flag or warning suppression was added.

## Pending manual acceptance

Keep the PR as a draft. No physical device/emulator is available, so seeded
teacher/student/guardian sign-ins against a local API, actual SecureStore/native
network behaviour, authenticator setup on a device, incoming email links,
screenshots, keyboard/screen-reader checks and native release builds were not
run. Automated unit/transport tests and CI's synthetic PostgreSQL fixture do not
waive the plan's manual checks. Earlier Phase 0–2 device checks remain pending.
