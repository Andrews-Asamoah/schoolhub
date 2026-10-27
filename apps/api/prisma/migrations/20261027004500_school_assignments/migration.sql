-- Persist school coursework, student text submissions and teacher grades.
CREATE TYPE "SchoolAssignmentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "SchoolAssignmentSubmissionStatus" AS ENUM ('SUBMITTED', 'GRADED');

CREATE TABLE "school_assignments" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "instructions" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "maxScore" DECIMAL(7,2) NOT NULL,
    "status" "SchoolAssignmentStatus" NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "school_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "school_assignment_submissions" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "responseText" TEXT NOT NULL,
    "status" "SchoolAssignmentSubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "score" DECIMAL(7,2),
    "feedback" VARCHAR(2000),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gradedAt" TIMESTAMP(3),
    "gradedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "school_assignment_submissions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "school_assignments_schoolId_classId_status_dueAt_idx"
ON "school_assignments"("schoolId", "classId", "status", "dueAt");
CREATE INDEX "school_assignments_schoolId_academicYearId_termId_idx"
ON "school_assignments"("schoolId", "academicYearId", "termId");
CREATE INDEX "school_assignments_subjectId_idx"
ON "school_assignments"("subjectId");
CREATE INDEX "school_assignments_createdById_createdAt_idx"
ON "school_assignments"("createdById", "createdAt");
CREATE UNIQUE INDEX "school_assignment_submissions_assignmentId_studentId_key"
ON "school_assignment_submissions"("assignmentId", "studentId");
CREATE INDEX "school_assignment_submissions_studentId_submittedAt_idx"
ON "school_assignment_submissions"("studentId", "submittedAt");
CREATE INDEX "school_assignment_submissions_assignmentId_status_idx"
ON "school_assignment_submissions"("assignmentId", "status");
CREATE INDEX "school_assignment_submissions_gradedById_idx"
ON "school_assignment_submissions"("gradedById");

ALTER TABLE "school_assignments"
ADD CONSTRAINT "school_assignments_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "school_assignments"
ADD CONSTRAINT "school_assignments_classId_fkey"
FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "school_assignments"
ADD CONSTRAINT "school_assignments_subjectId_fkey"
FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "school_assignments"
ADD CONSTRAINT "school_assignments_academicYearId_fkey"
FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "school_assignments"
ADD CONSTRAINT "school_assignments_termId_fkey"
FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "school_assignments"
ADD CONSTRAINT "school_assignments_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "school_assignment_submissions"
ADD CONSTRAINT "school_assignment_submissions_assignmentId_fkey"
FOREIGN KEY ("assignmentId") REFERENCES "school_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "school_assignment_submissions"
ADD CONSTRAINT "school_assignment_submissions_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "school_assignment_submissions"
ADD CONSTRAINT "school_assignment_submissions_submittedById_fkey"
FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "school_assignment_submissions"
ADD CONSTRAINT "school_assignment_submissions_gradedById_fkey"
FOREIGN KEY ("gradedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
