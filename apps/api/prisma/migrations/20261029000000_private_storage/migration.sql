ALTER TABLE "documents" ADD COLUMN "storageKey" TEXT;
ALTER TABLE "documents" ADD COLUMN "audience" TEXT NOT NULL DEFAULT 'STAFF';
ALTER TABLE "documents" ADD CONSTRAINT "documents_audience_check" CHECK ("audience" IN ('STAFF', 'LEADERSHIP'));
ALTER TABLE "user_profiles" ADD COLUMN "signatureStorageKey" TEXT;
ALTER TYPE "AuditAction" ADD VALUE 'FILE_DOWNLOADED';
