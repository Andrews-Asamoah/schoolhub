-- AlterTable
ALTER TABLE "students" ADD COLUMN     "username" TEXT;

-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN     "email" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "students_schoolId_username_key" ON "students"("schoolId", "username");

-- Existing students: show their current login email on their profile.
UPDATE "user_profiles" AS p
SET "email" = u."email"
FROM "users" AS u, "students" AS s
WHERE s."profileId" = p."id"
  AND u."id" = p."userId"
  AND p."email" IS NULL
  AND u."email" NOT LIKE '%@student.schoolhub';
