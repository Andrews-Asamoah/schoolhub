# Verified release promotion

Feature PRs target `dev`. A release is a full commit SHA plus immutable API/web image digests and a migration baseline. Branch tags are not deployment identities.

## Gates enforced in code

1. CI typechecks, builds, applies migrations and runs API/web/browser/2FA tests. Runtime container smoke jobs build both images, start nginx, and boot the API against PostgreSQL 17 after applying migrations from the image.
2. Container image publication waits for successful **push CI on the exact commit**, in this repository on `dev` or `main`. A timeout/failure blocks publication. A manually dispatched image run has the same check.
3. Published digests are smoke-tested. Only when both components succeed is `release-manifest-<full SHA>` uploaded. The manifest binds repository, SHA, originating run, API/web digests and expected migration.
4. Database migrations accept only the full release SHA, successful Container images run ID, target environment and operator-verified backup reference. The workflow verifies the run, artifact, digest repositories and image revision before it exposes DATABASE_URL to the migration step.
5. Migrations run **inside the approved API image**, followed by migration status verification. They do not install or execute arbitrary caller-selected repository refs.
6. The workflow records an environment-specific migration receipt, including failure/not-run outcomes. The backup reference is an operator attestation; it does not independently prove a backup exists or is restorable.

## Operator steps

- Configure staging and production GitHub Environments with restricted DATABASE_URL secrets. Configure required production reviewers and branch restrictions in repository settings; YAML comments cannot enforce environment protection.
- Require CI and both container smoke checks on `dev` and release branches. Restrict bypasses and direct pushes. These repository-administration settings require administrator access outside the application code.
- Choose the successful Container images run and download its manifest. Retain it with the release record before the 90-day workflow-artifact retention expires.
- Verify a recent backup/PITR recovery point and a tested restore path. Record its provider/dump reference. Do not proceed merely because a reference can be typed into a form.
- Dispatch Database migrations from `dev` or `main` with that SHA/run ID/environment/reference. Review the receipt and migration status.
- Deploy **both manifest image digests**, with the matching migration baseline, production origin/private-storage settings and actual secret-store values. Hosting deployment remains an operator action; this workflow does not deploy application containers.
- Probe readiness, sign-in, a private file, one fee statement and one published report, and reconcile the ledger. Monitor the release before expanding traffic.
- Roll back to the previous manifest digests only when the database remains compatible. Migrations are additive/forward-fix; never edit applied SQL or automatically roll back production data.

All environments sharing one database must coordinate releases. The migration job serializes by environment; any future deployment workflow must use the same `release-<environment>` concurrency group. A manually operated host can bypass workflow serialization and requires explicit operator coordination.

A green test-database restore or container smoke check is not a completed production PITR/object-store recovery drill. Keep measured production-like recovery evidence separately.

## Read-only database restore verification

After restoring an encrypted dump or PITR snapshot to an isolated database whose name contains `restore` or `test`, set `RESTORE_DATABASE_URL` to that database and `DATABASE_URL` to the frozen source. Run:

```sh
pnpm --filter @schoolhub/api exec tsx scripts/verify-restored-database.ts
```

The verifier makes no database changes. It compares migration names/checksums, per-school counts and full-row fingerprints for key academic/finance/document tables, and global fingerprints for profiles and ledger/bill/payment lines. It then runs all existing ledger integrity checks on the restored database. It returns nonzero on mismatch, query failure or an empty school dataset. Source writes must remain frozen at the snapshot boundary; otherwise expected new transactions will also produce a mismatch.

The output contains only comparison outcomes and counts, not pupil data or credentials. Record its elapsed time along with the **full** backup/restore and application-start timings. It explicitly leaves object-storage recovery unverified and does not certify a production recovery drill. Restore and verify private file objects separately, including selected download checksums and permissions.

CI exercises the verifier by seeding a synthetic school and a real balanced ledger posting, dumping the test database, restoring it to an isolated database and comparing both. It also changes a restored fixture row and proves that the verifier rejects the mismatch. It deletes the temporary database, fixture and unencrypted **synthetic test** dump afterwards. This validates the tool and migration schema without claiming that production backup encryption, PITR retention or object-store recovery is configured.
