# Mobile Phase 2: design system

Branch: `feat/mobile-phase-2-design-system`, based on `dev` at
`79f867a0b6d5597ee4628f1031c3e91cb2e19a58` (merged Phase 1 PR #186).
The first refresh found no newer commits. A second refresh during final validation
found `c5d70e4754f349546c3338a3532d2f9a1b80b2f5`: bulk imports, finance reporting, web theme updates
and three additive inventory routes. Merged that exact `dev` commit into this
branch without conflicts and reran the full gate. Existing mobile adapter routes
and roles were not changed upstream. The Phase 2 diff against current `dev`
contains no API/web source changes; those files arrived only through the merge.
Generated mobile semantic tokens remain unchanged as required by the plan;
this phase's mobile palette is additive.
Mobile remains limited to teacher, student and guardian role contexts.
Super Admin, management/accountant apps and external examinations remain excluded.

## Implemented

- Additive mobile palette: nine module hues, navy dark surfaces, solid data cards,
  4pt spacing, generous radii and Inter typography with a 12px minimum. Generated
  web semantic tokens are unchanged. Tenant colours are validated and adjusted
  for white hero/button text and focus contrast; module hues remain independent.
- A CI contrast audit checks semantic pairs, module text/tint/icon pairs, gradient
  samples, overlapping backdrop colours and glass compositing in light/dark.
- Solid Surface/Card, HeroCard, richer StatTile, module launchers, icon chips,
  status pills, filter chips, section headers and timeline. Lists wrap text;
  student preview uses FlashList with search, class filters and a sticky header.
- SVG bar, sparkline and donut charts include visible value lists for assistive
  technology. Progress rings expose progress values, safely clamp invalid/zero
  totals, and animate on the UI thread. Numeric counters, staggered entry and
  shimmer placeholders honour Reduce Motion; the backdrop is always static.
- Search, six-digit OTP, date and select fields; action sheets and confirmation
  dialogs with explicit cancellation, busy/disabled controls and modal headings.
  Date choices use local calendar components without timezone conversion;
  changing year/month clamps a leap day to the last valid day.
- Sheet detents, scrollable content and reduced-motion support; solid toast
  feedback with success/error/info icons; module-coloured SVG empty/error art;
  skeleton hero/tile/row variants; expo-network offline information.
- Glass is chrome only. A shared depth context falls back after two glass layers.
  Low/unknown-memory Android uses the solid fallback automatically. User blur-off
  and iOS Reduce Transparency remain respected.
- The hue-aware tab bar exposes unread badges, honours hidden routes and prevented
  navigation, emits long presses, and grows with text. TabBarInsetProvider shares
  its measured clearance through useTabBarInset; screens no longer hard-code it.
- Development-only gallery covers component families and interactive states with
  light/dark, blur and 100%/130%/200% font controls. Font previews multiply text
  styles without disabling native font scaling. Updated school-access hero,
  dashboard, launcher, notices, schedule and profile previews use these primitives.

Login forms and live role data still belong to later phases. Mock previews stay
behind the existing development-only route exclusion; no mock data becomes a
production dashboard. No endpoint, API/web source, shared package, dependency or
lockfile change is introduced. No public or private school data was downloaded.

## Validation

Per-task real command output is in `docs/validation/mobile-phase-2/task-*.txt`.
Each task runs mobile typecheck, zero-warning lint, formatting, tests and contrast.
The full final transcript is `docs/validation/mobile-phase-2/foundation-final.txt`.
It also runs frozen install, shared build, endpoint and release regression checks,
Expo Doctor and source-mapped Android/iOS exports with release-source verification.

Final gate on the merged current-dev tree: **14/14 commands exited 0**.

| Check | Result |
| --- | --- |
| Frozen install, shared build | Pass |
| Mobile typecheck, strict lint, formatting | Pass, zero lint warnings |
| Unit and component tests | 13 suites, 73 tests passed |
| Contrast audit | 1,624 pairs passed |
| Endpoint inventory | 2 declarations verified |
| Endpoint/release/auth transport regression tests | 26 passed |
| Expo Doctor | 20/20 passed |
| Android export / release sources | Pass, 6,260,076-byte Hermes bundle |
| iOS export / release sources | Pass, 6,266,944-byte Hermes bundle |
| Release app source inventory | 9 allowed app files; no dev/mock, unsupported-role or BECE routes |
| API/web/shared/dependencies | No Phase 2 source or dependency changes against current dev |

Tests cover tenant contrast, low-memory fallback decisions, chart edge cases and
accessible data, filters, disabled controls, OTP input, leap-day clamping,
confirmation/cancel semantics, offline information, glass depth, tab route hiding,
prevented navigation, badge labels, measured clearance and large-text styles.

Jest can emit the existing one-second open-handle advisory while callbacks drain;
it exits normally. No forced exit or warning suppression was added. Local Node is
24.22.1 and pnpm is 12.4.1; CI uses the repository's Node 22 configuration.

## Pending manual acceptance (draft PR)

No device or emulator is available. The following acceptance checks remain open;
automated tests do not waive them:

- Before/after screenshots of every current screen in light/dark attached to PR.
- Android/iOS visual and VoiceOver/TalkBack checks; native 130% and 200% font scale,
  focus order, 44pt targets, multiline tab labels and safe areas on small screens.
- Blur-off, iOS Reduce Transparency and native Reduce Motion changes while mounted.
- Low-end Android rendering/performance, scrolling, sheets, counters and shimmer.
- Native release builds, actual school sign-in and seeded-user flows (later phases).

The synthetic low-memory policy test is not a low-end device performance run.
The gallery's font multiplier is not a native Dynamic Type or screenshot test.
Keep the PR as a draft until the required manual checks can be supplied.
