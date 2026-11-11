ALTER TABLE "sessions" ADD COLUMN "clientPlatform" TEXT NOT NULL DEFAULT 'web';
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_clientPlatform_check" CHECK ("clientPlatform" IN ('web', 'desktop'));
