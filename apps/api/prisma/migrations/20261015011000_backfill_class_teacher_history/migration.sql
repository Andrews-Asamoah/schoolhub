-- Preserve each existing class teacher as the earliest known assignment.
-- The original class record has no teacher-change timestamp, so its creation
-- date is the best available baseline for existing data.
INSERT INTO "class_teacher_assignments" (
    "id",
    "schoolId",
    "classId",
    "teacherId",
    "effectiveFrom",
    "createdAt"
)
SELECT
    'cta_legacy_' || md5("classes"."id"),
    "classes"."schoolId",
    "classes"."id",
    "classes"."classTeacherId",
    "classes"."createdAt"::date,
    "classes"."createdAt"
FROM "classes"
WHERE "classes"."classTeacherId" IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE "classes"
DROP CONSTRAINT IF EXISTS "classes_classTeacherId_fkey";

DROP INDEX IF EXISTS "classes_classTeacherId_idx";

ALTER TABLE "classes"
DROP COLUMN "classTeacherId";
