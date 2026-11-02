# Mobile Phase 0: baseline and build prerequisites

Base: dev at b7cbd05 (PR #184).
Branch: fix/mobile-phase-0-baseline. Target: dev only.

## Owner decisions

On 2026-11-02 the owner confirmed that Super Admin must stay web-only.
This overrides D1 and every reference to retaining, migrating or testing the
mobile Super Admin screens in the supplied audit plan. Delete those routes and
the platform sign-in form. Do not add a Platform administrator entry on mobile.
The school sign-in flow remains Phase 3; until then the entry screen explains
that school access is under construction and accepts no credentials.

Keep the original brief's defaults pending later phase-specific decisions:
guardian fees view-only; offline teacher attendance only; Inter typography;
Android first; tenant brand on hero/buttons with fixed module hues. Push API
changes remain unapproved and are not part of this phase.

## Scope

0.1 Fix tab props, event dispatch, navigation, hidden-tab filtering.
0.2 Align dependencies using online Expo validation and run Expo Doctor.
0.3 Validate app.json against SDK 58, remove obsolete flags.
0.4 Exclude dev/demo routes from release bundles and gate development layouts.
0.5 Handle session events centrally; remove mobile platform administration.
0.6 Add mobile typecheck, strict lint, doctor and both exports to CI.
0.7 Add app assets and EAS development/preview/production configuration.
0.8 Format mobile source in a dedicated logic-free commit.

## SDK findings

- SDK 58 TabsClient.js normalises href:null to options.hidden:true, stripping
  href from descriptors. Custom tab bars must test hidden.
- SDK 58's config schema rejects android.edgeToEdgeEnabled (confirmed by the
  first Expo Doctor run). New Architecture has been mandatory since SDK 55;
  neither flag needs to be retained.
- Local bundledNativeModules.json requires React 19.3.0.

Sources checked on 2026-11-02:
https://expo.dev/changelog/sdk-58
https://docs.expo.dev/versions/v58.0.0/config/app/
https://docs.expo.dev/guides/new-architecture/

## Verification

Raw command output per task is in docs/validation/mobile-phase-0/.
Early gate failures are retained to distinguish existing baseline issues from
later fixes. Phase 0 is not device-verified: no Android emulator/device, adb,
Xcode, or iOS simulator is available in this Linux environment. Screenshots,
haptics, active-pill animation, launch behaviour and seeded-role sign-in must
be checked on a device before treating the phase's manual gate as complete.

## Final automated result

The canonical final transcript is
`docs/validation/mobile-phase-0/task-0.8-final.txt` (all 11 commands exit 0).
It uses Node 24.22.1 and the repository-pinned pnpm 12.4.1. Earlier task runs
used the environment's pnpm 11.25.0. CI uses Node 22 and pnpm 12.4.1.

| Check | Result |
| --- | --- |
| Frozen install | Pass, pnpm 12.4.1 |
| Shared build | Pass; upstream tsdown warns about its experimental TS 7 API |
| Mobile typecheck | Pass, zero errors |
| Mobile lint | Pass, --max-warnings 0 |
| Mobile formatter | Pass |
| Release verifier regression tests | 8 passed, zero failed |
| Expo Doctor, online | 20/20 checks passed |
| Android export with source maps | Pass; 5,403,356-byte Hermes bundle |
| iOS export with source maps | Pass; 5,410,352-byte Hermes bundle |
| Production source verification, each platform | Pass; three app sources, no dev/demo/platform routes |
| Icon regeneration | Reproducible PNGs; opaque RGB 1024px icon, transparent adaptive foreground |
| Source scope | No changes under apps/web or apps/api |
| Dependency scope | Non-mobile importers and all 1,111 reachable non-mobile snapshots preserved |

All requested Phase 0 code/tooling tasks are implemented, including removing
mobile Super Admin per the owner decision. The formatting commit contains only
Prettier output. The release-verifier tests exercise production-bundle safety;
they do not substitute for the session, API and component suite planned in
Phase 1. Endpoint verification and contrast audits remain Phases 1 and 2.

The transcripts retain both initial baseline failures and interim lockfile /
nested-npx wrapper failures, followed by successful rechecks. Only the canonical
final transcript above represents the final source state.

## Remaining manual gate — do not mark the phase fully complete

No device/emulator or Xcode was available. No native EAS build, signing,
submission, app screenshot or live seeded-account sign-in was performed.
Super Admin sign-in is intentionally inapplicable following the owner decision;
school sign-in is not implemented until Phase 3.

Before completing the Phase 0 gate, on Android (and iOS when available):

1. Launch a development build and confirm the SchoolHub school-access screen
   renders in light and dark modes; capture screenshots.
2. Open the design gallery and floating tab demo. Confirm Home, Schedule and
   More work, the hidden tab stays absent, the active pill animates and haptics
   work. Check a release build exposes neither the gallery nor mock screens.
3. Verify the icon/adaptive mask, splash and safe-area behaviour on the device.
4. Exercise all four session events; confirm credentials/cache clear and the
   entry screen plus appropriate generic toast appears.

Keep this phase's PR as a draft until its manual gate is satisfied. Later
phases must continue to keep Super Admin web-only. No push-device API change
has been approved or implemented.
