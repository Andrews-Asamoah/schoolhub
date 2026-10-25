# Testing the API

## Unit tests (no database)

```
pnpm --filter api test
```

The database-backed finance tests are skipped automatically when no test database is configured.

## Finance database tests

`src/modules/finance/finance.integration.spec.ts` exercises the real money-moving code (payments, reversals,
concurrency, idempotency, closed periods, audit trail) against PostgreSQL.

They only run when `TEST_DATABASE_URL` is set, and the **database name must contain "test"** so they can never
touch development data. Each run creates its own school and deletes it afterwards.

One-time setup (adjust host/port/user to your machine, e.g. port 5433):

```
createdb -h localhost -p 5433 -U postgres schoolhub_test
DATABASE_URL=postgresql://postgres:PASSWORD@localhost:5433/schoolhub_test pnpm --filter api exec prisma migrate deploy
```

Run:

```
TEST_DATABASE_URL=postgresql://postgres:PASSWORD@localhost:5433/schoolhub_test pnpm --filter api test
```

After you add a migration, run the `migrate deploy` line again so the test database stays current.
