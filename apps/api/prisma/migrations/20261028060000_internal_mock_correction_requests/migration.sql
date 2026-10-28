-- Controlled maker-checker correction requests; historical marks/reports remain unchanged.
CREATE TYPE "MockCorrectionStatus" AS ENUM ('PENDING','APPLIED','REJECTED');
CREATE TABLE "internal_mock_corrections" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "schoolId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "paperId" TEXT NOT NULL,
  "baseVersion" INTEGER NOT NULL,
  "previousStatus" "InternalExamMarkStatus" NOT NULL,
  "previousMarks" DECIMAL(6,2),
  "requestedStatus" "InternalExamMarkStatus" NOT NULL,
  "requestedMarks" DECIMAL(6,2),
  "reason" VARCHAR(2000) NOT NULL,
  "status" "MockCorrectionStatus" NOT NULL DEFAULT 'PENDING',
  "requestedById" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewReason" VARCHAR(2000),
  CONSTRAINT "mock_correction_base_version_positive" CHECK ("baseVersion">0),
  CONSTRAINT "mock_correction_previous_status_valid" CHECK
    (("previousStatus"='MARKED' AND "previousMarks" IS NOT NULL) OR
     ("previousStatus"='ABSENT' AND "previousMarks" IS NULL)),
  CONSTRAINT "mock_correction_requested_status_valid" CHECK
    (("requestedStatus"='MARKED' AND "requestedMarks" IS NOT NULL) OR
     ("requestedStatus"='ABSENT' AND "requestedMarks" IS NULL)),
  CONSTRAINT "mock_correction_reason_nonblank" CHECK (length(trim("reason"))>=10),
  CONSTRAINT "mock_correction_school_fk" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "mock_correction_session_fk" FOREIGN KEY ("sessionId") REFERENCES "internal_exam_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "mock_correction_candidate_fk" FOREIGN KEY ("candidateId") REFERENCES "internal_exam_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "mock_correction_paper_fk" FOREIGN KEY ("paperId") REFERENCES "internal_exam_papers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "mock_correction_requester_fk" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "mock_correction_reviewer_fk" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "internal_mock_corrections_schoolId_sessionId_status_requestedAt_idx"
 ON "internal_mock_corrections"("schoolId","sessionId","status","requestedAt");
CREATE INDEX "internal_mock_corrections_candidateId_paperId_idx"
 ON "internal_mock_corrections"("candidateId","paperId");
-- Exactly one pending case per mock, avoiding two overlapping rank recalculations.
CREATE UNIQUE INDEX "internal_mock_corrections_one_pending_per_mock"
 ON "internal_mock_corrections"("schoolId","sessionId") WHERE "status"='PENDING';

CREATE OR REPLACE FUNCTION schoolhub_mock_correction_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Mock correction history must be retained'; END IF;
  IF OLD."status" <> 'PENDING' OR NEW."status" NOT IN ('APPLIED','REJECTED') OR
     NEW."schoolId" IS DISTINCT FROM OLD."schoolId" OR
     NEW."sessionId" IS DISTINCT FROM OLD."sessionId" OR
     NEW."candidateId" IS DISTINCT FROM OLD."candidateId" OR
     NEW."paperId" IS DISTINCT FROM OLD."paperId" OR
     NEW."baseVersion" IS DISTINCT FROM OLD."baseVersion" OR
     NEW."previousStatus" IS DISTINCT FROM OLD."previousStatus" OR
     NEW."previousMarks" IS DISTINCT FROM OLD."previousMarks" OR
     NEW."requestedStatus" IS DISTINCT FROM OLD."requestedStatus" OR
     NEW."requestedMarks" IS DISTINCT FROM OLD."requestedMarks" OR
     NEW."reason" IS DISTINCT FROM OLD."reason" OR
     NEW."requestedById" IS DISTINCT FROM OLD."requestedById" OR
     NEW."requestedAt" IS DISTINCT FROM OLD."requestedAt"
  THEN RAISE EXCEPTION 'Mock correction request is immutable'; END IF;
  IF NEW."reviewedAt" IS NULL OR NEW."reviewedById" IS NULL OR length(trim(coalesce(NEW."reviewReason",'')))<10
  THEN RAISE EXCEPTION 'Independent review and reason are required'; END IF;
  IF NEW."reviewedById" IS NOT DISTINCT FROM OLD."requestedById" THEN
    RAISE EXCEPTION 'Correction requester may not approve or reject own request';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER schoolhub_mock_correction_guard_trigger
BEFORE UPDATE OR DELETE ON "internal_mock_corrections"
FOR EACH ROW EXECUTE FUNCTION schoolhub_mock_correction_guard();
