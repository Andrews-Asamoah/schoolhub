CREATE TABLE school_sms_connections (
 id TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL REFERENCES schools(id), "senderId" TEXT NOT NULL,
 "clientIdHint" TEXT NOT NULL, "apiBaseUrl" TEXT NOT NULL, "encryptedCredentials" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "retiredAt" TIMESTAMP(3), "revokedAt" TIMESTAMP(3),
 UNIQUE(id,"schoolId"), CHECK("senderId" ~ '^[A-Za-z0-9]{1,11}$'),
 CHECK("apiBaseUrl" IN ('https://sms.hubtel.com/v1/messages','https://smsc.hubtel.com/v1/messages'))
);
CREATE INDEX school_sms_connection_school_date ON school_sms_connections("schoolId","createdAt");
CREATE INDEX school_sms_connection_retention ON school_sms_connections("retiredAt");
ALTER TABLE school_notification_settings ADD COLUMN "smsConnectionId" TEXT;
ALTER TABLE school_notification_settings ADD CONSTRAINT school_notification_settings_sms_account_fkey FOREIGN KEY("smsConnectionId","schoolId") REFERENCES school_sms_connections(id,"schoolId");
ALTER TABLE notification_deliveries ADD COLUMN "smsConnectionId" TEXT, ADD COLUMN "providerScope" TEXT NOT NULL DEFAULT 'platform';
ALTER TABLE notification_deliveries ADD CONSTRAINT notification_deliveries_sms_account_fkey FOREIGN KEY("smsConnectionId","schoolId") REFERENCES school_sms_connections(id,"schoolId");
ALTER TABLE notification_deliveries DROP CONSTRAINT "notification_deliveries_provider_providerMessageId_key";
ALTER TABLE notification_deliveries ADD CONSTRAINT "notification_delivery_provider_scope_id" UNIQUE(provider,"providerScope","providerMessageId");
ALTER TABLE notification_deliveries ADD CONSTRAINT notification_delivery_provider_scope CHECK((provider='RESEND' AND "providerScope"='platform' AND "smsConnectionId" IS NULL) OR (provider='HUBTEL' AND (("smsConnectionId" IS NULL AND "providerScope"='platform') OR ("smsConnectionId" IS NOT NULL AND "providerScope"="smsConnectionId"))));
-- Existing unscoped SMS cannot borrow a school's new account or the platform wallet.
UPDATE notification_deliveries SET status=CASE WHEN status='PENDING' THEN 'SUPPRESSED' ELSE 'UNKNOWN' END,reason='SCHOOL_SMS_SETUP_REQUIRED',"nextPollAt"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE channel='SMS' AND status IN ('PENDING','SENDING','ACCEPTED');
UPDATE school_notification_settings SET "smsEnabled"=false,"updatedAt"=CURRENT_TIMESTAMP;
CREATE FUNCTION protect_school_sms_connection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.id<>OLD.id OR NEW."schoolId"<>OLD."schoolId" OR NEW."senderId"<>OLD."senderId" OR NEW."clientIdHint"<>OLD."clientIdHint" OR NEW."apiBaseUrl"<>OLD."apiBaseUrl" OR NEW."createdAt"<>OLD."createdAt" THEN RAISE EXCEPTION 'SMS account version is immutable'; END IF;
 IF NEW."encryptedCredentials" IS DISTINCT FROM OLD."encryptedCredentials" AND NEW."encryptedCredentials" IS NOT NULL THEN RAISE EXCEPTION 'SMS credentials can only be erased; create a new version to replace them'; END IF;
 IF OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt" THEN RAISE EXCEPTION 'SMS account revocation is permanent'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_school_sms_connection BEFORE UPDATE ON school_sms_connections FOR EACH ROW EXECUTE FUNCTION protect_school_sms_connection();
CREATE OR REPLACE FUNCTION enqueue_notification_delivery() RETURNS trigger LANGUAGE plpgsql AS $$
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
   IF kind='SMS' AND preferences."smsEnabled" AND settings."smsEnabled" AND phone IS NOT NULL AND settings."smsConnectionId" IS NOT NULL THEN address:=phone; END IF;
   IF address IS NOT NULL THEN
     delivery_id:='delivery_'||md5(NEW.id||':'||kind);
     INSERT INTO notification_deliveries(id,"notificationId","schoolId","userId",channel,provider,"providerScope","smsConnectionId",recipient,"expiresAt","updatedAt")
       VALUES(delivery_id,NEW.id,NEW."schoolId",NEW."userId",kind,CASE WHEN kind='EMAIL' THEN 'RESEND' ELSE 'HUBTEL' END,CASE WHEN kind='EMAIL' THEN 'platform' ELSE settings."smsConnectionId" END,CASE WHEN kind='SMS' THEN settings."smsConnectionId" ELSE NULL END,address,NEW."createdAt"+INTERVAL '23 hours',CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
     INSERT INTO background_jobs(id,kind,"schoolId",payload,"updatedAt") VALUES(delivery_id,'notification-delivery',NEW."schoolId",jsonb_build_object('deliveryId',delivery_id),CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
   END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION protect_notification_payload() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."smsConnectionId" IS DISTINCT FROM OLD."smsConnectionId" OR NEW."providerScope"<>OLD."providerScope" OR NEW.id<>OLD.id OR NEW."schoolId"<>OLD."schoolId" OR NEW."userId"<>OLD."userId" OR NEW."notificationId"<>OLD."notificationId" OR NEW.channel<>OLD.channel OR NEW.provider<>OLD.provider OR NEW.recipient<>OLD.recipient OR NEW."expiresAt"<>OLD."expiresAt" THEN RAISE EXCEPTION 'Delivery identity and recipient are immutable'; END IF;
 IF OLD.payload IS NOT NULL AND NEW.payload IS DISTINCT FROM OLD.payload THEN RAISE EXCEPTION 'Prepared provider payload is immutable'; END IF;
 RETURN NEW;
END $$;
