ALTER TABLE "members"
ADD COLUMN "roles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

DO $$
BEGIN
  IF EXISTS (
    SELECT "userId"
    FROM "members"
    GROUP BY "userId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce one-school-per-account: duplicate school memberships exist. Resolve those memberships and use separate credentials before retrying.';
  END IF;
END $$;

CREATE UNIQUE INDEX "members_userId_key" ON "members"("userId");
