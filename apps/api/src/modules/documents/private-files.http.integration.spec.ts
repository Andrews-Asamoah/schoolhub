/** Real controller + tenant/role guards + PostgreSQL; object storage is a bounded fake. */
import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("../../env.js", () => ({ env: { NODE_ENV: "test" } }));
import { DocumentsController } from "./documents.controller.js";
import { DocumentsService } from "./documents.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { PrivateStorageService } from "../storage/private-storage.service.js";
import { UploadValidationService } from "../storage/upload-validation.service.js";
import { StorageCleanupService } from "../storage/storage-cleanup.service.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";

const url = process.env.TEST_DATABASE_URL ?? "";
const enabled = (() => { try { return /test/i.test(new URL(url).pathname); } catch { return false; } })();
describe.skipIf(!enabled)("private file HTTP authorization (PostgreSQL)", () => {
  const run = `files-${Date.now()}`;
  const roles = ["owner", "admin", "headteacher", "teacher", "accountant", "staff", "guardian", "student"];
  let db: PrismaClient;
  let app: INestApplication;
  let schoolId = "";
  let staffDocument = "";
  let leaderDocument = "";
  let otherDocument = "";
  const read = vi.fn().mockResolvedValue(Buffer.from("%PDF-1.7\nprivate content"));

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = (await import("../../prisma/prisma.client.js")).prisma;
    for (const suffix of ["a", "b"]) {
      await db.organization.create({ data: { id: `${run}-${suffix}`, name: run, slug: `${run}-${suffix}`, subscriptionStatus: "ACTIVE" } });
      const school = await db.school.create({ data: { organizationId: `${run}-${suffix}`, code: `${run}-${suffix}`, name: run, subdomain: `${run}-${suffix}` } });
      if (suffix === "a") schoolId = school.id;
      for (const audience of ["STAFF", "LEADERSHIP"]) {
        const document = await db.document.create({ data: { schoolId: school.id, title: "Private policy", audience,
          entityType: "SCHOOL", entityId: school.id, fileType: "application/pdf", fileSize: 20,
          fileUrl: "unused", storageKey: `schools/${school.id}/${audience}.pdf` } });
        if (suffix === "a" && audience === "STAFF") staffDocument = document.id;
        if (suffix === "a" && audience === "LEADERSHIP") leaderDocument = document.id;
        if (suffix === "b") otherDocument = document.id;
      }
    }
    for (const role of roles) {
      const id = `${run}-${role}`;
      await db.user.create({ data: { id, name: role, email: `${id}@test.invalid`, twoFactorEnabled: true } });
      await db.member.create({ data: { id, userId: id, organizationId: `${run}-a`, role } });
    }
    const module = await Test.createTestingModule({ controllers: [DocumentsController], providers: [DocumentsService, RolesGuard, SchoolTenantGuard,
      { provide: PrismaService, useValue: { client: db } }, { provide: PrivateStorageService, useValue: { read } },
      { provide: UploadValidationService, useValue: {} }, { provide: StorageCleanupService, useValue: {} }] }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix("api"); app.useLogger(false);
    // Authentication is isolated here; real Better Auth sign-in has its own database E2E.
    app.use(async (req: any, _res: unknown, next: () => void) => {
      const role = req.headers["x-test-role"];
      if (typeof role === "string") req.session = { user: await db.user.findUnique({ where: { id: `${run}-${role}` } }), session: { activeOrganizationId: `${run}-a` } };
      next();
    });
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    if (db) {
      await db.organization.deleteMany({ where: { id: { startsWith: run } } });
      await db.user.deleteMany({ where: { id: { startsWith: run } } });
      await db.$disconnect();
    }
  });

  it.each(roles)("enforces the staff and leadership audiences for %s", async role => {
    const staffStatus = ["guardian", "student"].includes(role) ? 403 : 200;
    const leaderStatus = ["owner", "admin", "headteacher"].includes(role) ? 200 : ["guardian", "student"].includes(role) ? 403 : 404;
    await request(app.getHttpServer()).get(`/api/documents/${staffDocument}/download`).set("x-test-role", role).expect(staffStatus);
    await request(app.getHttpServer()).get(`/api/documents/${leaderDocument}/download`).set("x-test-role", role).expect(leaderStatus);
  });
  it("denies copied cross-school links and unauthenticated downloads", async () => {
    await request(app.getHttpServer()).get(`/api/documents/${otherDocument}/download`).set("x-test-role", "owner").expect(404);
    await request(app.getHttpServer()).get(`/api/documents/${staffDocument}/download`).expect(401);
  });
  it("sets private response headers and writes a download audit", async () => {
    const response = await request(app.getHttpServer()).get(`/api/documents/${staffDocument}/download`).set("x-test-role", "teacher").expect(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(await db.auditLog.count({ where: { schoolId, entityType: "document.download", userId: `${run}-teacher` } })).toBeGreaterThan(0);
  });
  it("pages beyond the old document list without leaking other schools", async () => {
    await db.document.createMany({ data: Array.from({ length: 30 }, (_, index) => ({ id: `${run}-page-${index}`, schoolId, title: `Policy ${index}`,
      entityType: "SCHOOL" as const, entityId: schoolId, fileType: "application/pdf", fileSize: 20, fileUrl: "legacy", storageKey: `schools/${schoolId}/page-${index}.pdf` })) });
    const result = await request(app.getHttpServer()).get("/api/documents?page=2&limit=25").set("x-test-role", "owner").expect(200);
    expect(result.body.meta.total).toBe(32); expect(result.body.data).toHaveLength(7);
    expect(result.body.data.every((doc: { schoolId: string; storageKey?: string }) => doc.schoolId === schoolId && !doc.storageKey)).toBe(true);
  });
  it("revokes download access immediately when school membership is suspended", async () => {
    await db.member.update({ where: { id: `${run}-teacher` }, data: { banned: true } });
    await request(app.getHttpServer()).get(`/api/documents/${staffDocument}/download`).set("x-test-role", "teacher").expect(403);
  });
});
