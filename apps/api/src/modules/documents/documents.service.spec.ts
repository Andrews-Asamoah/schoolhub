import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { School } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

// R2Service validates deployment environment at import time. Unit tests inject
// a storage fake, so mock the class token before importing DocumentsService.
vi.mock("../storage/r2.service.js", () => ({ R2Service: class R2Service {} }));

import { DocumentsService } from "./documents.service.js";

function buildService() {
  const client = {
    document: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: "document-1",
        schoolId: "school-a",
        title: "School handbook",
        description: null,
        fileUrl: "https://files.example.test/schools/school-a/files/documents/handbook.pdf",
        fileType: "application/pdf",
        fileSize: 16,
        entityType: "SCHOOL",
        entityId: "school-a",
        uploadedById: "user-a",
      }),
      delete: vi.fn().mockResolvedValue({ id: "document-1" }),
    },
  };
  const r2 = {
    keys: {
      document: vi.fn().mockReturnValue("schools/school-a/files/documents/handbook.pdf"),
      schoolPrefix: vi.fn().mockReturnValue("schools/school-a/"),
    },
    upload: vi.fn().mockResolvedValue("https://files.example.test/schools/school-a/files/documents/handbook.pdf"),
    delete: vi.fn().mockResolvedValue(undefined),
    keyFromUrl: vi.fn().mockReturnValue("schools/school-a/files/documents/handbook.pdf"),
  };
  return { service: new DocumentsService({ client } as never, r2 as never), client, r2 };
}

const school = { id: "school-a", name: "School A" } as School;
const pdfBuffer = Buffer.from("%PDF-1.7\nTest document", "ascii");
const pdfFile = { buffer: pdfBuffer, size: pdfBuffer.length, originalname: "handbook.pdf", mimetype: "application/pdf" } as Express.Multer.File;

describe("DocumentsService school scope and validation", () => {
  it("lists only school-wide documents for the active school", async () => {
    const { service, client } = buildService();

    await service.listSchoolDocuments("school-a");

    expect(client.document.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { schoolId: "school-a", entityType: "SCHOOL", entityId: "school-a" },
      orderBy: { createdAt: "desc" },
      take: 500,
    }));
  });

  it("rejects unsupported file bytes before uploading to storage", async () => {
    const { service, client, r2 } = buildService();
    const invalidFile = {
      buffer: Buffer.from("<script>alert(1)</script>", "ascii"),
      size: 25,
      originalname: "handbook.pdf",
      mimetype: "application/pdf",
    } as Express.Multer.File;

    await expect(service.uploadSchoolDocument(school, "user-a", invalidFile, "School handbook"))
      .rejects.toBeInstanceOf(BadRequestException);

    expect(r2.upload).not.toHaveBeenCalled();
    expect(client.document.create).not.toHaveBeenCalled();
  });

  it("stores a validated PDF with the school-scoped object key and metadata", async () => {
    const { service, client, r2 } = buildService();

    await service.uploadSchoolDocument(school, "user-a", pdfFile, "School handbook", "Current policies");

    expect(r2.keys.document).toHaveBeenCalledWith("school-a", "documents", "pdf");
    expect(r2.upload).toHaveBeenCalledWith(
      "schools/school-a/files/documents/handbook.pdf",
      pdfBuffer,
      "application/pdf",
    );
    expect(client.document.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        schoolId: "school-a",
        entityType: "SCHOOL",
        entityId: "school-a",
        uploadedById: "user-a",
        title: "School handbook",
        description: "Current policies",
        fileType: "application/pdf",
      }),
    }));
  });

  it("does not delete a document outside the active school's document library", async () => {
    const { service, client, r2 } = buildService();

    await expect(service.removeSchoolDocument(school, "document-from-another-school"))
      .rejects.toBeInstanceOf(NotFoundException);

    expect(client.document.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "document-from-another-school",
        schoolId: "school-a",
        entityType: "SCHOOL",
        entityId: "school-a",
      },
    }));
    expect(client.document.delete).not.toHaveBeenCalled();
    expect(r2.delete).not.toHaveBeenCalled();
  });
});
