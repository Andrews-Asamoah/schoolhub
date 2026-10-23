-- Persist announcement categories, publication state, and pinning.
ALTER TABLE "announcements"
  ADD COLUMN "category" TEXT NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "announcements_schoolId_status_idx"
  ON "announcements"("schoolId", "status");

CREATE INDEX "announcements_schoolId_isPinned_createdAt_idx"
  ON "announcements"("schoolId", "isPinned", "createdAt");
