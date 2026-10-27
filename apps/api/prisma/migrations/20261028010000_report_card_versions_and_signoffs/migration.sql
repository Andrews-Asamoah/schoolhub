-- Immutable, versioned report-source snapshots with two attributable approvals.
CREATE TABLE "report_card_versions" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "setId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "stage" VARCHAR(32) NOT NULL DEFAULT 'GENERATED',
  "snapshot" JSONB NOT NULL,
  "snapshotHash" VARCHAR(64) NOT NULL,
  "teacherActorId" TEXT,
  "teacherName" VARCHAR(160),
  "teacherRemark" VARCHAR(2000),
  "teacherApprovedAt" TIMESTAMP(3),
  "headActorId" TEXT,
  "headName" VARCHAR(160),
  "headRemark" VARCHAR(2000),
  "headApprovedAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "report_card_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "report_card_versions_version_positive" CHECK ("version" > 0),
  CONSTRAINT "report_card_versions_stage_check" CHECK ("stage" IN ('GENERATED','TEACHER_REVIEWED','APPROVED','PUBLISHED','SUPERSEDED'))
);
CREATE UNIQUE INDEX "report_card_versions_setId_studentId_version_key" ON "report_card_versions"("setId","studentId","version");
CREATE INDEX "report_card_versions_schoolId_setId_stage_idx" ON "report_card_versions"("schoolId","setId","stage");
CREATE INDEX "report_card_versions_schoolId_classId_stage_idx" ON "report_card_versions"("schoolId","classId","stage");
CREATE INDEX "report_card_versions_studentId_publishedAt_idx" ON "report_card_versions"("studentId","publishedAt");
ALTER TABLE "report_card_versions" ADD CONSTRAINT "report_card_versions_schoolId_fkey"
 FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_card_versions" ADD CONSTRAINT "report_card_versions_setId_fkey"
 FOREIGN KEY ("setId") REFERENCES "report_card_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_card_versions" ADD CONSTRAINT "report_card_versions_studentId_fkey"
 FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_card_versions" ADD CONSTRAINT "report_card_versions_teacherActorId_fkey"
 FOREIGN KEY ("teacherActorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "report_card_versions" ADD CONSTRAINT "report_card_versions_headActorId_fkey"
 FOREIGN KEY ("headActorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prevent replacement of academic source content after generation; normal approval
-- updates may change stage and sign-off fields, but never the source seal.
CREATE OR REPLACE FUNCTION schoolhub_report_version_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."schoolId" IS DISTINCT FROM OLD."schoolId" OR
     NEW."setId" IS DISTINCT FROM OLD."setId" OR
     NEW."studentId" IS DISTINCT FROM OLD."studentId" OR
     NEW."classId" IS DISTINCT FROM OLD."classId" OR
     NEW."version" IS DISTINCT FROM OLD."version" OR
     NEW."snapshot" IS DISTINCT FROM OLD."snapshot" OR
     NEW."snapshotHash" IS DISTINCT FROM OLD."snapshotHash" OR
     NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Academic report source versions are immutable';
  END IF;
  IF OLD."stage" = 'PUBLISHED' THEN
    RAISE EXCEPTION 'Published academic report versions are immutable';
  END IF;
  IF OLD."stage" = 'GENERATED' AND NEW."stage" NOT IN ('TEACHER_REVIEWED','SUPERSEDED') OR
     OLD."stage" = 'TEACHER_REVIEWED' AND NEW."stage" NOT IN ('APPROVED','SUPERSEDED') OR
     OLD."stage" = 'APPROVED' AND NEW."stage" NOT IN ('PUBLISHED','SUPERSEDED') OR
     OLD."stage" = 'SUPERSEDED' THEN
    RAISE EXCEPTION 'Invalid academic report approval transition';
  END IF;
  IF OLD."teacherApprovedAt" IS NOT NULL AND (
     OLD."teacherActorId" IS DISTINCT FROM NEW."teacherActorId" OR
     OLD."teacherName" IS DISTINCT FROM NEW."teacherName" OR
     OLD."teacherRemark" IS DISTINCT FROM NEW."teacherRemark" OR
     OLD."teacherApprovedAt" IS DISTINCT FROM NEW."teacherApprovedAt") THEN
    RAISE EXCEPTION 'Class-teacher approval must not be rewritten';
  END IF;
  IF OLD."headApprovedAt" IS NOT NULL AND (
     OLD."headActorId" IS DISTINCT FROM NEW."headActorId" OR
     OLD."headName" IS DISTINCT FROM NEW."headName" OR
     OLD."headRemark" IS DISTINCT FROM NEW."headRemark" OR
     OLD."headApprovedAt" IS DISTINCT FROM NEW."headApprovedAt") THEN
    RAISE EXCEPTION 'Headteacher approval must not be rewritten';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER schoolhub_report_version_guard_trigger
BEFORE UPDATE ON "report_card_versions"
FOR EACH ROW EXECUTE FUNCTION schoolhub_report_version_guard();
