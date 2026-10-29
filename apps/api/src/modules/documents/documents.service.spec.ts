import { BadRequestException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type { School } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
vi.mock("../../env.js", () => ({ env: { NODE_ENV: "test" } }));
import { DocumentsService } from "./documents.service.js";
const school = { id: "school-a" } as School;
const actor = { id: "user-a", ipAddress: null, userAgent: null };
const file = { buffer: Buffer.from("pdf"), size: 3 } as Express.Multer.File;
function build() {
  const document = { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0), findFirst: vi.fn(),
    create: vi.fn().mockImplementation(({ data }) => Promise.resolve(data)), delete: vi.fn() };
  const client = { document, auditLog: { create: vi.fn() }, $transaction: vi.fn() };
  client.$transaction.mockImplementation(fn => fn(client));
  const storage = { upload: vi.fn(), read: vi.fn().mockResolvedValue(Buffer.from("contents")) };
  const validation = { document: vi.fn().mockResolvedValue({ buffer: file.buffer, mime: "application/pdf", ext: "pdf" }) };
  const cleanup = { enqueue: vi.fn(), reserve: vi.fn().mockResolvedValue("reserved"), keep: vi.fn() };
  return { service: new DocumentsService({ client } as never, storage as never, validation as never, cleanup as never), client, storage, validation, cleanup };
}
describe("private school documents", () => {
  it("paginates and filters audience without exposing storage keys or legacy public URLs", async () => {
    const { service, client } = build();
    client.document.findMany.mockResolvedValue([{ id: "one", fileUrl: "https://public/old", storageKey: "private/key" }]);
    const result = await service.listSchoolDocuments("school-a", "teacher", 3, 25, "policy");
    expect(client.document.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 50, take: 25,
      where: expect.objectContaining({ schoolId: "school-a", entityType: "SCHOOL", entityId: "school-a", audience: "STAFF" }) }));
    expect(result.data[0]).toEqual({ id: "one", fileUrl: "/api/documents/one/download", storageReady: true });
  });
  it("uploads only validated bytes to private storage and commits metadata with audit", async () => {
    const { service, client, storage } = build();
    const result = await service.uploadSchoolDocument(school, actor, file, "Policy", "Current", "LEADERSHIP");
    expect(storage.upload).toHaveBeenCalledWith("school-a", expect.stringMatching(/^schools\/school-a\/files\/documents\//), file.buffer, "application/pdf");
    expect(client.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: "user-a", entityType: "document.upload" }) }));
    expect(result).not.toHaveProperty("storageKey");
    expect(result.audience).toBe("LEADERSHIP");
  });
  it("rejects invalid audience before uploading", async () => {
    const { service, storage } = build();
    await expect(service.uploadSchoolDocument(school, actor, file, "Policy", "", "PUBLIC")).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.upload).not.toHaveBeenCalled();
  });
  it("never uploads rejected or unscanned content", async () => {
    const { service, storage, validation } = build(); validation.document.mockRejectedValue(new BadRequestException());
    await expect(service.uploadSchoolDocument(school, actor, file, "Policy")).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.upload).not.toHaveBeenCalled();
  });
  it("denies another school's or leadership-only document before reading storage", async () => {
    const { service, client, storage } = build();
    await expect(service.download("school-a", "other", "teacher", actor)).rejects.toBeInstanceOf(NotFoundException);
    expect(client.document.findFirst).toHaveBeenCalledWith({ where: { id: "other", schoolId: "school-a", entityType: "SCHOOL", entityId: "school-a", audience: "STAFF" } });
    expect(storage.read).not.toHaveBeenCalled();
  });
  it("fails closed for unmigrated public documents", async () => {
    const { service, client, storage } = build(); client.document.findFirst.mockResolvedValue({ storageKey: null, fileUrl: "https://public/legacy" });
    await expect(service.download("school-a", "old", "owner", actor)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(storage.read).not.toHaveBeenCalled();
  });
  it("keeps cleanup work durable when database writes fail", async () => {
    const { service, client, cleanup } = build(); client.document.create.mockRejectedValue(new Error("Database write failed"));
    await expect(service.uploadSchoolDocument(school, actor, file, "Policy")).rejects.toThrow("Database write failed");
    expect(cleanup.enqueue).toHaveBeenCalledWith("school-a", expect.stringMatching(/^schools\/school-a\//));
  });
  it("commits deletion and cleanup enqueue in the same transaction", async () => {
    const { service, client, cleanup } = build(); client.document.findFirst.mockResolvedValue({ id: "one", storageKey: "schools/school-a/one" });
    await service.removeSchoolDocument(school, "one", actor);
    expect(cleanup.enqueue).toHaveBeenCalledWith("school-a", "schools/school-a/one", client);
    expect(client.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ entityType: "document.delete" }) }));
  });
});
