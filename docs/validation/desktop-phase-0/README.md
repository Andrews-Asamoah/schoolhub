# Phase 0 local evidence — 11 November 2026

Environment: Linux x86_64, Node 24.22.1, Rust 1.99.1 installed for this spike.
Base: dev d3ed87c4ccf4c889eba65fd7a36b9209afc33a91.

| Command | Result |
| --- | --- |
| `node apps/desktop/spike/check-config.mjs` | Passed |
| `node --test apps/desktop/spike/outbox.test.mjs` | 3 tests passed; includes 100 seeded process-termination/retry rounds |
| `cargo test --lib` in `apps/desktop/src-tauri` | 1 native SQLCipher test passed |
| `pnpm --filter @schoolhub/shared build` | Passed |
| `pnpm --filter @schoolhub/web build` | Passed; existing large-chunk warning remains |
| `pnpm --filter @schoolhub/web test` | 10 test files, 61 tests passed |

SQLCipher emits expected HMAC/decryption errors during the wrong-key negative
test. The test then reopens the file with the correct key and verifies data.

Not run locally: Windows compile/launch, real API authentication/2FA,
PostgreSQL cursor experiment (no psql/server installed), real API sync,
throttled links, Windows performance, PDF/print or installer measurements.
The workflow supplies Windows compilation and a disposable PostgreSQL service;
its results must be reviewed independently.

No production credentials or school records were used. Temporary model and
native database files are removed by their test fixtures.
