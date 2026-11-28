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

## Native tests and Windows build

Install stable Rust and a C compiler. Windows requires Visual Studio C++ build
tools, Perl and NASM for vendored OpenSSL (available on the CI Windows image).
Tests run without a graphical environment:

```sh
cd apps/desktop/src-tauri
cargo test --locked --lib
```

For a local Windows setup executable or an updater-enabled release, follow
the production versioning runbook linked above.

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
