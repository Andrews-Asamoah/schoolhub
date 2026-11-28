# SchoolHub desktop development

Production releases come from `main`. See the
[production versioning runbook](../../docs/runbooks/production-versioning.md)
for Windows setup builds, signed updates and release tags.

## Frontend targets

```sh
pnpm install --frozen-lockfile --filter @schoolhub/web...
pnpm --filter @schoolhub/shared build
pnpm --filter @schoolhub/web build
pnpm --filter @schoolhub/web test
pnpm --filter @schoolhub/web build:desktop
```

The web and desktop outputs are separate (`dist` / `dist-desktop`). The desktop
build checks that it includes every shared route. All school portals are served
from the same workspace components. Platform SuperAdmin and the public application
form run in the browser. Admissions staff can copy the application link from the
desktop workspace. For deployments using another web domain, set
`VITE_SCHOOLHUB_WEB_DOMAIN` to the tenant root domain before building. Native
imports stay inside `apps/web/src/lib/platform/desktop/`.

## Build a Windows x64 executable

Build from the production source on `main`. On Windows, install Node.js 22 or
later, pnpm 12.4.1, stable Rust with the MSVC toolchain, Visual Studio Build
Tools with **Desktop development with C++**, and the Microsoft Edge WebView2
Runtime. Install Perl and NASM for the vendored OpenSSL build and make sure
both are on your PATH. See the [Tauri Windows prerequisites][tauri-prereqs].

Open PowerShell at the repository root. Replace the sample value of
`SCHOOLHUB_API_ORIGIN` with the deployed API's HTTPS origin without `/api`.
Tauri compiles this value into the executable. Rebuild if it changes.

```powershell
git switch main
git pull --ff-only origin main
rustup target add x86_64-pc-windows-msvc
pnpm install --frozen-lockfile --filter '@schoolhub/web...'
pnpm --filter '@schoolhub/shared' build

$env:SCHOOLHUB_API_ORIGIN = 'https://api.your-domain.com'
Set-Location apps/desktop
pnpm dlx '@tauri-apps/cli@2.12.6' build --ci --no-bundle --features shell --target x86_64-pc-windows-msvc -- --locked
```

Run the resulting app from `apps/desktop`:

```powershell
& '.\src-tauri\target\x86_64-pc-windows-msvc\release\schoolhub-desktop-spike.exe'
```

The Cargo executable keeps its internal filename. The app window is named
SchoolHub.

### Generate the Windows setup installer

Keep the same PowerShell session open in `apps/desktop` and run the build with
NSIS bundling enabled:

```powershell
pnpm dlx '@tauri-apps/cli@2.12.6' build --ci --features shell --target x86_64-pc-windows-msvc -- --locked
Get-ChildItem '.\src-tauri\target\x86_64-pc-windows-msvc\release\bundle\nsis\*-setup.exe'
```

Run the generated `*-setup.exe` to install SchoolHub. Local builds are for
installation testing. Use the [production versioning runbook][release-guide]
to build and publish the signed updater artifacts for school installations.

### Test against the API on your PC

With your database and API running locally, use a debug executable from
`apps/desktop`. The API must be available at the configured port.

```powershell
$env:SCHOOLHUB_API_ORIGIN = 'http://127.0.0.1:3001'
pnpm dlx '@tauri-apps/cli@2.12.6' build --ci --debug --no-bundle --features shell --target x86_64-pc-windows-msvc -- --locked
& '.\src-tauri\target\x86_64-pc-windows-msvc\debug\schoolhub-desktop-spike.exe'
```

### Build from Git Bash on Windows

If Tauri reports `cargo metadata ... program not found`, Git Bash may have
been opened before Rust was installed. Restart the app hosting the terminal
and run `cargo --version`. If Cargo is still missing, add the Rustup bin folder
to this shell's PATH. These commands start from `apps/desktop` with the shared
workspace package already built and the local API listening on port 3001.

```bash
export PATH="$(cygpath -u "$USERPROFILE")/.cargo/bin:$PATH"
hash -r
cargo --version
cargo metadata --manifest-path src-tauri/Cargo.toml --no-deps --format-version 1 > /dev/null

export SCHOOLHUB_API_ORIGIN=http://127.0.0.1:3001
pnpm.cmd dlx @tauri-apps/cli@2.12.6 build --ci --debug --no-bundle --features shell --target x86_64-pc-windows-msvc -- --locked
./src-tauri/target/x86_64-pc-windows-msvc/debug/schoolhub-desktop-spike.exe
```

