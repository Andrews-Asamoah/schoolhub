# Desktop app, Phase 0: feasibility spike

Status: scaffold built; Windows checks outstanding. Part of the offline-first desktop plan
(Phase 0 of 6). This phase answers one question: **go or no-go on Tauri, SQLCipher and the sync design**,
before any production code is written. Nothing here ships. The spike screen and `spike_crash`
command are deleted at the start of Phase 1.

## What exists

| Piece | Where | What it proves |
|---|---|---|
| Tauri v2 shell | `apps/desktop/src-tauri` | The shell builds; only listed commands are callable; strict CSP; HTTP limited to the API origin |
| Encrypted database | `src-tauri/src/localdb.rs` | SQLCipher file is unreadable without its key; atomic transactions; data survives reopen |
| Credential store | `src-tauri/src/credentials.rs` | Per-school, per-user database keys and bearer tokens kept in the OS store, not in files |
| Spike screen | `apps/desktop/spike-ui` | The checks below, runnable by hand on a real PC |
| Sync reference model | `apps/desktop/spike/` | Outbox plus idempotent ledger survives crashes, lost replies and duplicate delivery |
| Mock sync server | `spike/mock-sync-server.mjs` | Lets the spike screen push over a real network connection |
| Web bundle check | `pnpm --filter @schoolhub/web build:desktop` | The existing web app loads inside the shell and survives a hard refresh |

## Verified so far (on Linux, in development)

- `cargo check` and `cargo test` pass with SQLCipher compiled in and the system OpenSSL.
- 200 randomized crash-and-retry runs of the sync model: no command lost, none applied twice, every
  rejected command flagged rather than dropped (`pnpm --filter @schoolhub/desktop test`).
- The naive "highest change seen" cursor skips changes under interleaved commits, and the
  "oldest open transaction" cursor never does. This is why the plan specifies the safe cursor.

**Not verified yet, needs a Windows PC:** everything in the checklist below.

## Findings that change the plan

1. **The HTTP plugin keeps a cookie jar and saves it to disk.** `tauri-plugin-http` has a `cookies`
   feature on by default. It loads `.cookies` from the app cache folder at start and saves it when the app
   exits. That makes the 2FA challenge cookie work, but Better Auth's session cookie lasts days, so it would be
   written to disk unencrypted, which defeats keeping the token in the credential store.
   **Verify (check 6) and then decide:** build the plugin with `default-features = false` and handle
   the short-lived 2FA cookie in our own in-memory Rust command, or delete the jar on exit.
   Recommended: our own in-memory handling.
2. **Tauri needs an `icons/icon.png` to compile**, even with no bundle icons listed, and Windows needs `icons/icon.ico`.
   Placeholder icons are committed; real branding is a Phase 1 task.
3. **The URL scope in `capabilities/default.json` is the only thing limiting which servers the app can reach.**
   Change `localhost:3001` to your real API address; production builds must list only that origin.

## Prerequisites on Windows 10 or 11

1. **Rust** (stable, MSVC): install from rustup.rs and accept the default `x86_64-pc-windows-msvc` toolchain.
2. **Visual Studio Build Tools**, workload "Desktop development with C++".
3. **WebView2 runtime** (already present on current Windows 10 and 11; otherwise the Evergreen installer).
4. **Strawberry Perl**, needed only because the Windows build compiles OpenSSL from source
   (`--features vendored-openssl`). Git for Windows' bundled Perl often fails here, so use Strawberry.
5. Node and pnpm, as for the rest of the repo, then `pnpm install` at the repo root.

## Runbook

Run each in a terminal at the repo root. Use two extra terminals for the API and the mock server.

```bash
# Terminal A: the API as usual (port 3001)
pnpm --filter @schoolhub/api dev

# Terminal B: the mock sync server (port 4455)
pnpm --filter @schoolhub/desktop mock-server

# Terminal C: the protocol tests, then the Rust tests (the first Rust build takes several minutes)
pnpm --filter @schoolhub/desktop test
cd apps/desktop/src-tauri && cargo test --features vendored-openssl && cd ../../..

# Terminal C: the spike app
pnpm --filter @schoolhub/desktop dev -- --features vendored-openssl

# Web bundle check (check 7): build the web app for the shell, then load it
pnpm --filter @schoolhub/web build:desktop
pnpm --filter @schoolhub/desktop dev:web -- --features vendored-openssl
```

