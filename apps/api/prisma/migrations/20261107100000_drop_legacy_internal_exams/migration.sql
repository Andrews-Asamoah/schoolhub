-- The standalone internal mock module is retired: mocks are now an assessment category
-- (see 20261107090000_mock_assessment_category). Development-stage data only.

DROP TABLE IF EXISTS "internal_mock_corrections" CASCADE;
DROP TABLE IF EXISTS "internal_mock_reports" CASCADE;
DROP TABLE IF EXISTS "internal_exam_section_marks" CASCADE;
DROP TABLE IF EXISTS "internal_exam_marks" CASCADE;
DROP TABLE IF EXISTS "internal_exam_paper_sections" CASCADE;
DROP TABLE IF EXISTS "internal_exam_papers" CASCADE;
DROP TABLE IF EXISTS "internal_exam_candidates" CASCADE;
DROP TABLE IF EXISTS "internal_exam_sessions" CASCADE;

DROP TYPE IF EXISTS "MockCorrectionStatus";
DROP TYPE IF EXISTS "InternalExamMarkStatus";
DROP TYPE IF EXISTS "InternalExamStatus";
