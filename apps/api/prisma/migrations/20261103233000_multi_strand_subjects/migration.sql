CREATE TABLE "subject_strands" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "examWeightPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "subject_strands_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "class_subject_strand_assignments" (
    "id" TEXT NOT NULL,
    "classSubjectId" TEXT NOT NULL,
    "subjectStrandId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "class_subject_strand_assignments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "timetable_entries" ADD COLUMN "subjectStrandId" TEXT;
ALTER TABLE "assessment_components" ADD COLUMN "subjectStrandId" TEXT;

CREATE UNIQUE INDEX "subject_strands_subjectId_name_key"
    ON "subject_strands"("subjectId", "name");
CREATE INDEX "subject_strands_subjectId_isActive_sortOrder_idx"
    ON "subject_strands"("subjectId", "isActive", "sortOrder");

CREATE UNIQUE INDEX "class_subject_strand_assignments_classSubjectId_subjectStrandId_key"
    ON "class_subject_strand_assignments"("classSubjectId", "subjectStrandId");
CREATE INDEX "class_subject_strand_assignments_teacherId_idx"
    ON "class_subject_strand_assignments"("teacherId");
CREATE INDEX "class_subject_strand_assignments_subjectStrandId_idx"
    ON "class_subject_strand_assignments"("subjectStrandId");

CREATE INDEX "timetable_entries_subjectStrandId_idx"
    ON "timetable_entries"("subjectStrandId");
CREATE INDEX "assessment_components_subjectStrandId_idx"
    ON "assessment_components"("subjectStrandId");

ALTER TABLE "subject_strands"
    ADD CONSTRAINT "subject_strands_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "subjects"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "class_subject_strand_assignments"
    ADD CONSTRAINT "class_subject_strand_assignments_classSubjectId_fkey"
    FOREIGN KEY ("classSubjectId") REFERENCES "class_subjects"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_subject_strand_assignments"
    ADD CONSTRAINT "class_subject_strand_assignments_subjectStrandId_fkey"
    FOREIGN KEY ("subjectStrandId") REFERENCES "subject_strands"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_subject_strand_assignments"
    ADD CONSTRAINT "class_subject_strand_assignments_teacherId_fkey"
    FOREIGN KEY ("teacherId") REFERENCES "teachers"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "timetable_entries"
    ADD CONSTRAINT "timetable_entries_subjectStrandId_fkey"
    FOREIGN KEY ("subjectStrandId") REFERENCES "subject_strands"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assessment_components"
    ADD CONSTRAINT "assessment_components_subjectStrandId_fkey"
    FOREIGN KEY ("subjectStrandId") REFERENCES "subject_strands"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;


CREATE TABLE "internal_exam_paper_sections" (
    "id" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "subjectStrandId" TEXT NOT NULL,
    "teacherId" TEXT,
    "nameSnapshot" VARCHAR(160) NOT NULL,
    "codeSnapshot" VARCHAR(40),
    "maxMarks" DECIMAL(6,2) NOT NULL DEFAULT 100,
    "weightPercent" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "internal_exam_paper_sections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "internal_exam_section_marks" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "paperSectionId" TEXT NOT NULL,
    "marks" DECIMAL(6,2),
    "status" "InternalExamMarkStatus" NOT NULL DEFAULT 'MARKED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "internal_exam_section_marks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "internal_exam_paper_sections_paperId_subjectStrandId_key"
    ON "internal_exam_paper_sections"("paperId", "subjectStrandId");
CREATE INDEX "internal_exam_paper_sections_teacherId_idx"
    ON "internal_exam_paper_sections"("teacherId");
CREATE INDEX "internal_exam_paper_sections_subjectStrandId_idx"
    ON "internal_exam_paper_sections"("subjectStrandId");
CREATE UNIQUE INDEX "internal_exam_section_marks_candidateId_paperSectionId_key"
    ON "internal_exam_section_marks"("candidateId", "paperSectionId");
CREATE INDEX "internal_exam_section_marks_paperSectionId_idx"
    ON "internal_exam_section_marks"("paperSectionId");
CREATE INDEX "internal_exam_section_marks_recordedById_idx"
    ON "internal_exam_section_marks"("recordedById");

ALTER TABLE "internal_exam_paper_sections"
    ADD CONSTRAINT "internal_exam_paper_sections_paperId_fkey"
    FOREIGN KEY ("paperId") REFERENCES "internal_exam_papers"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "internal_exam_paper_sections"
    ADD CONSTRAINT "internal_exam_paper_sections_subjectStrandId_fkey"
    FOREIGN KEY ("subjectStrandId") REFERENCES "subject_strands"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "internal_exam_paper_sections"
    ADD CONSTRAINT "internal_exam_paper_sections_teacherId_fkey"
    FOREIGN KEY ("teacherId") REFERENCES "teachers"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "internal_exam_section_marks"
    ADD CONSTRAINT "internal_exam_section_marks_candidateId_fkey"
    FOREIGN KEY ("candidateId") REFERENCES "internal_exam_candidates"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "internal_exam_section_marks"
    ADD CONSTRAINT "internal_exam_section_marks_paperSectionId_fkey"
    FOREIGN KEY ("paperSectionId") REFERENCES "internal_exam_paper_sections"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "internal_exam_section_marks"
    ADD CONSTRAINT "internal_exam_section_marks_recordedById_fkey"
    FOREIGN KEY ("recordedById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