## Checklist

Record every result in the table at the end, including failures. A failure with a documented fallback is still a pass for Phase 0.

| # | Check | How | Pass when |
|---|---|---|---|
| 1 | SQLCipher builds on Windows | `cargo test --features vendored-openssl` | All Rust tests pass. If it fails, record the error; fallback is field-level encryption |
| 2 | Credential store round trip | Spike screen, section 1 | PASS in the log |
| 3 | Database encrypted at rest | Section 2: open, then Inspect | "header is not plain SQLite". Also open the `.sqlite` file in a hex viewer: no readable names |
| 4 | Wipe removes data and key | Section 2: Wipe, then open again | The new database is empty and a new key is created |
| 5 | Sign-in over Rust HTTP | Section 3, a normal account | Token stored, and "Who am I" shows the user |
| 6 | **2FA over Rust HTTP** | Section 3, an account with 2FA: Sign in, then Submit 2FA code. Then close the app and look in `%LOCALAPPDATA%\com.schoolhub.desktop.spike` for a `.cookies` file | The code is accepted (cookie survived between requests). Record whether `.cookies` exists and whether it holds a session cookie (finding 1) |
| 7 | Web bundle loads and refreshes | `dev:web`, sign in, open a nested page such as an assessments tab, press Ctrl+R | The page reloads on the same route and does not show a blank screen or 404 |
| 8 | Offline write survives a crash | Section 4: Record a register twice, click "Crash the app now", reopen and open the database | The two registers are still waiting to send, none lost |
| 9 | Lost reply is recognised | Mock server running. Choose "Lose the reply after the server applied it", Record, Sync now (it fails), then choose None and Sync now | Compare shows each command applied once ("no command applied twice") and local outbox is 0 |
| 10 | Locked register is flagged | Record for a locked register, Sync now | One entry in "need attention", nothing dropped |
| 11 | Kill-and-retry, 100 times | Repeat check 8 and 9 with a mix of crashes, or script it | No lost or duplicated command in 100 attempts. The logic-level version already passes 200 randomized runs |
| 12 | Works on a throttled link | Limit the network to about 64 kbps with 1 second latency and 10% loss (Windows: the Clumsy tool, filter `outbound and tcp.DstPort == 4455`). Record 20 registers, Sync now | The sync completes, or fails cleanly and a later try finishes it. Note bytes sent and time for 20 registers |
| 13 | PDF save and print | Not in this spike screen: test in Phase 1 with the report PDF endpoint | Deferred |
| 14 | Installer size and install | `pnpm --filter @schoolhub/desktop build -- --features vendored-openssl` | An NSIS installer under 20 MB that installs for the current user without admin rights |
| 15 | Performance on a low-end PC | A 4 GB RAM, spinning-disk class Windows 10 PC: close and reopen the app 5 times | Page ready under 3 s (shown at the top of the screen). Idle memory under 250 MB in Task Manager |

Checks 8 to 10 need the database opened in section 2 first and the mock server running.

## Go or no-go

- **Go** when checks 1 to 12, 14 and 15 pass or have a documented fallback, and nothing in 8 to 11 loses or duplicates data.
- **No-go on Tauri** if check 6 or 7 cannot be made to work, or check 15 misses badly on a typical school PC. Then evaluate Electron, which brings its own Chromium.
- **Do not proceed to Phase 2** unless checks 8 to 11 pass: they are the data-safety checks.

## Still to do in Phase 0

- A time-boxed half-day look at one off-the-shelf sync engine against the design in the plan. Record what it
  would replace, what authorization it would move out of the API, and the weeks it would save.
- Run the API's auth endpoints with `desktop` as a client and note any CORS or header surprises.

## Results (fill in)

| # | Result (pass, fail, fallback) | Notes, measurements, error text |
|---|---|---|
| 1 | | |
| 2 | | |
| 3 | | |
| 4 | | |
| 5 | | |
| 6 | | |
| 7 | | |
| 8 | | |
| 9 | | |
| 10 | | |
| 11 | | |
| 12 | | |
| 14 | | |
| 15 | | |
