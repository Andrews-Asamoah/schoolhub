CREATE TABLE academic_rollover_batches (
 id TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL REFERENCES schools(id),
 "fromYearId" TEXT NOT NULL REFERENCES academic_years(id), "fromTermId" TEXT NOT NULL REFERENCES terms(id),
 "toYearId" TEXT NOT NULL REFERENCES academic_years(id), "toTermId" TEXT NOT NULL REFERENCES terms(id),
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','APPLIED','ROLLBACK_PENDING','ROLLED_BACK')),
 "createdById" TEXT NOT NULL REFERENCES users(id), "approvedById" TEXT REFERENCES users(id), "approvedAt" TIMESTAMP(3), "approvalNote" TEXT,
 "reviewSnapshot" JSONB NOT NULL, plan JSONB NOT NULL, "evidenceHash" TEXT NOT NULL, "beforeState" JSONB, "afterHash" TEXT,
 "appliedAt" TIMESTAMP(3), "appliedById" TEXT REFERENCES users(id),
 "rollbackRequestedById" TEXT REFERENCES users(id), "rollbackReason" TEXT,
 "rolledBackAt" TIMESTAMP(3), "rolledBackById" TEXT REFERENCES users(id),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK("fromYearId"<>"toYearId"), CHECK("approvedById" IS NULL OR "approvedById"<>"createdById"),
 CHECK("rolledBackById" IS NULL OR "rolledBackById"<>"rollbackRequestedById")
);
CREATE INDEX academic_rollover_school_status ON academic_rollover_batches("schoolId",status,"createdAt");
ALTER TABLE promotion_records ADD COLUMN "rolloverBatchId" TEXT REFERENCES academic_rollover_batches(id), ADD COLUMN "reversedAt" TIMESTAMP(3), ADD COLUMN "reversedById" TEXT REFERENCES users(id);
CREATE UNIQUE INDEX promotion_rollover_student ON promotion_records("rolloverBatchId","studentId");
CREATE FUNCTION lock_academic_rollover_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE school TEXT;
BEGIN
 IF TG_TABLE_NAME IN ('enrollments','attendances','assessment_scores','school_assignment_submissions','report_cards') THEN
   SELECT "schoolId" INTO school FROM students WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD."studentId" ELSE NEW."studentId" END;
 ELSIF TG_TABLE_NAME='terms' THEN
   SELECT "schoolId" INTO school FROM academic_years WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD."academicYearId" ELSE NEW."academicYearId" END;
 ELSE school:=CASE WHEN TG_OP='DELETE' THEN OLD."schoolId" ELSE NEW."schoolId" END;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtext(school),hashtext('academic-rollover'));
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
DO $$ DECLARE tab TEXT; BEGIN
 FOREACH tab IN ARRAY ARRAY['students','enrollments','classes','academic_years','terms','academic_rollover_batches','attendances','assessment_scores','school_assignment_submissions','report_cards','report_card_versions','report_card_sets','bills'] LOOP
 EXECUTE format('CREATE TRIGGER academic_rollover_lock BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION lock_academic_rollover_scope()',tab);
 END LOOP;
END $$;
CREATE FUNCTION protect_academic_rollover_batch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Academic rollover history cannot be deleted'; END IF;
 IF NEW."reviewSnapshot"<>OLD."reviewSnapshot" OR NEW.plan<>OLD.plan OR NEW."evidenceHash"<>OLD."evidenceHash" OR NEW."schoolId"<>OLD."schoolId" OR NEW."createdById"<>OLD."createdById" OR NEW."fromYearId"<>OLD."fromYearId" OR NEW."toYearId"<>OLD."toYearId" OR NEW."fromTermId"<>OLD."fromTermId" OR NEW."toTermId"<>OLD."toTermId" THEN RAISE EXCEPTION 'Submitted rollover scope and decisions are immutable'; END IF;
 IF OLD.status IN ('REJECTED','ROLLED_BACK') THEN RAISE EXCEPTION 'Final rollover history is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_rollover_batch BEFORE UPDATE OR DELETE ON academic_rollover_batches FOR EACH ROW EXECUTE FUNCTION protect_academic_rollover_batch();
CREATE FUNCTION protect_rollover_promotion_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."rolloverBatchId" IS NULL THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Rollover promotion history cannot be deleted'; END IF;
 IF OLD."reversedAt" IS NOT NULL OR NEW.id<>OLD.id OR NEW."promotedAt"<>OLD."promotedAt" OR NEW."rolloverBatchId" IS DISTINCT FROM OLD."rolloverBatchId" OR NEW."studentId"<>OLD."studentId" OR NEW."schoolId"<>OLD."schoolId" OR NEW."fromClassId"<>OLD."fromClassId" OR NEW."toClassId" IS DISTINCT FROM OLD."toClassId" OR NEW."fromYearId"<>OLD."fromYearId" OR NEW."toYearId" IS DISTINCT FROM OLD."toYearId" OR NEW."promotionType"<>OLD."promotionType" OR NEW.reason IS DISTINCT FROM OLD.reason OR NEW."promotedById"<>OLD."promotedById" OR NEW.notes IS DISTINCT FROM OLD.notes THEN RAISE EXCEPTION 'Rollover decisions are immutable; record an approved reversal'; END IF;
 IF NEW."reversedAt" IS NULL OR NEW."reversedById" IS NULL OR NOT EXISTS(SELECT 1 FROM academic_rollover_batches WHERE id=OLD."rolloverBatchId" AND status='ROLLBACK_PENDING') THEN RAISE EXCEPTION 'A pending independent rollback is required to reverse promotion history'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_rollover_promotion_record BEFORE UPDATE OR DELETE ON promotion_records FOR EACH ROW EXECUTE FUNCTION protect_rollover_promotion_record();
