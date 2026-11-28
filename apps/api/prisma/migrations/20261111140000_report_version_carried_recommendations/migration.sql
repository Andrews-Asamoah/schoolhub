-- When a report batch is regenerated, the class teacher's and headteacher's recommendations from the
-- previous version are carried onto the new one as a prefill. They are not an approval: the new version
-- still has to be signed off, so the signed fields stay untouched and the version guard trigger is unaffected.
ALTER TABLE "report_card_versions" ADD COLUMN "carriedTeacherRemark" VARCHAR(2000);
ALTER TABLE "report_card_versions" ADD COLUMN "carriedHeadRemark" VARCHAR(2000);
