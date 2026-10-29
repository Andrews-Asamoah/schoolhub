# Calendar author/approver FK hardening

Adds actual PostgreSQL foreign keys for the creator of a dated calendar override and
the approver of a student-specific attendance exclusion.

- Original string ID columns become nullable, allowing `ON DELETE SET NULL` when a user
  account is removed under the school's retention policy.
- New and updated non-null identifiers must exist in `users`.
- Constraints are initially `NOT VALID` to avoid silently discarding potentially orphaned
  historical authorship records. **This is not the final validation step.**
- Use a separate data-quality query to identify pre-existing orphan IDs, review them
  with school administrators, preserve their source lineage, and then run a later
  `VALIDATE CONSTRAINT` migration when resolved.
- Application audits still record the original actor `userId` at write time;
  account deletion does not retroactively edit the recorded audit event.

The calendar summary additionally translates bad inherited term/calendar configurations
into an actionable HTTP 400 rather than an internal server error.

## Rollback
This is a non-destructive expansion migration. If a deployment must be rolled back,
leave the nullable columns and constraints in place while reverting the application.
Do not automatically rewrite historical actor IDs. Dropping FKs is a separately
reviewed operational intervention only.

## Validation
Prisma client generation/typecheck, real PostgreSQL FK tests and current CI are mandatory
before merging into `dev`. No WIS legacy data is imported by this PR.
