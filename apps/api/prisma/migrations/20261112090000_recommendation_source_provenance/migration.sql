-- Record where each signed recommendation came from, so recommendations written with any future
-- assistance can be told apart from ones people wrote themselves. Every existing recommendation was
-- written by a person, which is what the default says.
ALTER TABLE "report_card_versions"
  ADD COLUMN "teacherRemarkSource" VARCHAR(16) NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "headRemarkSource" VARCHAR(16) NOT NULL DEFAULT 'MANUAL';

-- The source is part of what a sign-off attests, so once someone has signed it can no more be rewritten
-- than the recommendation text itself. This is the original guard with those two checks added.
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
     OLD."teacherRemarkSource" IS DISTINCT FROM NEW."teacherRemarkSource" OR
     OLD."teacherApprovedAt" IS DISTINCT FROM NEW."teacherApprovedAt") THEN
    RAISE EXCEPTION 'Class-teacher approval must not be rewritten';
  END IF;
  IF OLD."headApprovedAt" IS NOT NULL AND (
     OLD."headActorId" IS DISTINCT FROM NEW."headActorId" OR
     OLD."headName" IS DISTINCT FROM NEW."headName" OR
     OLD."headRemark" IS DISTINCT FROM NEW."headRemark" OR
     OLD."headRemarkSource" IS DISTINCT FROM NEW."headRemarkSource" OR
     OLD."headApprovedAt" IS DISTINCT FROM NEW."headApprovedAt") THEN
    RAISE EXCEPTION 'Headteacher approval must not be rewritten';
  END IF;
  RETURN NEW;
END $$;
