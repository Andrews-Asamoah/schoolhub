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
