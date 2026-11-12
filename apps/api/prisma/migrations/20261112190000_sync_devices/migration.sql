-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "desktopDeviceId" TEXT;

-- CreateTable
CREATE TABLE "sync_devices" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "installationId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "platform" VARCHAR(10) NOT NULL,
    "clientVersion" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "revocationReason" VARCHAR(500),

    CONSTRAINT "sync_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sync_devices_schoolId_createdAt_id_idx" ON "sync_devices"("schoolId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "sync_devices_userId_idx" ON "sync_devices"("userId");

-- CreateIndex
CREATE INDEX "sync_devices_revokedById_idx" ON "sync_devices"("revokedById");

-- CreateIndex
CREATE UNIQUE INDEX "sync_devices_schoolId_userId_installationId_key" ON "sync_devices"("schoolId", "userId", "installationId");

-- CreateIndex
CREATE INDEX "sessions_desktopDeviceId_idx" ON "sessions"("desktopDeviceId");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_desktopDeviceId_fkey" FOREIGN KEY ("desktopDeviceId") REFERENCES "sync_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_devices" ADD CONSTRAINT "sync_devices_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_devices" ADD CONSTRAINT "sync_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_devices" ADD CONSTRAINT "sync_devices_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Keep metadata constraints even for writes outside the API.
ALTER TABLE "sync_devices" ADD CONSTRAINT "sync_devices_platform_check" CHECK ("platform" IN ('windows', 'macos', 'linux'));
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_device_channel_check" CHECK ("desktopDeviceId" IS NULL OR "clientPlatform" = 'desktop');
