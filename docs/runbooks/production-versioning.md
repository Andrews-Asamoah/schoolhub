# SchoolHub production releases

`main` is the production source for web, API, mobile and desktop. Use the root
`package.json` as the only version you edit. Version numbers use
`MAJOR.MINOR.PATCH` for breaking changes, features and fixes. Expo continues
to increment store build numbers through the production EAS profile.

A change may affect a single app. Call that out in the release notes and bump
the shared version using the usual process. The current tag workflow prepares
builds for all three apps. Approve the web deployment, mobile store submission
and desktop release on their respective schedules.

## Prepare a version

1. Change `version` in the root `package.json`.
2. From the root, run `pnpm version:sync` and `pnpm version:check`. Commit the
   synchronized files with the root change and merge the PR into `main`.
3. Wait for CI and Container images to succeed for that commit on `main`.
4. Tag the approved commit. Use a release tag for each version. Feature branches
   and PRs can follow the existing development process.

```powershell
git switch main
git pull --ff-only origin main
pnpm version:check --tag=v0.2.0
git tag -a v0.2.0 -m "SchoolHub v0.2.0"
git push origin v0.2.0
```

The tag starts **Production release**. The workflow checks the tag version and
its ancestry from `main`, retrieves the exact commit's verified web/API manifest,
builds Android and iOS through EAS and builds a Windows x64 setup executable.
It stages a draft GitHub release with the installer, its updater signature,
`latest.json` and the image manifest.

Promote the web/API digests with the existing
[release promotion procedure](./release-promotion.md). Submit the tested EAS
builds through the app stores. Once the API is ready and you've tested the
Windows installer, publish the draft and mark it as the latest release. The
desktop app only sees published releases. Keep the downloads attached to each
release so older clients can use their versioned asset URL during an update.

## One-time release setup

- Create a GitHub Actions environment named `production-release`. Restrict who
  can create or modify `v*` tags and require a reviewer for the environment.
- Set `SCHOOLHUB_API_ORIGIN` as an environment variable to the deployed HTTPS
  API origin without `/api`. Configure the existing EAS production environment
  and production credentials for both platforms. Store the Expo access token as
  the `EXPO_TOKEN` environment secret.
- Generate a dedicated Tauri update key once. On Windows PowerShell, from
  `apps/desktop`, run:

  ```powershell
  New-Item -ItemType Directory -Force "$env:USERPROFILE\.tauri" | Out-Null
  pnpm dlx "@tauri-apps/cli@2.12.6" signer generate -w "$env:USERPROFILE\.tauri\schoolhub.key"
  ```

- Copy the contents of the `.pub` file to the
  `SCHOOLHUB_UPDATER_PUBLIC_KEY` environment variable. Save the private key
  contents in the `TAURI_SIGNING_PRIVATE_KEY` environment secret and its
  password in `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Back up both securely.
  These signatures verify downloads inside SchoolHub. Use Windows Authenticode
  signing separately before wider distribution if your Windows policy requires it.

The first updater-enabled version needs a manual installation. Confirm
**My profile → About SchoolHub → Check for updates** and test one published
version upgrading to the next on a Windows test account. The app checks on
startup and periodically while open. Installation starts after user confirmation.

## Build a Windows executable locally

Follow the [desktop README](../../apps/desktop/README.md#build-a-windows-x64-executable)
for the standalone executable, Windows setup installer and local API testing.
