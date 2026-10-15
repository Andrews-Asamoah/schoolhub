-- DropIndex
DROP INDEX "classes_classTeacherId_idx";

-- DropIndex
DROP INDEX "enrollments_studentId_classId_academicYearId_termId_key";

-- RenameIndex
ALTER INDEX "class_teacher_assignments_schoolId_classId_effectiveFrom_effect" RENAME TO "class_teacher_assignments_schoolId_classId_effectiveFrom_ef_idx";
