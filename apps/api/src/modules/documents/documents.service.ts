import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type { School } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service.js";
import { writeAudit, type AuditActor } from "../../common/audit/audit.js";
import { PrivateStorageService } from "../storage/private-storage.service.js";
import { UploadValidationService } from "../storage/upload-validation.service.js";
import { StorageCleanupService } from "../storage/storage-cleanup.service.js";

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const leadership = (role: string) => ["owner", "admin", "headteacher"].includes(role);
const visibleWhere = (schoolId: string, role: string) => ({ schoolId, entityType: "SCHOOL" as const, entityId: schoolId,
  ...(!leadership(role) ? { audience: "STAFF" } : {}) });

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService, private readonly storage: PrivateStorageService,
    private readonly validation: UploadValidationService, private readonly cleanup: StorageCleanupService) {}

  async listSchoolDocuments(schoolId: string, role: string, page: number, limit: number, search = "") {
    const where = { ...visibleWhere(schoolId, role), ...(search ? { OR: [
      { title: { contains: search, mode: "insensitive" as const } },
      { description: { contains: search, mode: "insensitive" as const } },
    ] } : {}) };
    const [data, total] = await Promise.all([
      this.prisma.client.document.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit, take: limit, include: { uploadedBy: { select: { id: true, name: true } } } }),
      this.prisma.client.document.count({ where }),
    ]);
    return { data: data.map(({ storageKey, ...doc }) => ({ ...doc, fileUrl: `/api/documents/${doc.id}/download`, storageReady: Boolean(storageKey) })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async uploadSchoolDocument(school: School, actor: AuditActor, file: Express.Multer.File | undefined,
    title: string, description?: string, audience = "STAFF") {
    const normalizedTitle = typeof title === "string" ? title.trim() : "";
    const normalizedDescription = typeof description === "string" ? description.trim() : "";
    if (normalizedTitle.length < 2 || normalizedTitle.length > 150) throw new BadRequestException("Document title must contain 2–150 characters.");
    if (normalizedDescription.length > 500) throw new BadRequestException("Description must be 500 characters or fewer.");
    if (!["STAFF", "LEADERSHIP"].includes(audience)) throw new BadRequestException("Choose a valid document audience.");
    if (!file?.buffer?.length || file.buffer.length > MAX_DOCUMENT_BYTES) throw new BadRequestException("Choose a document of 10 MB or smaller.");
    const validated = await this.validation.document(file.buffer);
    const id = randomUUID();
    const key = `schools/${school.id}/files/documents/${id}.${validated.ext}`;
    const reservation = await this.cleanup.reserve(school.id, key);
    await this.storage.upload(school.id, key, validated.buffer, validated.mime);
    try {
      const doc = await this.prisma.client.$transaction(async tx => {
        const created = await tx.document.create({ data: { id, schoolId: school.id, title: normalizedTitle,
          description: normalizedDescription || null, storageKey: key, fileUrl: `/api/documents/${id}/download`,
          fileType: validated.mime, fileSize: validated.buffer.length, audience, entityType: "SCHOOL", entityId: school.id,
          uploadedById: actor.id }, include: { uploadedBy: { select: { id: true, name: true } } } });
        await this.cleanup.keep(reservation, tx);
        await writeAudit(tx, actor, { action: "CREATE", entityType: "document.upload", entityId: id, schoolId: school.id,
          newValues: { audience, fileType: validated.mime, fileSize: validated.buffer.length } });
        return created;
      });
      const { storageKey: _storageKey, ...visible } = doc;
      return { ...visible, storageReady: true };
    } catch (error) {
      await this.cleanup.enqueue(school.id, key);
      throw error;
    }
  }

  async download(schoolId: string, id: string, role: string, actor: AuditActor) {
    const document = await this.prisma.client.document.findFirst({ where: { id, ...visibleWhere(schoolId, role) } });
    if (!document) throw new NotFoundException("Document not found.");
    // Old public URLs are NEVER redirected to or fetched. Migrate them first.
    if (!document.storageKey) throw new ServiceUnavailableException("This document is awaiting private-storage migration.");
    const body = await this.storage.read(schoolId, document.storageKey, MAX_DOCUMENT_BYTES);
    await writeAudit(this.prisma.client, actor, { action: "FILE_DOWNLOADED", entityType: "document.download", entityId: id, schoolId });
    return { body, fileType: document.fileType, title: document.title };
  }

  async removeSchoolDocument(school: School, id: string, actor: AuditActor) {
    return this.prisma.client.$transaction(async tx => {
      const document = await tx.document.findFirst({ where: { id, schoolId: school.id, entityType: "SCHOOL", entityId: school.id } });
      if (!document) throw new NotFoundException("Document not found.");
      if (document.storageKey) await this.cleanup.enqueue(school.id, document.storageKey, tx);
      await tx.document.delete({ where: { id: document.id } });
      await writeAudit(tx, actor, { action: "DELETE", entityType: "document.delete", entityId: id, schoolId: school.id });
      return { success: true };
    });
  }
}
