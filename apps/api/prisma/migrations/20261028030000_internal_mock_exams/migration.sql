-- Internal mock examinations: separate from term assessment and external BECE records.
CREATE TYPE "InternalExamStatus" AS ENUM ('DRAFT', 'OPEN', 'LOCKED');
CREATE TYPE "InternalExamMarkStatus" AS ENUM ('MARKED', 'ABSENT');
CREATE TABLE "internal_exam_sessions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "schoolId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "termId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "mockNumber" INTEGER NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "status" "InternalExamStatus" NOT NULL DEFAULT 'DRAFT',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "openedAt" TIMESTAMP(3),
  "lockedAt" TIMESTAMP(3),
  CONSTRAINT "internal_exam_sessions_number_check" CHECK ("mockNumber" > 0),
  CONSTRAINT "internal_exam_sessions_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "internal_exam_sessions_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "internal_exam_sessions_termId_fkey" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "internal_exam_sessions_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "internal_exam_sessions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "internal_exam_sessions_schoolId_academicYearId_classId_mockNumber_key" ON "internal_exam_sessions"("schoolId","academicYearId","classId","mockNumber");
CREATE INDEX "internal_exam_sessions_schoolId_status_createdAt_idx" ON "internal_exam_sessions"("schoolId","status","createdAt");
CREATE INDEX "internal_exam_sessions_classId_academicYearId_idx" ON "internal_exam_sessions"("classId","academicYearId");

CREATE TABLE "internal_exam_candidates" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "nameSnapshot" VARCHAR(200) NOT NULL,
  "admissionNumberSnapshot" VARCHAR(100),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "internal_exam_candidates_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "internal_exam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "internal_exam_candidates_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "internal_exam_candidates_sessionId_studentId_key" ON "internal_exam_candidates"("sessionId","studentId");
CREATE INDEX "internal_exam_candidates_studentId_idx" ON "internal_exam_candidates"("studentId");

CREATE TABLE "internal_exam_papers" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "nameSnapshot" VARCHAR(160) NOT NULL,
  "codeSnapshot" VARCHAR(40) NOT NULL,
  "maxMarks" DECIMAL(6,2) NOT NULL DEFAULT 100,
  "finalizedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "internal_exam_papers_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "internal_exam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "internal_exam_papers_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "internal_exam_papers_maxMarks_check" CHECK ("maxMarks" > 0)
);
CREATE UNIQUE INDEX "internal_exam_papers_sessionId_subjectId_key" ON "internal_exam_papers"("sessionId","subjectId");
CREATE INDEX "internal_exam_papers_subjectId_idx" ON "internal_exam_papers"("subjectId");

CREATE TABLE "internal_exam_marks" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "candidateId" TEXT NOT NULL,
  "paperId" TEXT NOT NULL,
  "marks" DECIMAL(6,2),
  "status" "InternalExamMarkStatus" NOT NULL DEFAULT 'MARKED',
  "version" INTEGER NOT NULL DEFAULT 1,
  "recordedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "internal_exam_marks_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "internal_exam_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "internal_exam_marks_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "internal_exam_papers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "internal_exam_marks_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "internal_exam_marks_positive_check" CHECK ("marks" IS NULL OR "marks" >= 0),
  CONSTRAINT "internal_exam_marks_status_check" CHECK (("status"='MARKED' AND "marks" IS NOT NULL) OR ("status"='ABSENT' AND "marks" IS NULL)),
  CONSTRAINT "internal_exam_marks_version_check" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX "internal_exam_marks_candidateId_paperId_key" ON "internal_exam_marks"("candidateId","paperId");
CREATE INDEX "internal_exam_marks_paperId_idx" ON "internal_exam_marks"("paperId");
CREATE INDEX "internal_exam_marks_recordedById_idx" ON "internal_exam_marks"("recordedById");

-- All exam marks must belong to a candidate and subject paper in the same session.
CREATE OR REPLACE FUNCTION schoolhub_internal_exam_mark_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE paper_session TEXT; candidate_session TEXT; max_score NUMERIC; paper_final TIMESTAMP; exam_state "InternalExamStatus";
BEGIN
  SELECT p."sessionId", p."maxMarks", p."finalizedAt", s."status"
    INTO paper_session, max_score, paper_final, exam_state
    FROM "internal_exam_papers" p JOIN "internal_exam_sessions" s ON s."id"=p."sessionId"
    WHERE p."id"=NEW."paperId" FOR UPDATE OF p;
  SELECT "sessionId" INTO candidate_session FROM "internal_exam_candidates" WHERE "id"=NEW."candidateId";
  IF paper_session IS NULL OR candidate_session IS DISTINCT FROM paper_session THEN
    RAISE EXCEPTION 'A mark must reference a candidate and paper in the same exam session';
  END IF;
  IF exam_state <> 'OPEN' OR paper_final IS NOT NULL THEN
    RAISE EXCEPTION 'Mock paper is not open for entry';
  END IF;
  IF (NEW."status" = 'MARKED' AND (NEW."marks" IS NULL OR NEW."marks" < 0 OR NEW."marks" > max_score)) OR
     (NEW."status" = 'ABSENT' AND NEW."marks" IS NOT NULL) THEN
    RAISE EXCEPTION 'Mock mark exceeds its subject paper maximum';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER schoolhub_internal_exam_mark_guard_trigger
BEFORE INSERT OR UPDATE ON "internal_exam_marks"
FOR EACH ROW EXECUTE FUNCTION schoolhub_internal_exam_mark_guard();
