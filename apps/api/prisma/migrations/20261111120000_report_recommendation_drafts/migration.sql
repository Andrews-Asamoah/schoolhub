-- Autosaved class-teacher recommendation drafts, one per pupil per report batch.
-- A draft is not part of a report: signing off writes the recommendation onto the report version
-- and deletes the draft.

CREATE TABLE "report_recommendation_drafts" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "setId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "remark" VARCHAR(2000) NOT NULL,
  "source" VARCHAR(16) NOT NULL DEFAULT 'MANUAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "report_recommendation_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "report_recommendation_drafts_setId_studentId_key" ON "report_recommendation_drafts"("setId", "studentId");
CREATE INDEX "report_recommendation_drafts_schoolId_authorId_idx" ON "report_recommendation_drafts"("schoolId", "authorId");

ALTER TABLE "report_recommendation_drafts" ADD CONSTRAINT "report_recommendation_drafts_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_recommendation_drafts" ADD CONSTRAINT "report_recommendation_drafts_setId_fkey" FOREIGN KEY ("setId") REFERENCES "report_card_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_recommendation_drafts" ADD CONSTRAINT "report_recommendation_drafts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
