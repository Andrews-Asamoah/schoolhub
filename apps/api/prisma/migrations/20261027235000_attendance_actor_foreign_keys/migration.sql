-- Preserve legacy orphaned actor identifiers for manual review.
-- NOT VALID enforces the FK for new/updated values without silently rewriting
-- pre-existing records. A later audited reconciliation must validate constraints.
ALTER TABLE "academic_calendar_days" ALTER COLUMN "createdById" DROP NOT NULL;
ALTER TABLE "student_attendance_exclusions" ALTER COLUMN "approvedById" DROP NOT NULL;

ALTER TABLE "academic_calendar_days"
  ADD CONSTRAINT "academic_calendar_days_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

ALTER TABLE "student_attendance_exclusions"
  ADD CONSTRAINT "student_attendance_exclusions_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

CREATE INDEX "academic_calendar_days_createdById_idx" ON "academic_calendar_days" ("createdById");
CREATE INDEX "student_attendance_exclusions_approvedById_idx" ON "student_attendance_exclusions" ("approvedById");
