CREATE TABLE school_notification_settings (
 "schoolId" TEXT PRIMARY KEY REFERENCES schools(id), "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
 "smsEnabled" BOOLEAN NOT NULL DEFAULT false, "emailDailyLimit" INTEGER NOT NULL DEFAULT 0 CHECK("emailDailyLimit" BETWEEN 0 AND 100000),
 "smsDailyLimit" INTEGER NOT NULL DEFAULT 0 CHECK("smsDailyLimit" BETWEEN 0 AND 10000), "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE notification_preferences (
 id TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL REFERENCES schools(id), "userId" TEXT NOT NULL REFERENCES users(id),
 "emailEnabled" BOOLEAN NOT NULL DEFAULT false, "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
 "consentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, UNIQUE("schoolId","userId")
);
CREATE TABLE notification_deliveries (
 id TEXT PRIMARY KEY, "notificationId" TEXT NOT NULL REFERENCES notifications(id), "schoolId" TEXT NOT NULL REFERENCES schools(id),
 "userId" TEXT NOT NULL REFERENCES users(id), channel TEXT NOT NULL CHECK(channel IN ('EMAIL','SMS')),
 provider TEXT NOT NULL CHECK(provider IN ('RESEND','HUBTEL')), recipient TEXT NOT NULL, "recipientHash" TEXT, payload JSONB,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENDING','ACCEPTED','DELAYED','DELIVERED','FAILED','BOUNCED','COMPLAINED','SUPPRESSED','UNKNOWN','DEAD','EXPIRED')),
 "providerMessageId" TEXT, attempts INTEGER NOT NULL DEFAULT 0, reason TEXT, "quotaDay" DATE,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 "expiresAt" TIMESTAMP(3) NOT NULL, "acceptedAt" TIMESTAMP(3), "deliveredAt" TIMESTAMP(3), "nextPollAt" TIMESTAMP(3),
 UNIQUE("notificationId",channel), UNIQUE(provider,"providerMessageId")
);
CREATE INDEX notification_delivery_school_date ON notification_deliveries("schoolId","createdAt");
CREATE INDEX notification_delivery_poll ON notification_deliveries(status,"nextPollAt");
CREATE TABLE notification_daily_usage (
 id TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL REFERENCES schools(id), day DATE NOT NULL,
 channel TEXT NOT NULL CHECK(channel IN ('EMAIL','SMS')), used INTEGER NOT NULL DEFAULT 0 CHECK(used>=0), UNIQUE("schoolId",day,channel)
);
CREATE TABLE notification_suppressions (id TEXT PRIMARY KEY, channel TEXT NOT NULL, "recipientHash" TEXT NOT NULL, reason TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(channel,"recipientHash"));
CREATE TABLE notification_provider_events (id TEXT PRIMARY KEY, provider TEXT NOT NULL, "messageId" TEXT NOT NULL, kind TEXT NOT NULL, "eventAt" TIMESTAMP(3) NOT NULL, "processedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX notification_event_processing ON notification_provider_events(provider,"messageId","processedAt");
-- Outbox and leased job are inserted atomically with every eligible in-app notification.
-- No backfill: changing consent must not send historical notifications.
CREATE FUNCTION enqueue_notification_delivery() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE preferences notification_preferences; settings school_notification_settings; recipient users; phone TEXT; kind TEXT; address TEXT; delivery_id TEXT;
BEGIN
 SELECT * INTO preferences FROM notification_preferences WHERE "schoolId"=NEW."schoolId" AND "userId"=NEW."userId";
 SELECT * INTO settings FROM school_notification_settings WHERE "schoolId"=NEW."schoolId";
 SELECT * INTO recipient FROM users WHERE id=NEW."userId" AND NOT banned;
 IF recipient.id IS NULL OR NOT EXISTS(SELECT 1 FROM members m JOIN schools s ON s."organizationId"=m."organizationId" WHERE s.id=NEW."schoolId" AND m."userId"=NEW."userId" AND NOT m.banned) THEN RETURN NEW; END IF;
 SELECT p.phone INTO phone FROM user_profiles p WHERE p."userId"=NEW."userId";
 FOREACH kind IN ARRAY ARRAY['EMAIL','SMS'] LOOP
   address:=NULL;
   IF kind='EMAIL' AND preferences."emailEnabled" AND settings."emailEnabled" AND recipient."emailVerified" THEN address:=recipient.email; END IF;
   IF kind='SMS' AND preferences."smsEnabled" AND settings."smsEnabled" AND phone IS NOT NULL THEN address:=phone; END IF;
   IF address IS NOT NULL THEN
     delivery_id:='delivery_'||md5(NEW.id||':'||kind);
     INSERT INTO notification_deliveries(id,"notificationId","schoolId","userId",channel,provider,recipient,"expiresAt","updatedAt")
       VALUES(delivery_id,NEW.id,NEW."schoolId",NEW."userId",kind,CASE WHEN kind='EMAIL' THEN 'RESEND' ELSE 'HUBTEL' END,address,NEW."createdAt"+INTERVAL '23 hours',CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
     INSERT INTO background_jobs(id,kind,"schoolId",payload,"updatedAt") VALUES(delivery_id,'notification-delivery',NEW."schoolId",jsonb_build_object('deliveryId',delivery_id),CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
   END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER notification_delivery_outbox AFTER INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION enqueue_notification_delivery();
CREATE FUNCTION protect_notification_payload() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.id<>OLD.id OR NEW."schoolId"<>OLD."schoolId" OR NEW."userId"<>OLD."userId" OR NEW."notificationId"<>OLD."notificationId" OR NEW.channel<>OLD.channel OR NEW.provider<>OLD.provider OR NEW.recipient<>OLD.recipient OR NEW."expiresAt"<>OLD."expiresAt" THEN RAISE EXCEPTION 'Delivery identity and recipient are immutable'; END IF;
 IF OLD.payload IS NOT NULL AND NEW.payload IS DISTINCT FROM OLD.payload THEN RAISE EXCEPTION 'Prepared provider payload is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_notification_payload BEFORE UPDATE ON notification_deliveries FOR EACH ROW EXECUTE FUNCTION protect_notification_payload();
