# SchoolHub mobile

Only teacher, student and guardian role contexts are supported. All other
roles, including Super Admin, are web-only. The app supports school-code lookup,
school-account sign-in, role selection, authenticator and backup-code sign-in,
password recovery and required password changes. Manage two-factor enrolment in
the web portal. The Student app includes a dashboard, timetable, assignments and text
submissions, attendance, subjects, classmates, school community, and published
reports. Guardian includes a family dashboard, child profiles, attendance,
timetable, fees, published reports, announcements and school-community lists.
Signed-in accounts can use shared notifications, messages, announcements,
profile and appearance settings, personal details, security guidance and
academic context. Development builds also expose the component gallery.
Production bundles exclude the gallery and mock routes.

## Local development

From the repository root:

```sh
pnpm install --frozen-lockfile
cp apps/mobile/.env.example apps/mobile/.env
pnpm --filter @schoolhub/mobile dev
```

The filtered command starts Expo with `apps/mobile` as the project directory.
Metro resolves `@schoolhub/shared` directly from its TypeScript source, so a
separate shared-package build is not required to start the mobile app. The API
and web workspaces still use the shared package's generated `dist` output;
build it with `pnpm --filter @schoolhub/shared build` before running those
workspaces.

Alternatively, run `npx expo start` or `pnpm dev` from `apps/mobile`. Avoid
starting Expo from the repository root without the package filter.

If Metro reports that it cannot resolve
`./apps/mobile/node_modules/expo-router/entry` from the repository root, stop
any older Expo/Metro server and restart once with a cleared cache from the app
directory:

```sh
cd apps/mobile
npx expo start --clear
```

Set EXPO_PUBLIC_API_URL to the API origin without /api; the example explains
emulator/device addresses. In particular, `10.0.2.2` is for the Android
emulator only. Use `http://localhost:3001` for the iOS simulator, or the
development computer's reachable LAN IP (for example
`http://172.26.104.18:3001`) for a physical iPhone on the same network. After
changing `.env`, restart Expo so the public variable is reloaded. Never put
credentials in an EXPO_PUBLIC variable.

## Web portal links

Set `EXPO_PUBLIC_PORTAL_ORIGIN` to the bare HTTPS origin of the school web
portal for each build environment. The guardian Fees screen opens the web
sign-in flow, then the school’s fee statement with its print and export actions.
The app passes the school subdomain only and uses the browser’s own session.

Use the same origin as the API’s `WEB_ORIGIN` for native password recovery.
The existing recovery email URL opens the native form on associated devices or
the web form in a browser. The token remains in the URL fragment and is held in
memory by the native form. School-specific web origins continue to work in the
browser.

Publish these two JSON files on the configured origin, over HTTPS, with
`Content-Type: application/json` and a direct successful response.

- `/.well-known/assetlinks.json` for Android. Include the SHA-256 fingerprints
  for the certificates that sign the distributed builds. For Play installs, use
  the Play App Signing certificate.
- `/.well-known/apple-app-site-association` for iOS. Use the Apple application
  identifier from your provisioning configuration.

Android example with a placeholder fingerprint:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.schoolhub.mobile",
      "sha256_cert_fingerprints": ["REPLACE_WITH_SIGNING_CERTIFICATE_SHA256"]
    }
  }
]
```

iOS example with a placeholder application identifier prefix:

```json
{
  "applinks": {
    "details": [
      {
        "appIDs": ["REPLACE_WITH_APP_ID_PREFIX.com.schoolhub.mobile"],
        "components": [{ "/": "/reset-password" }]
      }
    ]
  }
}
```

Rebuild and install the signed native app after changing its associated domain.
Follow the reset-link and guardian handoff checks in the
[device acceptance checklist](../../docs/validation/mobile-device-acceptance.md).
See the Expo setup guides for
[Android App Links](https://docs.expo.dev/linking/android-app-links/) and
[iOS Universal Links](https://docs.expo.dev/linking/ios-universal-links/).

## Build prerequisites

Run EAS commands from apps/mobile. The existing Expo owner/project identity is
unchanged. The development profile includes expo-dev-client; development and
preview produce internally distributed Android APKs, production produces an AAB.
The production profile increments the remote build number. App version remains
in app.json. No EAS builds or submissions have been initiated by Phase 0.

When adding or changing a native module, rebuild and reinstall the development
client before launching Metro. JavaScript bundling cannot add native code to an
already-installed app. For the iOS development client, run from apps/mobile:

```sh
npx eas-cli build --platform ios --profile development
```

Install the resulting development build on the iOS device/simulator, then start
Metro from this directory. `npx expo run:ios` is an alternative on macOS with
Xcode and the iOS simulator installed.

Configure EXPO_PUBLIC_API_URL in the matching EAS environment (development,
preview, production) before building. Use a real HTTPS origin for preview and
production. There is deliberately no fabricated production URL in eas.json.
Signing credentials belong in EAS's credential service, never in the repository.

```sh
npx eas-cli build --platform android --profile development
npx eas-cli build --platform android --profile preview
npx eas-cli build --platform android --profile production
```

The bundled assets extend the existing Lucide GraduationCap identity used by the
web sidebar. Source is assets/mark.svg; licensing is in assets/LICENSE-lucide.
Regenerate with `node scripts/generate-assets.mjs` using the installed Expo image
toolchain. Check app icons, Android masks and light/dark splash on a device.

## Validation

Phase 0 transcripts: ../../docs/validation/mobile-phase-0/.
Phase 3 details the auth and endpoint adapter at
../../docs/plans/mobile-phase-3.md; the Student app is documented at
../../docs/plans/mobile-phase-6.md. Run
`pnpm --filter @schoolhub/mobile test` and
`pnpm --filter @schoolhub/mobile verify:endpoints` from the root.
Device/emulator validation and screenshots remain required before the phases
can be declared fully complete.

## Teacher workspace (Phase 7)

Teacher tabs now use the school API for classes, rosters, register gaps, the
attendance register, score entry (including mock assessments), report recommendations,
assignments and clubs. Offline attendance batches are encrypted on the device
and replay automatically when connectivity returns. See
[offline attendance](../../docs/plans/mobile-phase-8-register.md) and
[push delivery](../../docs/plans/mobile-phase-8-push.md). See [Phase 7](../../docs/plans/mobile-phase-7.md)
for contracts, real validation transcripts and pending device acceptance.
Teacher announcement creation and documents remain deferred pending N3.

Teachers can publish class announcements to pupils or their guardians from
Announcements. Staff documents are available in More. Open a document to
share an authenticated PDF or image downloaded into the device's temporary cache.
