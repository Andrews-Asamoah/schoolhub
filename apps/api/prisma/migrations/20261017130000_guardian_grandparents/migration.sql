-- Guardian relationship: grandparents.
ALTER TYPE "GuardianType" ADD VALUE IF NOT EXISTS 'GRANDFATHER';
ALTER TYPE "GuardianType" ADD VALUE IF NOT EXISTS 'GRANDMOTHER';
