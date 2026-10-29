CREATE TABLE "background_jobs" (
  "id" TEXT PRIMARY KEY,
  "kind" TEXT NOT NULL,
  "schoolId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "payload" JSONB NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttempt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "heartbeatAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "background_job_status_check" CHECK ("status" IN ('PENDING','RUNNING','SUCCEEDED','DEAD')),
  CONSTRAINT "background_job_attempts_check" CHECK ("attempts" >= 0)
);
CREATE INDEX "background_jobs_kind_status_nextAttempt_idx" ON "background_jobs" ("kind","status","nextAttempt");
CREATE INDEX "background_jobs_schoolId_createdAt_idx" ON "background_jobs" ("schoolId","createdAt");
CREATE INDEX "background_jobs_status_nextAttempt_idx" ON "background_jobs" ("status","nextAttempt");
CREATE INDEX "background_jobs_status_leaseUntil_idx" ON "background_jobs" ("status","leaseUntil");
CREATE INDEX "background_jobs_kind_status_completedAt_idx" ON "background_jobs" ("kind","status","completedAt");
