import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { School } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service.js";
import { R2Service } from "../storage/r2.service.js";
import { sniffImage } from "../storage/image-validation.js";

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly r2: R2Service,
  ) {}

  listSchoolDocuments(schoolId: string) {
    return this.prisma.client.document.findMany({
      where: { schoolId, entityType: "SCHOOL", entityId: schoolId },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { uploadedBy: { select: { id: true, name: true } } },
    });
  }

  async uploadSchoolDocument(
    school: School,
    uploadedById: string,
    file: Express.Multer.File | undefined,
    title: string,
    description?: string,
  ) {
    const normalizedTitle = typeof title === "string" ? title.trim() : "";
    const normalizedDescription = typeof description === "string" ? description.trim() : "";
    if (normalizedTitle.length < 2 || normalizedTitle.length > 150) {
      throw new BadRequestException("Document title must contain 2–150 characters.");
    }
    if (normalizedDescription.length > 500) {
      throw new BadRequestException("Description must be 500 characters or fewer.");
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException("Choose a document to upload.");
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      throw new BadRequestException("Documents must be 10 MB or smaller.");
    }

    const image = sniffImage(file.buffer);
    const isPdf = file.buffer.length >= 5 && file.buffer.subarray(0, 5).toString("ascii") === "%PDF-";
    if (!image && !isPdf) {
      throw new BadRequestException("Only real PDF, JPEG, PNG, and WebP files are supported.");
    }

    const ext = image?.ext ?? "pdf";
    const mime = image?.mime ?? "application/pdf";
    const key = this.r2.keys.document(school.id, "documents", ext);
    const fileUrl = await this.r2.upload(key, file.buffer, mime);

    try {
      return await this.prisma.client.document.create({
        data: {
          schoolId: school.id,
          title: normalizedTitle,
          description: normalizedDescription || null,
          fileUrl,
          fileType: mime,
          fileSize: file.buffer.length,
          entityType: "SCHOOL",
          entityId: school.id,
          uploadedById,
        },
        include: { uploadedBy: { select: { id: true, name: true } } },
      });
    } catch (error) {
      await this.r2.delete(key);
      throw error;
    }
  }

  async removeSchoolDocument(school: School, id: string) {
    const document = await this.prisma.client.document.findFirst({
      where: { id, schoolId: school.id, entityType: "SCHOOL", entityId: school.id },
      select: { id: true, fileUrl: true },
    });
    if (!document) throw new NotFoundException("Document not found.");

    await this.prisma.client.document.delete({ where: { id: document.id } });
    const key = this.r2.keyFromUrl(document.fileUrl);
    if (key?.startsWith(this.r2.keys.schoolPrefix(school.id))) {
      await this.r2.delete(key);
    }
    return { success: true };
  }
}
