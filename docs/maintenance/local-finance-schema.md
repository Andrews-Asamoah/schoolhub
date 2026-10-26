# Local finance schema recovery

## Symptom (Prisma P2022 / column not found)

SchoolHub's finance queries expect `bills.creditedAmount`,
`bill_items.creditedAmount` and `fee_items.recognitionMethod`.
These columns were introduced through **committed migrations**:

| Column | Migration |
| --- | --- |
| `bills.creditedAmount` | `20261026180000_finance_p3_expand` |
| `fee_items.recognitionMethod` | `20261026180000_finance_p3_expand` |
| `bill_items.creditedAmount` | `20261027000000_finance_p3_posted_adjustments` |

A freshly generated Prisma Client does not update the database schema.
The missing-column error usually means that the database used by the
running API has not applied the corresponding migrations.

## Safe development workflow

1. Stop the running API and **back up the database before migration** if the
   local database contains important financial records.
2. From the repository root, ensure `DATABASE_URL` in the root `.env` points
   to the **intended** PostgreSQL database.
3. Inspect pending/failed migrations:

   ```powershell
   pnpm db:status
   ```

4. If status shows pending migrations with no failed migration, apply the
   committed migrations and regenerate Prisma Client:

   ```powershell
   pnpm db:prepare
   ```

5. Confirm the result:

   ```powershell
   pnpm db:status
   ```

   Then restart with `pnpm dev` and check the finance bills,
   payments, and fee-structure endpoints.

`db:prepare` runs Prisma `migrate deploy` **then** `prisma generate`;
it neither runs `prisma migrate reset` nor seeds/deletes data.

## When migration deployment fails

- Verify that the application and CLI both use the same `DATABASE_URL`.
- Read Prisma's **actual** migration error and `pnpm db:status` output.
- Check the `_prisma_migrations` table for an incomplete migration and
  investigate the database state before changing migration history.
- Do **not** run `prisma migrate reset` on a database with valuable records.
  Do **not** use `prisma db push` to paper over failed accounting migrations.
- Existing applied migrations must not be edited in place; a repair is an
  additive migration or controlled, documented reconciliation.

Production deployments should continue to apply migrations explicitly as
part of the approved release process, not opportunistically from API requests.
