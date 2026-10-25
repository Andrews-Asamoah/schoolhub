-- Audit actions used by the platform super-admin console.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ACCESS_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SCHOOL_ACCESSED';

-- Speeds up the audit-log viewer's newest-first, per-school and per-actor filters.
CREATE INDEX IF NOT EXISTS "audit_logs_schoolId_createdAt_idx" ON "audit_logs"("schoolId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt" DESC);
