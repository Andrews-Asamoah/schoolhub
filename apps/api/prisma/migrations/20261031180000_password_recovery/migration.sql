CREATE TABLE password_recovery_requests (
 id TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES users(id),
 "credentialFingerprint" TEXT NOT NULL, "tokenHash" TEXT NOT NULL UNIQUE, "recipientHash" TEXT NOT NULL,
 "encryptedPayload" TEXT, status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACCEPTED','SUPPRESSED','EXPIRED','DEAD')),
 "providerMessageId" TEXT, "expiresAt" TIMESTAMP(3) NOT NULL, "consumedAt" TIMESTAMP(3), "revokedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX password_recovery_user_date ON password_recovery_requests("userId","createdAt");
CREATE INDEX password_recovery_expiry ON password_recovery_requests(status,"expiresAt");
CREATE FUNCTION protect_password_recovery() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."createdAt"<>OLD."createdAt" OR NEW."credentialFingerprint"<>OLD."credentialFingerprint" OR NEW.id<>OLD.id OR NEW."userId"<>OLD."userId" OR NEW."tokenHash"<>OLD."tokenHash" OR NEW."recipientHash"<>OLD."recipientHash" OR NEW."expiresAt"<>OLD."expiresAt" THEN RAISE EXCEPTION 'Recovery identity and validity window are immutable'; END IF;
 IF NEW."encryptedPayload" IS DISTINCT FROM OLD."encryptedPayload" AND NEW."encryptedPayload" IS NOT NULL THEN RAISE EXCEPTION 'Recovery payload can only be erased'; END IF;
 IF (OLD."consumedAt" IS NOT NULL AND NEW."consumedAt" IS DISTINCT FROM OLD."consumedAt") OR (OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt") THEN RAISE EXCEPTION 'Recovery consumption and revocation are permanent'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_password_recovery BEFORE UPDATE ON password_recovery_requests FOR EACH ROW EXECUTE FUNCTION protect_password_recovery();
