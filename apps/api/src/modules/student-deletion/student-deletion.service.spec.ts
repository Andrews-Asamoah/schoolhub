import { describe, expect, it, vi } from "vitest";

vi.mock("../../env.js", () => ({ env: { NODE_ENV: "test" } }));
vi.mock("../../prisma/prisma.service.js", () => ({ PrismaService: class {} }));
vi.mock("../storage/r2.service.js", () => ({ R2Service: class {} }));
vi.mock("../storage/storage-cleanup.service.js", () => ({ StorageCleanupService: class {} }));
vi.mock("@prisma/client", () => ({ Prisma: {}, PrismaClient: class {} }));

import { ConflictException } from "@nestjs/common";
import { StudentDeletionService } from "./student-deletion.service.js";

const actor = { id: "sa", ipAddress: null, userAgent: null };
const reviewer = { id: "sa", name: "Super Admin" };

interface Setup {
  counts?: Record<string, number>;
  billAdjustments?: number;
  guardians?: Array<{ id: string; linked: number; userId: string | null; roles?: string[] }>;
  requestStatus?: string;
  studentExists?: boolean;
}

function build(setup: Setup = {}) {
  const calls: string[] = [];
  const log = (name: string) => vi.fn(async () => { calls.push(name); return { count: 1 }; });
  const counts = { bills: 0, payments: 0, internalExamCandidates: 0, externalExamCandidates: 0, internalMockReports: 0, enrollments: 2, attendances: 5, guardians: 1, ...setup.counts };
  const request = { id: "r1", schoolId: "sch", studentId: "stu", reason: "Created by mistake", requestedByName: "Admin", status: setup.requestStatus ?? "PENDING" };
  const guardians = setup.guardians ?? [{ id: "g1", linked: 1, userId: "gu1" }];
  const tx: any = {
    $executeRaw: vi.fn(async () => 0),
    student: {
      findFirst: vi.fn(async () => setup.studentExists === false ? null : ({
        admissionNumber: "WIS20260001", status: "ACTIVE",
        profile: { firstName: "Ama", lastName: "Mensah", userId: "su1", user: { image: null, role: "user" } },
        class: { name: "JHS 1" }, _count: counts,
      })),
      delete: log("student.delete"),
    },
    financeBillAdjustment: { count: vi.fn(async () => setup.billAdjustments ?? 0) },
    financeStudentCreditEntry: { count: vi.fn(async () => 0) },
    member: { findMany: vi.fn(async ({ where }: any) => [{ role: where.userId === "su1" ? "student" : "guardian" }]) },
    guardian: {
      findMany: vi.fn(async () => guardians.map((g) => ({
        id: g.id, firstName: g.id, lastName: "P", _count: { students: g.linked },
        profile: g.userId ? { userId: g.userId, user: { image: null, role: "user" }, student: null, teacher: null, staff: null } : null,
      }))),
      deleteMany: log("guardian.deleteMany"),
    },
    studentDeletionRequest: {
      updateMany: vi.fn(async ({ data }: any) => { calls.push(`request.${data.status}`); return { count: request.status === "PENDING" ? 1 : 0 }; }),
      update: log("request.result"),
    },
    notificationDelivery: { deleteMany: log("notificationDelivery.deleteMany") },
    notificationPreference: { deleteMany: log("notificationPreference.deleteMany") },
    passwordRecoveryRequest: { deleteMany: log("passwordRecovery.deleteMany") },
    feeReminderLog: { deleteMany: log("feeReminderLog.deleteMany") },
    user: { deleteMany: vi.fn(async ({ where }: any) => { calls.push(`user.deleteMany:${where.id.in.join(",")}`); return { count: 1 }; }) },
    document: { findMany: vi.fn(async () => []) },
    attendanceExcuseRequest: { findMany: vi.fn(async () => []) },
    auditLog: { create: log("audit") },
    backgroundJob: { upsert: vi.fn(), updateMany: vi.fn() },
  };
  const prisma: any = {
    client: {
      $transaction: vi.fn(async (fn: any) => fn(tx)),
      studentDeletionRequest: { findUnique: vi.fn(async () => request) },
    },
  };
  const r2: any = { keys: { schoolPrefix: () => "schools/sch/" }, keyFromUrl: () => null, delete: vi.fn() };
  const cleanup: any = { enqueue: vi.fn() };
  return { service: new StudentDeletionService(prisma, r2, cleanup), calls, tx };
}

describe("approve", () => {
  it("deletes the student first, then the parent-only guardian and both logins", async () => {
    const { service, calls } = build();
    const result = await service.approve("r1", reviewer, actor);
    expect(result.success).toBe(true);
    expect(calls.indexOf("student.delete")).toBeGreaterThan(calls.indexOf("request.APPROVED"));
    expect(calls).toContain("user.deleteMany:su1,gu1");
    expect(calls.indexOf("user.deleteMany:su1,gu1")).toBeGreaterThan(calls.indexOf("student.delete"));
    expect(calls).toContain("audit");
  });

  it("keeps a parent who also has another child at the school", async () => {
    const { service, calls } = build({ guardians: [{ id: "g1", linked: 2, userId: "gu1" }] });
    await service.approve("r1", reviewer, actor);
    expect(calls).toContain("user.deleteMany:su1");
    expect(calls.join()).not.toContain("gu1");
  });

  it("refuses when money has been recorded, and deletes nothing", async () => {
    const { service, calls } = build({ counts: { payments: 2 } });
    await expect(service.approve("r1", reviewer, actor)).rejects.toThrow(/2 payments/);
    expect(calls).not.toContain("student.delete");
    expect(calls.some((call) => call.startsWith("user.deleteMany"))).toBe(false);
  });

  it("refuses when a fee adjustment (no foreign key) exists", async () => {
    const { service, calls } = build({ billAdjustments: 1 });
    await expect(service.approve("r1", reviewer, actor)).rejects.toThrow(/fee bill adjustments/);
    expect(calls).not.toContain("student.delete");
  });

  it("does nothing when the request was already handled", async () => {
    const { service, calls } = build({ requestStatus: "APPROVED" });
    await expect(service.approve("r1", reviewer, actor)).rejects.toBeInstanceOf(ConflictException);
    expect(calls).not.toContain("student.delete");
  });

  it("closes the request when the student is already gone", async () => {
    const { service, calls } = build({ studentExists: false });
    const result = await service.approve("r1", reviewer, actor);
    expect(result.summary).toEqual({ alreadyRemoved: true });
    expect(calls).not.toContain("student.delete");
  });
});
