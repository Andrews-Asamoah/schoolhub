import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { MOCK_COMPONENT_DEFAULT, saveAssessmentTemplateSchema } from "@schoolhub/shared";
import type { AssessmentSetupService } from "./assessment-setup.service.js";

const url = process.env.TEST_DATABASE_URL ?? "";
const enabled = (() => { try { return /test/i.test(new URL(url).pathname); } catch { return false; } })();

describe.skipIf(!enabled)("mock assessments: PostgreSQL naming, years and isolation", { timeout: 90000 }, () => {
  let db: PrismaClient, setup: AssessmentSetupService;
  const tag = "mc" + Date.now().toString(36);
  let schoolId = "", year1 = "", year2 = "", gradingSystemId = "", classId = "";
  const actor = tag + "user";

  const input = (over: Record<string, unknown>) => saveAssessmentTemplateSchema.parse({
    name: "Mock 1", category: "MOCK", academicYearId: year1, sequence: 1, gradingSystemId,
    classIds: [classId], isActive: true, isLocked: false, components: [{ ...MOCK_COMPONENT_DEFAULT }], ...over,
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    const { prisma } = await import("../../prisma/prisma.client.js");
    db = prisma;
    const { AssessmentSetupService } = await import("./assessment-setup.service.js");
    setup = new AssessmentSetupService({ client: db } as never);
    await db.organization.create({ data: { id: tag + "org", name: "Synthetic", slug: tag + "org" } });
    schoolId = (await db.school.create({ data: { organizationId: tag + "org", name: "Synthetic Mock School", code: (tag + "A").toUpperCase(), subdomain: tag + "a" } })).id;
    await db.user.create({ data: { id: actor, name: actor, email: actor + "@example.test" } });
    year1 = (await db.academicYear.create({ data: { schoolId, name: "2025/26", startDate: new Date("2025-09-01"), endDate: new Date("2026-07-31") } })).id;
    year2 = (await db.academicYear.create({ data: { schoolId, name: "2026/27", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-31"), isCurrent: true } })).id;
    classId = (await db.class.create({ data: { schoolId, academicYearId: year2, name: "JHS 3", level: "JHS3" } })).id;
    gradingSystemId = (await db.gradingSystem.create({ data: { schoolId, name: "BECE Stanine", code: tag + "S", method: "CLASS_RANK" } })).id;
    await db.gradeScale.create({ data: { gradingSystemId, grade: "1", description: "Highest", minScore: 0, maxScore: 100, gradePoint: 1, displayOrder: 1 } });
  });
  afterAll(async () => {
    await db.assessmentTemplate.deleteMany({ where: { schoolId } });
    await db.$disconnect();
  });

  it("allows Mock 1 once in every academic year but not twice in one", async () => {
    await setup.createTemplate(schoolId, actor, input({}));
    await setup.createTemplate(schoolId, actor, input({ academicYearId: year2 }));
    await expect(setup.createTemplate(schoolId, actor, input({ name: "mock 1" }))).rejects.toThrow(/already has a mock/i);
    const rows = await db.assessmentTemplate.findMany({ where: { schoolId, category: "MOCK" }, include: { components: true } });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.components.map((c) => c.componentType)).toEqual(["MOCK_EXAM"]);
  });

  it("keeps mock names and termly names in separate namespaces", async () => {
    await setup.createTemplate(schoolId, actor, saveAssessmentTemplateSchema.parse({
      name: "Mock 1", category: "TERMLY", gradingSystemId, classIds: [], isActive: true, isLocked: false,
      components: [{ ...MOCK_COMPONENT_DEFAULT, name: "Exam", componentType: "FINAL_EXAM" }],
    }));
    await expect(setup.createTemplate(schoolId, actor, saveAssessmentTemplateSchema.parse({
      name: "mock 1", category: "TERMLY", gradingSystemId, classIds: [], isActive: true, isLocked: false,
      components: [{ ...MOCK_COMPONENT_DEFAULT, name: "Exam", componentType: "FINAL_EXAM" }],
    }))).rejects.toThrow(/already exists/i);
  });

  it("never lets a mock count as termly coverage", async () => {
    const result = await setup.getSetup(schoolId);
    const mock = result.templates.find((t) => t.category === "MOCK" && t.academicYearId === year1)!;
    expect(mock.sequence).toBe(1);
    expect(result.years.map((y) => y.name)).toEqual(["2026/27", "2025/26"]);
  });

  it("does not let an assessment switch between termly and mock", async () => {
    const mock = await db.assessmentTemplate.findFirstOrThrow({ where: { schoolId, category: "MOCK", academicYearId: year1 } });
    await expect(setup.updateTemplate(schoolId, actor, mock.id, input({ category: "TERMLY", academicYearId: undefined, name: "Mock 1" }))).rejects.toThrow(/can't change between termly and mock|already exists/i);
  });

  it("rejects an academic year from another school", async () => {
    await expect(setup.createTemplate(schoolId, actor, input({ name: "Mock 9", academicYearId: "not-this-school" }))).rejects.toThrow(/belongs to this school/i);
  });
});
