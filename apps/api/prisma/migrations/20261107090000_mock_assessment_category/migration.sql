-- Mock examinations become a category of assessment instead of a parallel engine.
-- Additive only: no existing table is dropped or rewritten, every existing row is
-- TERMLY, so termly marks entry and report cards behave exactly as before.

CREATE TYPE "AssessmentCategory" AS ENUM ('TERMLY', 'MOCK');

ALTER TABLE "assessment_templates"
  ADD COLUMN "category" "AssessmentCategory" NOT NULL DEFAULT 'TERMLY',
  ADD COLUMN "academicYearId" TEXT,
  ADD COLUMN "sequence" INTEGER;

ALTER TABLE "assessment_templates"
  ADD CONSTRAINT "assessment_templates_academicYearId_fkey"
  FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A mock always belongs to exactly one academic year.
ALTER TABLE "assessment_templates"
  ADD CONSTRAINT "assessment_templates_mock_requires_year_check"
  CHECK ("category" <> 'MOCK' OR "academicYearId" IS NOT NULL);

CREATE INDEX "assessment_templates_schoolId_category_academicYearId_idx"
  ON "assessment_templates"("schoolId", "category", "academicYearId");
CREATE INDEX "assessment_templates_academicYearId_idx"
  ON "assessment_templates"("academicYearId");

-- "Mock 1" may exist once per academic year (not once per school), so mock names are
-- unique inside their year. Termly assessments keep their school-wide name rule in the
-- application layer.
CREATE UNIQUE INDEX "assessment_templates_mock_name_per_year"
  ON "assessment_templates"("schoolId", "academicYearId", lower("name"))
  WHERE "category" = 'MOCK';

-- A report batch can report one mock assessment instead of the termly results.
ALTER TABLE "report_card_sets" ADD COLUMN "assessmentTemplateId" TEXT;
ALTER TABLE "report_card_sets"
  ADD CONSTRAINT "report_card_sets_assessmentTemplateId_fkey"
  FOREIGN KEY ("assessmentTemplateId") REFERENCES "assessment_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "report_card_sets_assessmentTemplateId_idx" ON "report_card_sets"("assessmentTemplateId");
