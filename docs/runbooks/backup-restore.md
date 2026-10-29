# Backup and restore runbook

Status: **template to be completed and rehearsed.** A backup that has never been restored is not a backup. Fill the bracketed values, run the drill once on staging, and record the timings at the bottom.

## What must be recoverable

| Data | Where it lives | Backup method | Target |
|---|---|---|---|
| Application data (all schools) | PostgreSQL | Managed point-in-time recovery (PITR) plus a nightly logical dump | RPO [15 min], RTO [2 h] |
| Uploaded files (logos, avatars, documents) | Cloudflare R2 bucket | Bucket versioning on; periodic copy to a second bucket or provider | RPO [24 h] |
| Secrets (`BETTER_AUTH_SECRET`, R2 keys, DB URL) | Host secret store | Stored in a password manager the team can reach if the host is lost | n/a |

Losing `BETTER_AUTH_SECRET` signs everyone out and invalidates 2FA secrets and trusted devices; keep it backed up separately from the database.

## Routine

- Confirm PITR is enabled on the production database and retention is at least [7] days.
- Nightly logical dump, encrypted, stored off the database host:
  ```bash
  pg_dump --format=custom --no-owner "$DATABASE_URL" -f schoolhub-$(date +%F).dump
  ```
- Keep [30] daily and [12] monthly dumps. Never keep unencrypted copies: they contain pupils' and guardians' personal data.
- Alert if a backup job fails or the newest backup is older than 26 hours.

## Restore drill (quarterly, and before the first production school)

Always restore into a **new** database, never over production.

1. Create an empty PostgreSQL database `schoolhub_restore` (same major version).
2. Restore the latest dump:
   ```bash
   pg_restore --no-owner --dbname "$RESTORE_DATABASE_URL" schoolhub-YYYY-MM-DD.dump
   ```
   For PITR, restore to a chosen timestamp using the provider's console.
3. Check the migration state matches the code you will run:
   ```bash
   DATABASE_URL="$RESTORE_DATABASE_URL" pnpm --filter @schoolhub/api exec prisma migrate status --config prisma.config.ts
   ```
4. Start the API image against the restored database with a throwaway `BETTER_AUTH_SECRET` only if testing structure; use the real secret to also test sign-in.
5. Verify: `/api/health/ready` returns 200; sign in as a school admin; open one student, one fee statement and one published report; compare row counts for `students`, `payments`, `bills` and `finance_journal_entries` against the source.
6. Run the ledger integrity check (`GET /api/finance/ledger/integrity` as an accountant or owner) and confirm it passes.
7. Delete the restore database and record the result below.

## Disaster steps (production database lost or corrupted)

1. Stop writes: scale the API to zero or put the web tier in maintenance.
2. Decide the recovery point (latest PITR timestamp before the incident).
3. Restore into a new database following the drill above.
4. Point `DATABASE_URL` at it, start one API instance, verify, then scale up.
5. Tell affected schools what time range of data may be missing.
6. Review the audit log and finance integrity report for the gap.

## Rollback of a bad release

Images are tagged by commit. Roll back by redeploying the previous tag. Migrations are forward-only: if the release added a migration, deploy a fix-forward migration instead of editing or deleting an applied one. Take a dump immediately before any production migration.

## Drill log

| Date | Backup used | Restore time | Verified by | Problems found |
|---|---|---|---|---|
| | | | | |
