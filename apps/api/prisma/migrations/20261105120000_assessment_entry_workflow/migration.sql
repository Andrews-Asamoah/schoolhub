-- CreateEnum
CREATE TYPE "AssessmentCorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "assessment_entry_submissions" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" VARCHAR(500),
    "excusedStudentIds" TEXT[],

    CONSTRAINT "assessment_entry_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_mark_corrections" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "reason" VARCHAR(2000) NOT NULL,
    "status" "AssessmentCorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewReason" VARCHAR(2000),

    CONSTRAINT "assessment_mark_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_mark_correction_items" (
    "id" TEXT NOT NULL,
    "correctionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "occurrenceIndex" INTEGER NOT NULL DEFAULT 0,
    "previousMarks" DECIMAL(6,2),
    "requestedMarks" DECIMAL(6,2),

    CONSTRAINT "assessment_mark_correction_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assessment_submissions_school_term_idx" ON "assessment_entry_submissions"("schoolId", "termId");
CREATE UNIQUE INDEX "assessment_submission_sheet_key" ON "assessment_entry_submissions"("templateId", "classId", "subjectId", "termId");
CREATE INDEX "assessment_corrections_school_status_idx" ON "assessment_mark_corrections"("schoolId", "status", "requestedAt" DESC);
CREATE INDEX "assessment_corrections_sheet_status_idx" ON "assessment_mark_corrections"("templateId", "classId", "subjectId", "status");
CREATE UNIQUE INDEX "assessment_correction_item_cell_key" ON "assessment_mark_correction_items"("correctionId", "studentId", "componentId", "occurrenceIndex");

-- A sheet can have only one pending correction at a time.
CREATE UNIQUE INDEX "assessment_mark_corrections_one_pending_per_sheet" ON "assessment_mark_corrections"("templateId", "classId", "subjectId", "termId") WHERE "status" = 'PENDING';

-- AddForeignKey
ALTER TABLE "assessment_entry_submissions" ADD CONSTRAINT "assessment_entry_submissions_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_entry_submissions" ADD CONSTRAINT "assessment_entry_submissions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "assessment_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_mark_corrections" ADD CONSTRAINT "assessment_mark_corrections_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_mark_corrections" ADD CONSTRAINT "assessment_mark_corrections_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "assessment_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_mark_correction_items" ADD CONSTRAINT "assessment_mark_correction_items_correctionId_fkey" FOREIGN KEY ("correctionId") REFERENCES "assessment_mark_corrections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
