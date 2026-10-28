-- Additive: independent immutable internal Mock 1/2 report versions.
CREATE TABLE "internal_mock_reports" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "schoolId" TEXT NOT NULL,
 "sessionId" TEXT NOT NULL,
 "candidateId" TEXT NOT NULL,
 "studentId" TEXT NOT NULL,
 "version" INTEGER NOT NULL DEFAULT 1,
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
 CONSTRAINT "internal_mock_reports_stage_valid" CHECK ("stage" IN ('GENERATED','TEACHER_REVIEWED','APPROVED','PUBLISHED','SUPERSEDED')),
 CONSTRAINT "internal_mock_reports_version_positive" CHECK ("version" > 0),
 CONSTRAINT "internal_mock_reports_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "internal_mock_reports_session_fkey" FOREIGN KEY ("sessionId") REFERENCES "internal_exam_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "internal_mock_reports_candidate_fkey" FOREIGN KEY ("candidateId") REFERENCES "internal_exam_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "internal_mock_reports_student_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "internal_mock_reports_teacher_fkey" FOREIGN KEY ("teacherActorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 CONSTRAINT "internal_mock_reports_head_fkey" FOREIGN KEY ("headActorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "internal_mock_reports_candidateId_version_key" ON "internal_mock_reports"("candidateId","version");
CREATE INDEX "internal_mock_reports_schoolId_sessionId_stage_idx" ON "internal_mock_reports"("schoolId","sessionId","stage");
CREATE INDEX "internal_mock_reports_schoolId_studentId_publishedAt_idx" ON "internal_mock_reports"("schoolId","studentId","publishedAt");

-- Frozen results and signed records cannot be silently revised or deleted.
CREATE OR REPLACE FUNCTION schoolhub_mock_report_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Mock report versions must be retained'; END IF;
 IF NEW."snapshot" IS DISTINCT FROM OLD."snapshot"
    OR NEW."snapshotHash" IS DISTINCT FROM OLD."snapshotHash"
    OR NEW."studentId" IS DISTINCT FROM OLD."studentId"
    OR NEW."schoolId" IS DISTINCT FROM OLD."schoolId"
    OR NEW."sessionId" IS DISTINCT FROM OLD."sessionId"
    OR NEW."candidateId" IS DISTINCT FROM OLD."candidateId"
    OR NEW."version" IS DISTINCT FROM OLD."version"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
 THEN RAISE EXCEPTION 'Mock result snapshot is immutable'; END IF;
 IF OLD."stage" = 'PUBLISHED' OR OLD."stage" = 'SUPERSEDED' THEN
   RAISE EXCEPTION 'Published/superseded mock report is immutable';
 END IF;
 IF (OLD."stage" = 'GENERATED' AND NEW."stage" NOT IN ('TEACHER_REVIEWED','SUPERSEDED'))
    OR (OLD."stage" = 'TEACHER_REVIEWED' AND NEW."stage" NOT IN ('APPROVED','SUPERSEDED'))
    OR (OLD."stage" = 'APPROVED' AND NEW."stage" NOT IN ('PUBLISHED','SUPERSEDED'))
 THEN RAISE EXCEPTION 'Invalid mock approval transition'; END IF;
 IF OLD."teacherApprovedAt" IS NOT NULL AND
    (NEW."teacherActorId" IS DISTINCT FROM OLD."teacherActorId"
    OR NEW."teacherName" IS DISTINCT FROM OLD."teacherName"
    OR NEW."teacherRemark" IS DISTINCT FROM OLD."teacherRemark"
    OR NEW."teacherApprovedAt" IS DISTINCT FROM OLD."teacherApprovedAt")
 THEN RAISE EXCEPTION 'Class-teacher recommendation cannot be rewritten'; END IF;
 IF OLD."headApprovedAt" IS NOT NULL AND
    (NEW."headActorId" IS DISTINCT FROM OLD."headActorId"
    OR NEW."headName" IS DISTINCT FROM OLD."headName"
    OR NEW."headRemark" IS DISTINCT FROM OLD."headRemark"
    OR NEW."headApprovedAt" IS DISTINCT FROM OLD."headApprovedAt")
 THEN RAISE EXCEPTION 'Headteacher approval cannot be rewritten'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER schoolhub_mock_report_retain_update BEFORE UPDATE OR DELETE ON "internal_mock_reports"
 FOR EACH ROW EXECUTE FUNCTION schoolhub_mock_report_immutable();
