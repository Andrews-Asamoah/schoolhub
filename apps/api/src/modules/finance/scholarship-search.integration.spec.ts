import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { FinanceService } from "./finance.service.js";

vi.mock("../../env.js", () => ({ env: {} }));
const url = process.env.TEST_DATABASE_URL ?? "";
const enabled = (() => { try { return /test/i.test(new URL(url).pathname); } catch { return false; } })();

describe.skipIf(!enabled)("scholarship awards on PostgreSQL", { timeout: 60_000 }, () => {
  let db: PrismaClient;
  let service: FinanceService;
  let schoolId: string;
  let studentId: string;
  const actorId = randomUUID();

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = (await import("../../prisma/prisma.client.js")).prisma;
    const { FinanceService: Finance } = await import("./finance.service.js");
    service = new Finance({ client: db } as never, {} as never, {} as never);
    async function addSchool() {
      const slug = `scholarship-${randomUUID()}`;
      return db.school.create({ data: {
        name: slug, code: slug, subdomain: slug,
        organization: { create: { id: slug, slug, name: slug } },
      } });
    }
    const school = await addSchool();
    const otherSchool = await addSchool();
    schoolId = school.id;
    await db.user.create({ data: { id: actorId, name: "Accountant", email: `${actorId}@test.invalid` } });

    async function addStudent(tenantId: string, admissionNumber: string, status: "ACTIVE" | "GRADUATED", deletedAt?: Date) {
      const id = randomUUID();
      await db.user.create({ data: { id, name: "Ama Esi Mensah", email: `${id}@test.invalid` } });
      return db.student.create({ data: {
        school: { connect: { id: tenantId } }, studentId: id, admissionNumber, status, deletedAt,
        profile: { create: { userId: id, firstName: "Ama", otherNames: "Esi", lastName: "Mensah" } },
      } });
    }
    studentId = (await addStudent(schoolId, "ADM_0004", "ACTIVE")).id;
    await addStudent(schoolId, "ADM-0005", "GRADUATED");
    await addStudent(schoolId, "ADM-0006", "ACTIVE", new Date());
    await addStudent(otherSchool.id, "ADM_0004", "ACTIVE");
  });

  afterAll(async () => { await db?.$disconnect(); });

  it("matches full names and exact admission numbers without exposing other schools or inactive students", async () => {
    for (const query of ["ama mensah", "Mensah Esi Ama", "adm_0004", "0004", "_"]) {
      const result = await service.searchScholarshipStudents(schoolId, query);
      expect(result).toEqual({ hasMore: false, students: [{
        id: studentId, admissionNumber: "ADM_0004", studentId: expect.any(String),
        profile: { firstName: "Ama", otherNames: "Esi", lastName: "Mensah" },
      }] });
    }
    for (const query of ["%", "ADM__", "ADM-0005", "ADM-0006", ""]) {
      expect(await service.searchScholarshipStudents(schoolId, query)).toEqual({ students: [], hasMore: false });
    }
  });

  it("saves an award scoped to the selected term with no additional issue-date window", async () => {
    const year = await db.academicYear.create({ data: {
      schoolId, name: "2027/2028", startDate: new Date("2027-09-01"), endDate: new Date("2028-08-31"),
      terms: { create: { name: "Term 1", termNumber: 1, startDate: new Date("2027-09-01"), endDate: new Date("2027-12-15") } },
    }, include: { terms: true } });
    const term = year.terms[0]!;
    const award = await service.createStudentScholarship(schoolId, actorId, {
      studentId, name: "Academic award", valueType: "PERCENTAGE", value: 20, academicYearId: year.id, termId: term.id,
    });
    expect(award).toMatchObject({ studentId, academicYearId: year.id, termId: term.id, startDate: null, endDate: null });
  });
});
