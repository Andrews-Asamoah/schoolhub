-- WAEC publishes no fixed BECE grade boundaries: for each subject, each year, the cut-off
-- marks are set after marking so grades follow the stanine shares (4, 7, 12, 17, 20, 17, 12, 7, 4).
-- Schools now set the minimum mark per grade for a class-ranked assessment, subject and term.
-- A row holds the lowest percentage that earns the grade; the lowest grade has no row.

CREATE TABLE "assessment_grade_boundaries" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "termId" TEXT NOT NULL,
  "grade" TEXT NOT NULL,
  "minScore" DECIMAL(5,2) NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "assessment_grade_boundaries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "assessment_grade_boundaries_templateId_subjectId_termId_grade_key"
  ON "assessment_grade_boundaries"("templateId", "subjectId", "termId", "grade");
CREATE INDEX "assessment_grade_boundaries_schoolId_idx" ON "assessment_grade_boundaries"("schoolId");
CREATE INDEX "assessment_grade_boundaries_subjectId_termId_idx" ON "assessment_grade_boundaries"("subjectId", "termId");
CREATE INDEX "assessment_grade_boundaries_createdById_idx" ON "assessment_grade_boundaries"("createdById");

ALTER TABLE "assessment_grade_boundaries" ADD CONSTRAINT "assessment_grade_boundaries_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_grade_boundaries" ADD CONSTRAINT "assessment_grade_boundaries_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "assessment_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_grade_boundaries" ADD CONSTRAINT "assessment_grade_boundaries_subjectId_fkey"
  FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_grade_boundaries" ADD CONSTRAINT "assessment_grade_boundaries_termId_fkey"
  FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_grade_boundaries" ADD CONSTRAINT "assessment_grade_boundaries_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Explain the real WAEC behaviour on the shared scale.
UPDATE "grading_systems"
SET "description" = 'The BECE nine-point stanine scale: the top 4% get grade 1, the next 7% grade 2, and so on down to the bottom 4% with grade 9. By default each pupil is graded by position in their own class. Like WAEC, which sets new mark boundaries for every subject each year, a school can instead set the minimum mark for each grade per subject and term. Helps pupils prepare for the BECE.'
WHERE "id" = 'sysgrade_bece_stanine';
