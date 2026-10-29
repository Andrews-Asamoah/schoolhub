-- Administrator-issued passwords expire if never used.
ALTER TABLE "users" ADD COLUMN "temporaryPasswordExpiresAt" TIMESTAMP(3);

-- Accounts that are still on a never-changed temporary password get a fresh
-- window from the deploy date; older default-style passwords are not trusted
-- beyond it, so administrators must reissue them after that.
UPDATE "users"
SET "temporaryPasswordExpiresAt" = NOW() + INTERVAL '7 days'
WHERE "mustChangePassword" = true;
