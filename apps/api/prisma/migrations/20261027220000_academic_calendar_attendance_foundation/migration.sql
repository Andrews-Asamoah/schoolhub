-- Additive calendar and effective-dated enrolment foundation.
ALTER TABLE "terms"
  ADD COLUMN "instructionalWeekdays" INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5]::INTEGER[],
  ADD COLUMN "calendarRevision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "enrollments"
  ADD COLUMN "effectiveFrom" DATE,
  ADD COLUMN "effectiveTo" DATE;

CREATE TABLE "academic_calendar_days" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "termId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "isInstructional" BOOLEAN NOT NULL,
  "label" VARCHAR(160) NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "academic_calendar_days_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "academic_calendar_days_schoolId_termId_date_key" ON "academic_calendar_days"("schoolId","termId","date");
CREATE INDEX "academic_calendar_days_schoolId_termId_idx" ON "academic_calendar_days"("schoolId","termId");
ALTER TABLE "academic_calendar_days" ADD CONSTRAINT "academic_calendar_days_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "academic_calendar_days" ADD CONSTRAINT "academic_calendar_days_termId_fkey"
  FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "student_attendance_exclusions" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "termId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "reason" VARCHAR(400) NOT NULL,
  "approvedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "student_attendance_exclusions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "student_attendance_exclusions_schoolId_studentId_termId_date_key"
  ON "student_attendance_exclusions"("schoolId","studentId","termId","date");
CREATE INDEX "student_attendance_exclusions_schoolId_termId_date_idx"
  ON "student_attendance_exclusions"("schoolId","termId","date");
CREATE INDEX "student_attendance_exclusions_studentId_termId_idx"
  ON "student_attendance_exclusions"("studentId","termId");
ALTER TABLE "student_attendance_exclusions" ADD CONSTRAINT "student_attendance_exclusions_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_attendance_exclusions" ADD CONSTRAINT "student_attendance_exclusions_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_attendance_exclusions" ADD CONSTRAINT "student_attendance_exclusions_termId_fkey"
  FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
