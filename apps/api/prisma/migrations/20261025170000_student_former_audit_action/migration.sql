-- Audit action recorded when a student with outstanding fees is marked former.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'STUDENT_MARKED_FORMER_WITH_ARREARS';
