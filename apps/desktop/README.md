# SchoolHub desktop development

All desktop work targets `desktop-version`. Phase 0 experiments and the current
Phase 1 foundation live here. **This is not a signed R1 release or an offline
SchoolHub product.** See `docs/plans/desktop-phase-1.md` for remaining gates.

## Frontend targets

```sh
pnpm install --frozen-lockfile --filter @schoolhub/web...
pnpm --filter @schoolhub/shared build
pnpm --filter @schoolhub/web build
pnpm --filter @schoolhub/web test
pnpm --filter @schoolhub/web build:desktop
```

The web and desktop outputs are separate (`dist` / `dist-desktop`). Desktop
routing omits the SuperAdmin portal and school application route. Native
imports stay inside `apps/web/src/lib/platform/desktop/`, and both bundles have
build checks to enforce the separation.

## Native tests and Windows build

Install stable Rust and a C compiler. Windows requires Visual Studio C++ build
tools, Perl and NASM for vendored OpenSSL (available on the CI Windows image).
Tests run without a graphical environment:

```sh
cd apps/desktop/src-tauri
cargo test --locked --lib
```

To compile a release-mode development executable on Windows, build the desktop
frontend first, then use PowerShell to pin the actual API origin:

```powershell
$env:SCHOOLHUB_API_ORIGIN = "https://your-api.example"
cargo build --locked --release --features shell,custom-protocol
```

The executable is `target/release/schoolhub-desktop-spike.exe`. Its title and
identifier still indicate the internal spike. A release build refuses to start
without a bare HTTPS API origin. Changing the environment variable requires
recompilation. CI uses an intentionally non-routable placeholder origin; that
binary is a compile check, not a runnable deployment for a school.

At launch, select the school code and sign in online. Rust handles the HTTP
connection, bearer token and short-lived 2FA cookie jar. Redirects and
SuperAdmin access are refused. Sessions live only in memory, so restarting
requires signing in again. Real API and Windows runtime sign-in remain to be
validated. The server now enforces persisted desktop session channels, plan/school desktop entitlements and a minimum client version. Apply the session-channel migration before deploying the new API; enable desktop access in the web SuperAdmin plan or subscription editor.
Downloads/printing still use browser helpers and are not accepted native
features yet. No installer or updater is produced.

For development with an installed Tauri CLI, use `cargo tauri dev --features
shell` from this directory. Its frontend hook runs `dev:desktop`; debug builds
use loopback HTTP unless SCHOOLHUB_API_ORIGIN is set.

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
cover native SQLCipher reopen, wrong-key handling and atomic outbox rollback,
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
