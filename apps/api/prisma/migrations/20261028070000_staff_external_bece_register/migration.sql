-- Authorised-school-staff-only BECE result register. These are NOT verified WAEC records.
CREATE TYPE "ExternalExamStatus" AS ENUM ('DRAFT','OPEN','LOCKED');
CREATE TYPE "ExternalResultStatus" AS ENUM ('GRADED','ABSENT','WITHHELD','CANCELLED');
CREATE TABLE "external_exam_sessions" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "schoolId" TEXT NOT NULL,
 "academicYearId" TEXT NOT NULL,
 "classId" TEXT NOT NULL,
 "examYear" INTEGER NOT NULL,
 "name" VARCHAR(120) NOT NULL,
 "status" "ExternalExamStatus" NOT NULL DEFAULT 'DRAFT',
 "createdById" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 "openedAt" TIMESTAMP(3),
 "lockedAt" TIMESTAMP(3),
 "lockedById" TEXT,
 CONSTRAINT "external_exam_sessions_year" CHECK ("examYear" BETWEEN 2000 AND 2100),
 CONSTRAINT "external_exam_sessions_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "external_exam_sessions_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "external_exam_sessions_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "external_exam_sessions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 CONSTRAINT "external_exam_sessions_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "external_exam_sessions_schoolId_examYear_classId_key"
 ON "external_exam_sessions"("schoolId","examYear","classId");
CREATE INDEX "external_exam_sessions_schoolId_status_createdAt_idx"
 ON "external_exam_sessions"("schoolId","status","createdAt");

CREATE TABLE "external_exam_candidates" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "sessionId" TEXT NOT NULL,
 "studentId" TEXT NOT NULL,
 "nameSnapshot" VARCHAR(200) NOT NULL,
 "admissionNumberSnapshot" VARCHAR(100),
 "indexNumber" VARCHAR(60),
 "version" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "external_exam_candidates_version" CHECK ("version">0),
 CONSTRAINT "external_exam_candidates_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "external_exam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "external_exam_candidates_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "external_exam_candidates_sessionId_studentId_key" ON "external_exam_candidates"("sessionId","studentId");
CREATE UNIQUE INDEX "external_exam_candidates_sessionId_indexNumber_key" ON "external_exam_candidates"("sessionId","indexNumber");
CREATE INDEX "external_exam_candidates_studentId_idx" ON "external_exam_candidates"("studentId");

CREATE TABLE "external_exam_papers" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "sessionId" TEXT NOT NULL,
 "subjectId" TEXT NOT NULL,
 "nameSnapshot" VARCHAR(160) NOT NULL,
 "codeSnapshot" VARCHAR(40) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "external_exam_papers_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "external_exam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "external_exam_papers_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "external_exam_papers_sessionId_subjectId_key" ON "external_exam_papers"("sessionId","subjectId");

CREATE TABLE "external_exam_results" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "candidateId" TEXT NOT NULL,
 "paperId" TEXT NOT NULL,
 "status" "ExternalResultStatus" NOT NULL,
 "grade" INTEGER,
 "sourceReference" VARCHAR(200) NOT NULL,
 "version" INTEGER NOT NULL DEFAULT 1,
 "recordedById" TEXT,
 "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "external_exam_results_grade" CHECK (
   ("status"='GRADED' AND "grade" BETWEEN 1 AND 9) OR
   ("status"<>'GRADED' AND "grade" IS NULL)),
 CONSTRAINT "external_exam_results_version" CHECK ("version">0),
 CONSTRAINT "external_exam_results_source" CHECK (length(trim("sourceReference"))>=5),
 CONSTRAINT "external_exam_results_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "external_exam_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "external_exam_results_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "external_exam_papers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "external_exam_results_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "external_exam_results_candidateId_paperId_key" ON "external_exam_results"("candidateId","paperId");
CREATE INDEX "external_exam_results_paperId_status_idx" ON "external_exam_results"("paperId","status");

-- Defensive enforcement even if a caller accidentally bypasses service validation.
CREATE OR REPLACE FUNCTION schoolhub_external_result_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE paper_session TEXT; candidate_session TEXT; session_state "ExternalExamStatus";
BEGIN
 SELECT p."sessionId", s."status" INTO paper_session,session_state
 FROM "external_exam_papers" p JOIN "external_exam_sessions" s ON s."id"=p."sessionId"
 WHERE p."id"=NEW."paperId" FOR UPDATE OF s;
 SELECT "sessionId" INTO candidate_session FROM "external_exam_candidates" WHERE "id"=NEW."candidateId";
 IF paper_session IS NULL OR candidate_session IS DISTINCT FROM paper_session
 THEN RAISE EXCEPTION 'External exam paper and candidate must belong to the same session'; END IF;
 IF session_state<>'OPEN' THEN RAISE EXCEPTION 'External exam results are locked'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER schoolhub_external_result_guard_trigger
 BEFORE INSERT OR UPDATE ON "external_exam_results"
 FOR EACH ROW EXECUTE FUNCTION schoolhub_external_result_guard();

CREATE OR REPLACE FUNCTION schoolhub_external_candidate_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE session_state "ExternalExamStatus";
BEGIN
 SELECT "status" INTO session_state FROM "external_exam_sessions" WHERE "id"=NEW."sessionId" FOR UPDATE;
 IF session_state<>'OPEN' THEN RAISE EXCEPTION 'External candidate index numbers may only be changed while open'; END IF;
 IF NEW."sessionId" IS DISTINCT FROM OLD."sessionId" OR NEW."studentId" IS DISTINCT FROM OLD."studentId" OR
    NEW."nameSnapshot" IS DISTINCT FROM OLD."nameSnapshot" OR NEW."admissionNumberSnapshot" IS DISTINCT FROM OLD."admissionNumberSnapshot"
 THEN RAISE EXCEPTION 'External candidate roster is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER schoolhub_external_candidate_guard_trigger
 BEFORE UPDATE ON "external_exam_candidates" FOR EACH ROW EXECUTE FUNCTION schoolhub_external_candidate_guard();
