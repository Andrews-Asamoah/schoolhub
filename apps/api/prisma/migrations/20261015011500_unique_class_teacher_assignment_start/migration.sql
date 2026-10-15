CREATE UNIQUE INDEX "class_teacher_assignments_classId_effectiveFrom_key"
ON "class_teacher_assignments"("classId", "effectiveFrom");

ALTER TABLE "class_teacher_assignments"
ADD CONSTRAINT "class_teacher_assignments_valid_date_range_check"
CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom");
