CREATE TABLE "device_tokens" (
    "registrationId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("registrationId"),
    CONSTRAINT "device_tokens_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "device_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "device_tokens_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");
CREATE INDEX "device_tokens_schoolId_userId_idx" ON "device_tokens"("schoolId", "userId");
CREATE INDEX "device_tokens_sessionId_idx" ON "device_tokens"("sessionId");
CREATE INDEX "device_tokens_userId_idx" ON "device_tokens"("userId");

-- Queue the signal in the same transaction as the in-app notification.
-- Payloads contain references only. Dispatch revalidates the current binding.
CREATE FUNCTION enqueue_mobile_push() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "background_jobs" ("id", "kind", "schoolId", "payload")
  SELECT 'mobile-push:' || NEW."id" || ':' || d."registrationId", 'mobile-push', NEW."schoolId",
    jsonb_build_object('notificationId', NEW."id", 'registrationId', d."registrationId")
  FROM "device_tokens" d
  JOIN "sessions" s ON s."id" = d."sessionId" AND s."expiresAt" > CURRENT_TIMESTAMP
  WHERE d."schoolId" = NEW."schoolId" AND d."userId" = NEW."userId" AND NOT NEW."isRead"
    AND COALESCE(NEW."link", '') !~* '(external-exam|bece)'
  ON CONFLICT ("id") DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "notification_mobile_push"
AFTER INSERT ON "notifications"
FOR EACH ROW EXECUTE FUNCTION enqueue_mobile_push();
