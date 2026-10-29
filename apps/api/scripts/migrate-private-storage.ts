/** Resumable private-file migration. Dry-run by default; never fetches arbitrary URLs. */
import "../src/load-env.js";
import { createHash, randomUUID } from "node:crypto";
import { GetObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Prisma } from "@prisma/client";
import { Readable } from "node:stream";
import { prisma } from "../src/prisma/prisma.client.js";
import { env } from "../src/env.js";
import { PrivateStorageService } from "../src/modules/storage/private-storage.service.js";
import { UploadValidationService } from "../src/modules/storage/upload-validation.service.js";
import { writeAudit } from "../src/common/audit/audit.js";

const apply = process.argv.includes("--apply");
const removePublic = process.argv.includes("--remove-public");
const storage = new PrivateStorageService();
const validation = new UploadValidationService();
const publicBase = env.R2_PUBLIC_URL?.replace(/\/+$/, "");
const source = new S3Client({ region: "auto", endpoint: env.R2_ENDPOINT ?? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID ?? "", secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? "" } });
const counts = { eligible: 0, migrated: 0, blocked: 0, removed: 0 };
const actorId = process.env.MIGRATION_ACTOR_ID;
const actor = { id: actorId ?? "", ipAddress: null, userAgent: "SchoolHub private-storage migration CLI" };

async function migrate(kind: "document" | "signature", id: string, schoolId: string, oldUrl: string, personKind?: string, personId?: string) {
  const runId = `private-migration:${kind}:${id}`;
  if (!publicBase || !oldUrl.startsWith(`${publicBase}/`)) { counts.blocked++; return; }
  const legacyKey = oldUrl.slice(publicBase.length + 1);
  storage.assertOwned(schoolId, legacyKey);
  counts.eligible++;
  if (!apply) return;
  const object = await source.send(new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: legacyKey }), { abortSignal: AbortSignal.timeout(30_000) });
  if (!object.Body || (object.ContentLength ?? 0) > 10 * 1024 * 1024) throw new Error("Legacy file exceeds the migration limit");
  if (!(object.Body instanceof Readable)) throw new Error("Invalid object stream");
  const parts: Buffer[] = []; let size = 0;
  const sourceStream = object.Body;
  const timeout = setTimeout(() => sourceStream.destroy(new Error("Migration read timeout")), 30_000);
  try {
    for await (const chunk of sourceStream) {
      const part = Buffer.from(chunk); size += part.length;
      if (size > 10 * 1024 * 1024) throw new Error("Legacy file exceeds the migration limit");
      parts.push(part);
    }
  } finally { clearTimeout(timeout); sourceStream.destroy(); }
  const bytes = Buffer.concat(parts);
  const checked = kind === "signature" ? await validation.image(Buffer.from(bytes)) : await validation.document(Buffer.from(bytes));
  const key = `schools/${schoolId}/migrated/${kind}/${id}-${randomUUID()}.${checked.ext}`;
  const reservation = `storage-delete:${createHash("sha256").update(key).digest("hex")}`;
  await prisma.backgroundJob.create({ data: { id: reservation, kind: "storage-delete", schoolId, payload: { schoolId, key }, nextAttempt: new Date(Date.now() + 24 * 3600_000) } });
  await storage.upload(schoolId, key, checked.buffer, checked.mime);
  const reread = await storage.read(schoolId, key, 10 * 1024 * 1024);
  if (!createHash("sha256").update(reread).digest().equals(createHash("sha256").update(checked.buffer).digest())) throw new Error("Private copy verification failed");
  await prisma.$transaction(async tx => {
    const updated = kind === "document"
      ? await tx.document.updateMany({ where: { id, schoolId, storageKey: null, fileUrl: oldUrl }, data: { storageKey: key, fileUrl: `/api/documents/${id}/download`, fileSize: checked.buffer.length, fileType: checked.mime } })
      : await tx.userProfile.updateMany({ where: { id, signatureStorageKey: null, signatureUrl: oldUrl }, data: { signatureStorageKey: key, signatureUrl: `/api/schools/current/signatures/${personKind}/${personId}` } });
    if (updated.count !== 1) throw new Error("Source record changed during migration; refresh before retrying");
    await tx.backgroundJob.deleteMany({ where: { id: reservation, status: "PENDING" } });
    await tx.backgroundJob.upsert({ where: { id: runId }, create: { id: runId, kind: "private-migration", schoolId,
      status: "SUCCEEDED", completedAt: new Date(), payload: { kind, id, schoolId, legacyKey, key, legacyRemoved: false } }, update: {} });
    await writeAudit(tx, actor, { action: "UPDATE", schoolId, entityType: "storage.private-migration", entityId: id, newValues: { kind } });
  });
  counts.migrated++;
}

