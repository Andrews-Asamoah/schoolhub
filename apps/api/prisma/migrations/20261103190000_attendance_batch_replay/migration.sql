-- Persist idempotency keys for offline attendance batch retries.
CREATE TABLE "attendance_batch_replays" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "recordCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attendance_batch_replays_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attendance_batch_replays_schoolId_userId_key_key"
ON "attendance_batch_replays"("schoolId", "userId", "key");

CREATE INDEX "attendance_batch_replays_schoolId_createdAt_idx"
ON "attendance_batch_replays"("schoolId", "createdAt");

ALTER TABLE "attendance_batch_replays"
ADD CONSTRAINT "attendance_batch_replays_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendance_batch_replays"
ADD CONSTRAINT "attendance_batch_replays_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
