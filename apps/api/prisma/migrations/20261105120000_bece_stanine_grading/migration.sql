-- Class-ranked grading (stanine) and the BECE nine-point scale as a shared default.

CREATE TYPE "GradingMethod" AS ENUM ('SCORE_BANDS', 'CLASS_RANK');

ALTER TABLE "grading_systems" ADD COLUMN "method" "GradingMethod" NOT NULL DEFAULT 'SCORE_BANDS';

-- Shared by every school (schoolId NULL + isSystemDefault). Fixed ids keep this idempotent.
INSERT INTO "grading_systems" ("id", "schoolId", "name", "code", "description", "method", "isSystemDefault", "isSchoolDefault", "isActive", "updatedAt")
VALUES (
  'sysgrade_bece_stanine', NULL, 'BECE Stanine (class-ranked)', 'BECE_STANINE',
  'The BECE nine-point stanine scale. Grades come from each pupil''s position within their own class, not from raw marks: the top 4% get grade 1, the next 7% grade 2, and so on down to the bottom 4% with grade 9. Helps pupils prepare for the BECE.',
  'CLASS_RANK', true, false, true, CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

-- minScore/maxScore are the cumulative % of the class (from the top) each grade covers.
-- gradePoint is 10 minus the grade so that, as in every other scale, a higher point is better.
INSERT INTO "grade_scales" ("id", "gradingSystemId", "grade", "description", "minScore", "maxScore", "gradePoint", "displayOrder", "updatedAt")
VALUES
  ('sysgrade_bece_stanine_1', 'sysgrade_bece_stanine', '1', 'Highest',       0,  4, 9, 1, CURRENT_TIMESTAMP),
  ('sysgrade_bece_stanine_2', 'sysgrade_bece_stanine', '2', 'Higher',        4, 11, 8, 2, CURRENT_TIMESTAMP),
  ('sysgrade_bece_stanine_3', 'sysgrade_bece_stanine', '3', 'High',         11, 23, 7, 3, CURRENT_TIMESTAMP),
  ('sysgrade_bece_stanine_4', 'sysgrade_bece_stanine', '4', 'Above Average', 23, 40, 6, 4, CURRENT_TIMESTAMP),
  ('sysgrade_bece_stanine_5', 'sysgrade_bece_stanine', '5', 'Average',      40, 60, 5, 5, CURRENT_TIMESTAMP),
  ('sysgrade_bece_stanine_6', 'sysgrade_bece_stanine', '6', 'Below Average', 60, 77, 4, 6, CURRENT_TIMESTAMP),
  ('sysgrade_bece_stanine_7', 'sysgrade_bece_stanine', '7', 'Low',          77, 89, 3, 7, CURRENT_TIMESTAMP),
  ('sysgrade_bece_stanine_8', 'sysgrade_bece_stanine', '8', 'Lower',        89, 96, 2, 8, CURRENT_TIMESTAMP),
  ('sysgrade_bece_stanine_9', 'sysgrade_bece_stanine', '9', 'Lowest',       96, 100, 1, 9, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
