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
