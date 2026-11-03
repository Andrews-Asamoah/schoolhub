# SchoolHub mobile

Only teacher, student and guardian role contexts are supported. All other
roles, including Super Admin, are web-only. The app supports school-code lookup,
school-account sign-in, role selection, two-factor access guidance, password
recovery and required password changes. Accounts requiring two-factor sign-in
must use the school's web portal until native verification is supported. Role
teacher and student home screens remain placeholders; Guardian now has its
family dashboard, child profiles, attendance, timetable, fees, published
reports, announcements and school-community lists.
Signed-in accounts can use shared notifications, messages, announcements,
profile and appearance settings, personal details, security guidance and
academic context. Development builds also expose the component gallery.
Production bundles exclude the gallery and mock routes.

## Local development

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @schoolhub/shared build
cp apps/mobile/.env.example apps/mobile/.env
pnpm --filter @schoolhub/mobile dev
```

The filtered command starts Expo with `apps/mobile` as the project directory.
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
emulator/device addresses. Never put credentials in an EXPO_PUBLIC variable.

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
Phase 1 adds Jest tests and endpoint verification; the contrast audit remains
Phase 2. Phase 3 details the auth and endpoint adapter at
../../docs/plans/mobile-phase-3.md. Run
`pnpm --filter @schoolhub/mobile test` and
`pnpm --filter @schoolhub/mobile verify:endpoints` from the root.
Device/emulator validation and screenshots remain required before the phases
can be declared fully complete.
