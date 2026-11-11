# Desktop feasibility spike

Internal, synthetic-data-only Phase 0 work. This is not an installable offline
SchoolHub release. No server routes, application database migrations or web
runtime behavior are changed.

## Run the executable protocol experiment

Requires Node 24 (uses the built-in experimental SQLite module):

```sh
node apps/desktop/spike/check-config.mjs
node --test apps/desktop/spike/*.test.mjs
```

The experiment uses **plain SQLite and a synthetic local server model**, not
SQLCipher or the real SchoolHub API. It terminates child processes at local
commit, server commit and acknowledgement boundaries over 100 seeded rounds.
It verifies atomic local edits/outbox writes, retry idempotency, stale-version
conflicts, and retention of conflict information. The seed is fixed for
reproducibility. These results do not demonstrate role scoping, real network
behavior or encrypted-store crash safety.

## Test native SQLCipher

Install stable Rust and a C compiler. Windows also needs Visual Studio C++ build
tools, Perl and NASM for vendored OpenSSL (available on the CI Windows image).

```sh
cd apps/desktop/src-tauri
cargo test --locked --lib
```

Tests use temporary synthetic files and fixed **test-only** passwords. They
verify ciphertext headers, wrong-key failure, reopen, local edit/outbox rollback
and rejection of a newer schema. Storage code is not exposed to the webview.
OS credential-store custody and production migrations remain separate gates.

## Build the shell on Windows

At the repository root, install dependencies and build the web assets:

```sh
pnpm install --frozen-lockfile --filter @schoolhub/web...
pnpm --filter @schoolhub/shared build
pnpm --filter @schoolhub/web build
cd apps/desktop/src-tauri
cargo build --locked --release --features shell,custom-protocol
```

The executable is under `target/release/schoolhub-desktop-spike.exe`.
It embeds the existing web build. `custom-protocol` is required to load bundled
assets instead of the development URL. This shell has no SQL/file/HTTP IPC
commands, no remote API access, no installer and no automatic updates. Existing
browser auth cannot sign in from the shell yet. The existing full route tree
is present; do not distribute it or use real accounts. Desktop route exclusion,
Rust HTTP, school selection and native identity are unfinished.

The workflow compiles the native shell; it does not launch the GUI. Use a
Windows machine to confirm render, WebView behavior, print and performance.
The Windows 2022 build does not establish Windows 10 compatibility.

## Exercise the candidate PostgreSQL cursor

Requires `psql` and a disposable PostgreSQL 16 database:

```sh
export DESKTOP_SPIKE_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/schoolhub_desktop_spike
python3 apps/desktop/spike/cursor-postgres.py
```

This script creates and drops only its own uniquely named test schema. A
transactional counter row serializes writers in one replication scope. A second
writer cannot publish a later version while the first is uncommitted; rollback
also rolls back the counter. The experiment deliberately holds the first writer
open, proves the second waits, and checks reader visibility and final ordering.
This is a candidate, not a production choice: every replicated mutation would
have to participate; per-school write contention, pagination, visibility changes
and snapshot consistency still need validation.

See `docs/plans/desktop-phase-0.md` for the acceptance gates and evidence.
