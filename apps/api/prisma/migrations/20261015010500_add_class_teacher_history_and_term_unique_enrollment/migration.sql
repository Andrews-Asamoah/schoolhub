-- CreateTable
CREATE TABLE "class_teacher_assignments" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_teacher_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "class_teacher_assignments_schoolId_classId_effectiveFrom_effectiveTo_idx"
ON "class_teacher_assignments"("schoolId", "classId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "class_teacher_assignments_teacherId_effectiveFrom_idx"
ON "class_teacher_assignments"("teacherId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "class_teacher_assignments"
ADD CONSTRAINT "class_teacher_assignments_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_teacher_assignments"
ADD CONSTRAINT "class_teacher_assignments_classId_fkey"
FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_teacher_assignments"
ADD CONSTRAINT "class_teacher_assignments_teacherId_fkey"
FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Change enrollment uniqueness from one record per class to one placement per student and term.
ALTER TABLE "enrollments"
DROP CONSTRAINT IF EXISTS "enrollments_studentId_classId_academicYearId_termId_key";

CREATE UNIQUE INDEX "enrollments_studentId_academicYearId_termId_key"
ON "enrollments"("studentId", "academicYearId", "termId");
