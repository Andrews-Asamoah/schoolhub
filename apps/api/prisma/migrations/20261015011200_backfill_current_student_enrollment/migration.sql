-- Seed the new term-based placement history from each active student's
-- existing current-class pointer when a school has a current year and term.
INSERT INTO "enrollments" (
    "id",
    "studentId",
    "classId",
    "academicYearId",
    "termId",
    "status",
    "enrolledAt",
    "createdAt",
    "updatedAt"
)
SELECT
    'enr_legacy_' || md5("students"."id" || "terms"."id"),
    "students"."id",
    "classes"."id",
    "academic_years"."id",
    "terms"."id",
    'ACTIVE',
    GREATEST("students"."admissionDate", "terms"."startDate")::timestamp,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "students"
JOIN "classes"
  ON "classes"."id" = "students"."classId"
 AND "classes"."schoolId" = "students"."schoolId"
 AND "classes"."deletedAt" IS NULL
JOIN "academic_years"
  ON "academic_years"."schoolId" = "students"."schoolId"
 AND "academic_years"."isCurrent" = TRUE
JOIN "terms"
  ON "terms"."academicYearId" = "academic_years"."id"
 AND "terms"."isCurrent" = TRUE
WHERE "students"."deletedAt" IS NULL
  AND "students"."status" = 'ACTIVE'
ON CONFLICT ("studentId", "academicYearId", "termId") DO NOTHING;
