-- Credential lifecycle: forced first-login password change.

-- 1. Track whether the account owner still has to choose their own password.
ALTER TABLE "users"
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

-- 2. The shared default "Admin@123" is public in the repository and the
--    previous student flow stored temporary passwords. Every existing
--    credential user (except platform super admins, who manage their own
--    password) must therefore choose a new password at next sign-in.
UPDATE "users"
SET "mustChangePassword" = true
WHERE "role" <> 'superAdmin'
  AND "id" IN (SELECT "userId" FROM "accounts" WHERE "providerId" = 'credential');

-- 3. Guardians and other portal-only users are not asked for gender / date of
--    birth, so the profile columns must be nullable.
ALTER TABLE "user_profiles" ALTER COLUMN "gender" DROP NOT NULL;
ALTER TABLE "user_profiles" ALTER COLUMN "dateOfBirth" DROP NOT NULL;

-- 4. Never keep readable passwords. Destructive on purpose.
ALTER TABLE "students" DROP COLUMN IF EXISTS "plainTextPassword";

-- 5. Audit trail for credential events (no secrets are ever logged).
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CREDENTIALS_ISSUED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PASSWORD_RESET';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PASSWORD_CHANGED';