try {
  if (removePublic && !apply) throw new Error("--remove-public requires --apply");
  if (apply) {
    const account = actorId ? await prisma.user.findUnique({ where: { id: actorId }, select: { role: true, banned: true } }) : null;
    if (!account || account.role !== "superAdmin" || account.banned) throw new Error("Set MIGRATION_ACTOR_ID to an active platform administrator");
    if (!env.R2_BUCKET_NAME || !env.R2_PRIVATE_BUCKET_NAME || env.R2_BUCKET_NAME === env.R2_PRIVATE_BUCKET_NAME) throw new Error("Configure distinct public and private buckets");
  }
  // Read in bounded pages; repeat execution safely skips already migrated rows.
  let after: string | undefined;
  while (true) {
    const documents = await prisma.document.findMany({ where: { storageKey: null, entityType: "SCHOOL", ...(after ? { id: { gt: after } } : {}) }, take: 100, orderBy: { id: "asc" } });
    for (const doc of documents) await migrate("document", doc.id, doc.schoolId, doc.fileUrl);
    if (documents.length < 100) break; after = documents[documents.length - 1]!.id;
  }
  after = undefined;
  while (true) {
    const profiles: Array<{ id: string; signatureUrl: string | null; teacher: { id: string; schoolId: string } | null; staff: { id: string; schoolId: string } | null }> = await prisma.userProfile.findMany({ where: { signatureStorageKey: null, signatureUrl: { not: null }, ...(after ? { id: { gt: after } } : {}) },
      include: { teacher: { select: { id: true, schoolId: true } }, staff: { select: { id: true, schoolId: true } } }, take: 100, orderBy: { id: "asc" } });
    for (const profile of profiles) {
      const person = profile.teacher ?? profile.staff;
      if (!person) { counts.blocked++; continue; }
      await migrate("signature", profile.id, person.schoolId, profile.signatureUrl!, profile.teacher ? "teacher" : "staff", person.id);
    }
    if (profiles.length < 100) break; after = profiles[profiles.length - 1]!.id;
  }
  if (removePublic) {
    after = undefined;
    while (true) {
      const copies: Array<{ id: string; payload: Prisma.JsonValue }> = await prisma.backgroundJob.findMany({ where: { kind: "private-migration", status: "SUCCEEDED", ...(after ? { id: { gt: after } } : {}) }, orderBy: { id: "asc" }, take: 100 });
      for (const copy of copies) {
        const data = copy.payload as { schoolId: string; legacyKey: string; key: string; legacyRemoved: boolean };
        if (data.legacyRemoved) continue;
        storage.assertOwned(data.schoolId, data.legacyKey);
        // Verify the private copy still exists immediately before removing the source.
        await storage.read(data.schoolId, data.key, 10 * 1024 * 1024);
        await source.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: data.legacyKey }), { abortSignal: AbortSignal.timeout(10_000) });
        await prisma.backgroundJob.update({ where: { id: copy.id }, data: { payload: { ...data, legacyRemoved: true } } });
        counts.removed++;
      }
      if (copies.length < 100) break; after = copies[copies.length - 1]!.id;
    }
  }
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...counts }));
  if (counts.blocked) process.exitCode = 2;
} catch {
  console.error("Private-storage migration stopped. Check configuration and restricted database records before retrying; no arbitrary external URL was fetched.");
  process.exitCode = 1;
} finally { source.destroy(); await prisma.$disconnect(); }
