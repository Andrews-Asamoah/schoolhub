-- Additive BECE import provenance; never store uploaded workbook bytes.
CREATE TABLE "external_exam_imports" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "schoolId" TEXT NOT NULL,
 "sessionId" TEXT NOT NULL,
 "sha256" VARCHAR(64) NOT NULL,
 "originalFilename" VARCHAR(160) NOT NULL,
 "rowsCommitted" INTEGER NOT NULL,
 "importedById" TEXT,
 "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "external_exam_import_sha256" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
 CONSTRAINT "external_exam_import_rows" CHECK ("rowsCommitted" > 0 AND "rowsCommitted" <= 600),
 CONSTRAINT "external_exam_imports_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "external_exam_imports_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "external_exam_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "external_exam_imports_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "external_exam_imports_sessionId_sha256_key" ON "external_exam_imports"("sessionId","sha256");
CREATE INDEX "external_exam_imports_schoolId_importedAt_idx" ON "external_exam_imports"("schoolId","importedAt");
CREATE OR REPLACE FUNCTION schoolhub_external_exam_import_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'BECE import provenance is append-only';
END $$;
CREATE TRIGGER schoolhub_external_exam_import_append_only_trigger
 BEFORE UPDATE OR DELETE ON "external_exam_imports"
 FOR EACH ROW EXECUTE FUNCTION schoolhub_external_exam_import_append_only();
