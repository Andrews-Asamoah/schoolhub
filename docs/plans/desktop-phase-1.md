# Desktop Phase 1 — online foundation and licensing

Branch: `desktop-version`. Started 11 November 2026.
Status: **foundation implemented; R1 release not complete**.

## Phase 0 incorporation

`desktop-version` at `d7cc7ee` already contains the complete tree produced by
`feat/desktop-phase-0` at `78b089e`, plus the full proposal and updated plan.
The earlier local feature branch was renamed; GitHub has no separate
`desktop-phase-0` branch with unique changes. No duplicate or empty merge was
created. Phase 0 Windows/runtime/real-API gates remain pending; this work does
not turn model-test evidence into a successful feasibility sign-off.

## Implemented foundation

- `build:desktop` writes to `apps/web/dist-desktop`; the normal web build still
  writes to `dist`. Native and web assets are checked at bundle generation.
- Desktop routes are generated independently under ignored `src/generated/`.
  `/admin/*`, `/apply` and every SuperAdmin component are excluded. The normal
  route tree stays intact. A shared debounce hook was moved out of the
  SuperAdmin directory so school document screens can reuse it safely.
- Build-selected platform adapter for business API fetches, Better Auth fetches
  and tenant resolution. The browser adapter retains cookie auth, API base URL
  and hostname/query school selection. No native module may reach its bundle.
- A school-code screen mounts before desktop authentication/query hooks. The
  code is validated and retained in session storage, with visible storage errors.
- Rust HTTP is pinned to a compile-time bare API origin. HTTPS is mandatory in
  release; loopback HTTP is development-only. Redirects, traversal paths,
  caller-supplied credentials, arbitrary hosts and SuperAdmin API routes are
  refused. Only a small set of business headers passes through.
- Bearer token and challenge-cookie custody remain in Rust memory. Issued tokens
  are checked through get-session before activation; SuperAdmin tokens are
  refused and server logout is attempted. Auth token fields and credential
  response headers are not returned to JavaScript. Logout clears memory even
  if its network call fails. Cookies/keys are not persisted in this increment.
- JSON, binary exports and multipart bodies cross the same scoped IPC command.
  Request/response bodies are capped at 32 MiB. Caller cancellation prevents
  consuming the response, but does not cancel an in-flight Rust operation.
- The main local window receives one generated app-command permission, with no
  shell, arbitrary file, opener or generic SQL privileges. CSP permits local
  IPC; native requests do not require changing production CORS.
- CI now runs on pushes to `desktop-version`, builds both frontend targets and
  compiles the Windows native shell with the desktop assets.

## Local verification

| Check | Evidence |
| --- | --- |
| Web tests | 11 files, 65 tests passed |
| Rust tests | 5 passed: SQLCipher, origin/header/path boundaries, redirect refusal, challenge/bearer/logout handling, SuperAdmin refusal |
| Native import and shell-config checks | Passed |
| Standard web production bundle | Passed, native modules excluded by build guard |
| Desktop production bundle | Passed, SuperAdmin/application modules excluded by build guard |
| Existing 100-round outbox model | Passed in Phase 0; unchanged |

Transport tests run against a synthetic local HTTP fixture, not the live
SchoolHub API. They prove the transport mechanisms but do not prove production
Better Auth compatibility or Windows WebView behavior.

## Remaining before R1

| Requirement | Work still required |
| --- | --- |
| Production authentication | Test real API password change, TOTP, backup codes, expired/revoked sessions and tenant selection on Windows |
| Server SuperAdmin exclusion | Mark desktop sessions on the server and independently reject them in the SuperAdmin API; the current native refusal is not a substitute |
| Desktop entitlement | Plan feature/override, tenant checks, owner/admin messaging and SuperAdmin web controls |
| Client version gate | Server minimum-version policy and 426 UI |
| Credential persistence | OS-protected storage and restart/lock/account isolation; current sessions are in memory only |
| Downloads and printing | Native save-dialog/file handling and WebView2 print/PDF validation; browser download helpers remain in place |
| Signed distribution | Signing owner/certificates, installer, gated download and authorized updater manifest |
| Release checks | Windows 10+ runtime, performance, low-bandwidth behavior, dependency/security audits and remaining Phase 0 gates |

No signing certificate, installer, offline lease or entitlement is fabricated.
Do not distribute the current unsigned shell to schools or mark R1 complete.

## Follow-up order

1. Review Windows CI and run interactive native auth against a synthetic pilot
   account on the real API.
2. Add server session-channel enforcement, desktop plan entitlement and minimum
   client version policy with API tests and refreshed route inventory.
3. Add secure persistence, native file/print handling, About/update-required UI.
4. Implement gated installer/updater endpoints and sign pilot installers after
   the signing identity is provided; then complete all release acceptance gates.
