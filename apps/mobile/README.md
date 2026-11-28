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

Set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` to the API origin without
`/api`. Use `http://10.0.2.2:3001` for the Android emulator,
`http://localhost:3001` for the iOS simulator, or your laptop’s Wi-Fi IPv4
address and API port for a physical phone. On Windows, run `ipconfig` and
read the IPv4 address under the active Wi-Fi adapter.

### School lookup on a physical phone

1. Start the API with `pnpm --filter @schoolhub/api dev` and check
   `http://localhost:3001/api/health/live` on your laptop. Use the actual
   `PORT` from the API configuration if it differs.
2. On the phone, open `http://<laptop-Wi-Fi-IP>:3001/api/health/live` in the
   browser. If the laptop probe works and this one fails, check whether
   Windows Firewall allows the API on your private network and whether the
   Wi-Fi network blocks devices from reaching one another.
3. If liveness succeeds, open `http://<laptop-Wi-Fi-IP>:3001/api/health/ready`
   to verify the database. Then open
   `http://<laptop-Wi-Fi-IP>:3001/api/schools/public/access/<school-code>`.
   A JSON array means the app’s route is reachable. An HTTP 404 means the
   server is missing the route or the request reached the wrong server.
4. Use the same laptop address in `apps/mobile/.env`, restart Metro with
   `pnpm --filter @schoolhub/mobile dev --clear`, and reopen the app. An
   installed preview or production build uses the HTTPS origin from its
   build environment and needs a new build to change its bundled value.

Expo’s Metro tunnel connects to the development server. The API origin must
also be reachable by the phone. Keep local HTTP testing on a private
development network and keep credentials out of `EXPO_PUBLIC_*` variables.

### Profile photos

Photo uploads require the public R2 storage configured in the API's root
`.env`. Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET_NAME`, and `R2_PUBLIC_URL` on the API. Restart the API after
changing those values. A local PostgreSQL database is sufficient for sign-in
and class records, while profile images are stored in R2.

## School access

Deploy the API with `GET /api/schools/public/access/:identifier` before
distributing the matching mobile app. Users enter an exact school code or
address prefix and select the matching school. The endpoint returns only
matching display and branding details. The app remembers the selected school
and reuses its branding when opening sign-in.

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

The schoolHub artwork in `assets/schoolhub-mark.png` supplies the
mobile wordmark, launcher, adaptive icon, splash and favicon, as well as the
web sign-in mark. Regenerate those assets with
`node scripts/generate-assets.mjs` from `apps/mobile` using the installed Expo
image toolchain. Rebuild the native client to see the new launcher and splash.

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

Teachers can publish class announcements to pupils or their guardians from
Announcements. Staff documents are available in More. Open a document to
share an authenticated PDF or image downloaded into the device's temporary cache.

## Teacher web and mobile workflows

- **Classes and students** use the assigned-class scope. Mobile includes a
  class directory, searchable student directory, pupils' profiles, attendance,
  and shortcuts from each class to subject marks.
- **Subjects and school reports** include the catalogue, teaching assignments
  and non-financial analytics. Classes, students and subjects support print,
  PDF and Excel export.
- **Timetable** offers personal, class, teacher and room views by academic year,
  with print, PDF and Excel export.
- **External examinations** are visible only in the teacher portal. The API
  limits registers to appointed class teachers. Mobile can review paper
  summaries and transcribe results with source references. School administrators
  and headteachers use the web workflow for their separately authorised
  operations, including creation, index numbers, imports and attestation.

## Teacher, guardian and student workflows

Teachers can save and submit assessment sheets, record absent or excused pupils,
request mark corrections, and preview CSV or Excel marks before importing them.
The report workspace supports saved recommendation drafts, bulk sign-off, and
signed archive PDFs. Internal mock analysis uses the teacher's authorised
subjects and classes.

Guardians can submit absence requests with optional private PDF or image evidence
and see school decisions under Attendance. Fee statements support printing and
PDF or Excel sharing. Students can filter assignments by status, see overdue
work, and search subjects and classmates. Both roles can preview report cards
and print or share timetables. All three roles can switch between scheduled
days and export the full week. Teacher exports include the assigned class and
room. Message history search and replies are available
to all three roles.

Rebuild the development client or signed app when adopting these changes.
Expo Print is a native module. Verify printing, file selection, file sharing,
and the signed-in workflows with seeded role accounts on Android and iOS.