To enter the desktop folder from the repository root, run `cd apps/desktop`.
From inside `apps`, run `cd desktop`. Git Bash uses forward slashes for these
paths and `export` to pass the API origin to Tauri and Cargo.

If `openssl-sys` reports `Can't locate Locale/Maketext/Simple.pm` and prints
module paths under `/usr/share/perl5`, it picked Git Bash's Perl. Point
OpenSSL at Strawberry Perl and verify the module before retrying the build.
Use the actual Strawberry Perl path from `where.exe perl` if it differs
from the example.

```bash
export OPENSSL_SRC_PERL='C:/Strawberry/perl/bin/perl.exe'
"$OPENSSL_SRC_PERL" -MLocale::Maketext::Simple -e 'print "Perl module OK\n"'
```

Keep the same shell open and rerun the build command. If the module check
fails with Strawberry Perl itself, repair the installation or install the
missing module using Strawberry Perl's CPAN client.

[tauri-prereqs]: https://v2.tauri.app/start/prerequisites/#windows
[release-guide]: ../../docs/runbooks/production-versioning.md

## Sign in and test

At launch, select the school code and sign in online. Rust handles the HTTP
connection, bearer token and short-lived 2FA cookie jar. Redirects and
SuperAdmin access are refused. Sign-in can optionally be saved in Windows Credential Manager on a personal
Windows account. At launch, enter the school and your email, then choose Use
saved sign-in to validate it online. Forget saved sign-in removes only that
account's saved credential. Passwords and challenge cookies are never saved.
Other operating systems have no persistence backend in this increment. Real API and Windows runtime sign-in remain to be
validated. The server now enforces persisted desktop session channels, plan/school desktop entitlements and a minimum client version. Apply the session-channel migration before deploying the new API; enable desktop access in the web SuperAdmin plan or subscription editor.
Table reports print from the active desktop window without opening a popup.
Windows runtime acceptance still covers print preview, file downloads and uploads.

For development with an installed Tauri CLI, use `cargo tauri dev --features
shell` from this directory. Its frontend hook runs `dev:desktop`; debug builds
use loopback HTTP unless SCHOOLHUB_API_ORIGIN is set.

### Check the local API if sign-in cannot connect

The debug executable talks directly to the NestJS API. Start the API from the
repository root and keep it running alongside PostgreSQL.

```sh
pnpm --filter @schoolhub/api dev
```

From another terminal, check the API used by the desktop build.

```sh
curl.exe --noproxy "*" -i http://127.0.0.1:3001/api/health/ready
```

HTTP 200 with `"status":"ready"` confirms both the API and database are reachable.
Connection refusal means the API is stopped or listening on another port.
HTTP 503 means the API is running but its database check failed. Check the API
terminal for the startup or database error. If the port differs from the build's
`SCHOOLHUB_API_ORIGIN`, rebuild with the API's actual origin.

## Native tests

From the repository root:

```sh
cd apps/desktop/src-tauri
cargo test --locked --lib
```

## Isolated feasibility experiments

From the repository root:

```sh
node apps/desktop/spike/check-config.mjs
node apps/desktop/spike/check-boundaries.mjs
node --test apps/desktop/spike/*.test.mjs
```

The outbox experiment uses plain SQLite, synthetic data and a synthetic server
model. Its 100 seeded child-process terminations test commit/retry boundaries;
it does not prove encrypted-store or real API crash safety. Separate Rust tests
cover native saved-session isolation and revocation, Windows credential storage, SQLCipher reopen, wrong-key handling and atomic outbox rollback,
plus native HTTP/cookie/header/token boundaries using a local fixture.

To exercise the candidate serialized cursor, install `psql` and use a disposable
PostgreSQL 16 database:

```sh
export DESKTOP_SPIKE_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/schoolhub_desktop_spike
python3 apps/desktop/spike/cursor-postgres.py
```

It creates and drops only a uniquely named test schema. The transactional
counter serializes writers so a later version cannot publish ahead of an
uncommitted earlier write. This remains a candidate; production write coverage,
contention, scope changes, pagination and snapshot consistency are unfinished.
