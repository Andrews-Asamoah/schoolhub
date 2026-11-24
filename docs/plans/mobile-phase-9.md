# Mobile Phase 9 · Release readiness

The app supports teacher, student and guardian accounts. Validate the release
candidate after all mobile changes are integrated into `dev`. Use a signed
preview APK on Android first, then verify iOS before distributing an iOS build.

## Release configuration

The mobile workspace uses the Expo SDK 58 versions reported by Expo Doctor.
The workspace overrides vulnerable transitive Effect versions to 3.22.1 so the
production high-severity audit can pass.

- EAS preview and production builds require a bare HTTPS
  `EXPO_PUBLIC_API_URL` in the matching EAS environment.
- The preview profile builds an APK for directly invited testers.
- The production profile builds an AAB. The `internal` submit profile uploads a
  draft to the Google Play internal testing track.
- Configure Android FCM in EAS and supply the Firebase Android config via the
  `GOOGLE_SERVICES_JSON` EAS file variable. Configure iOS APNs in EAS before iOS push testing.
  Set `EXPO_PUSH_ACCESS_TOKEN` on the API deployment and apply the mobile push migration.
- Use seeded accounts and non-production pupil data for preview testing.

## Android internal release

1. Record the release commit and rerun the mobile typecheck, lint, unit tests,
   formatting, contrast audit, endpoint audit and both release bundle exports.
2. Build the signed APK with `npx eas-cli build --platform android --profile preview`
   from `apps/mobile`.
3. Record results and screenshots in the
   [device acceptance checklist](../validation/mobile-device-acceptance.md).
4. Build the AAB from the verified commit using
   `npx eas-cli build --platform android --profile production`.
5. Stage the exact build with
   `npx eas-cli submit --platform android --profile internal --id <build-id>`.
   Google Play requires the app's first upload through Play Console. Review the
   draft and grant access to the internal tester list in Play Console.

## Device checks for the release candidate

- Verify school-code sign-in, authenticator codes, backup codes, role selection,
  password change, and sign-out with seeded mobile accounts.
- Verify guardian ward switching and published report PDFs. Confirm that no
  mobile role can access BECE or external exams.
- Load a teacher register, go offline, make changes, restart the app, restore
  connectivity, and confirm the same changes arrive once. Verify a rejected
  batch is visible and a subsequent account never receives the previous queue.
- On Android and iOS devices, enable alerts, verify a push arrives in background,
  and open it into the authenticated Updates screen. Repeat after signing out
  and after switching roles. Confirm lock-screen text contains no school or
  student details.
- Record TalkBack and VoiceOver results, 200% text scaling, and light/dark
  screenshots. Verify the register stays responsive on a low-end Android phone.

Store submission, signing, push-provider configuration, seeded-account
verification and device evidence are external release gates.
