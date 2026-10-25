/**
 * Database-backed tests for the guardian fee statement endpoint's service.
 * Runs only against TEST_DATABASE_URL with a database name containing "test".
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { StudentsService as StudentsServiceType } from "./students.service.js";

const url = process.env.TEST_DATABASE_URL ?? "";
const dbName = (() => {
  try {
    return new URL(url).pathname.replace("/", "");
  } catch {
    return "";
  }
})();
const enabled = url !== "" && /test/i.test(dbName);

describe.skipIf(!enabled)("guardian ward fee statements (database)", { timeout: 60_000 }, () => {
  let prisma: PrismaClient;
  let service: StudentsServiceType;
  const run = `gs${Date.now().toString(36)}`;
  let schoolId = "";
  let organizationId = "";
  let yearId = "";
  let termId = "";
  let guardianUserId = "";
  let wardUserId = "";
  let guardianProfileId = "";
  let guardianId = "";
  let wardId = "";
  let unrelatedStudentId = "";
  let foreignSchoolId = "";
  let foreignOrganizationId = "";
  const userIds: string[] = [];
  const profileIds: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    const { prisma: client } = await import("../../prisma/prisma.client.js");
    const { StudentsService } = await import("./students.service.js");
    prisma = client;
    service = new StudentsService({ client } as never, {} as never);

    const org = await prisma.organization.create({
      data: { id: `${run}-org`, name: `Guardian Test ${run}`, slug: `${run}-org` },
    });
    organizationId = org.id;
    const school = await prisma.school.create({
      data: { organizationId, name: `Guardian Test School ${run}`, code: run.toUpperCase(), subdomain: run },
    });
    schoolId = school.id;

    const year = await prisma.academicYear.create({
      data: {
        schoolId,
        name: `${run} year`,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
        isCurrent: true,
      },
    });
    yearId = year.id;
    const term = await prisma.term.create({
      data: {
        academicYearId: yearId,
        name: "Term 1",
        termNumber: 1,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-04-30"),
        isCurrent: true,
      },
    });
    termId = term.id;

    const guardianUser = await prisma.user.create({
      data: { id: `${run}-guardian-user`, name: "Test Guardian", email: `${run}-guardian@example.test` },
    });
    guardianUserId = guardianUser.id;
    userIds.push(guardianUser.id);
    const guardianProfile = await prisma.userProfile.create({
      data: { userId: guardianUser.id, firstName: "Test", lastName: "Guardian" },
    });
    guardianProfileId = guardianProfile.id;
    profileIds.push(guardianProfile.id);
    const guardian = await prisma.guardian.create({
      data: {
        schoolId,
        profileId: guardianProfile.id,
        guardianId: `${run}-G1`,
        firstName: "Test",
        lastName: "Guardian",
        phone: "0000000000",
        relationshipType: "GUARDIAN",
        isActive: true,
      },
    });
    guardianId = guardian.id;

    const wardUser = await prisma.user.create({
      data: { id: `${run}-ward-user`, name: "Linked Ward", email: `${run}-ward@example.test` },
    });
    userIds.push(wardUser.id);
    wardUserId = wardUser.id;
    const wardProfile = await prisma.userProfile.create({
      data: { userId: wardUser.id, firstName: "Linked", lastName: "Ward" },
    });
    profileIds.push(wardProfile.id);
    const ward = await prisma.student.create({
      data: { schoolId, profileId: wardProfile.id, studentId: `${run}-ward`, admissionNumber: `${run}-A1` },
    });
    wardId = ward.id;
    await prisma.guardianStudent.create({ data: { guardianId, studentId: wardId, isPrimary: true } });
    await prisma.bill.create({
      data: {
        schoolId,
        studentId: wardId,
        academicYearId: yearId,
        termId,
        billNumber: `INV-${run}-WARD`,
        totalAmount: "100.00",
        grossAmount: "100.00",
        paidAmount: "0.00",
        balanceAmount: "100.00",
        status: "PENDING",
        issuedAt: new Date("2026-02-01T00:00:00.000Z"),
      },
    });

    const unrelatedUser = await prisma.user.create({
      data: { id: `${run}-unrelated-user`, name: "Unrelated Student", email: `${run}-unrelated@example.test` },
    });
    userIds.push(unrelatedUser.id);
    const unrelatedProfile = await prisma.userProfile.create({
      data: { userId: unrelatedUser.id, firstName: "Unrelated", lastName: "Student" },
    });
    profileIds.push(unrelatedProfile.id);
    const unrelated = await prisma.student.create({
      data: { schoolId, profileId: unrelatedProfile.id, studentId: `${run}-unrelated` },
    });
    unrelatedStudentId = unrelated.id;

    const foreignOrg = await prisma.organization.create({
      data: { id: `${run}-foreign-org`, name: `Foreign ${run}`, slug: `${run}-foreign-org` },
    });
    foreignOrganizationId = foreignOrg.id;
    const foreignSchool = await prisma.school.create({
      data: {
        organizationId: foreignOrg.id,
        name: `Foreign School ${run}`,
        code: `F-${run}`,
        subdomain: `f-${run}`,
      },
    });
    foreignSchoolId = foreignSchool.id;
    const foreignUser = await prisma.user.create({
      data: { id: `${run}-foreign-user`, name: "Foreign Student", email: `${run}-foreign@example.test` },
    });
    userIds.push(foreignUser.id);
    const foreignProfile = await prisma.userProfile.create({
      data: { userId: foreignUser.id, firstName: "Foreign", lastName: "Student" },
    });
    profileIds.push(foreignProfile.id);
    const foreignStudent = await prisma.student.create({
      data: { schoolId: foreignSchoolId, profileId: foreignProfile.id, studentId: `${run}-foreign` },
    });
    await prisma.bill.create({
      data: {
        schoolId: foreignSchoolId,
        studentId: foreignStudent.id,
        academicYearId: (await prisma.academicYear.create({
          data: {
            schoolId: foreignSchoolId,
            name: "Foreign year",
            startDate: new Date("2026-01-01"),
            endDate: new Date("2026-12-31"),
            isCurrent: true,
          },
        })).id,
        billNumber: `INV-${run}-FOREIGN`,
        totalAmount: "999.00",
        grossAmount: "999.00",
        paidAmount: "0.00",
        balanceAmount: "999.00",
        status: "PENDING",
      },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    const quiet = (promise: Promise<unknown>) => promise.catch(() => undefined);
    if (schoolId) {
      await quiet(prisma.auditLog.deleteMany({ where: { schoolId } }));
      await quiet(prisma.billArrearsSnapshot.deleteMany({ where: { schoolId } }));
      await quiet(prisma.bill.deleteMany({ where: { schoolId } }));
      await quiet(prisma.guardianStudent.deleteMany({ where: { guardianId } }));
      await quiet(prisma.student.deleteMany({ where: { schoolId } }));
      await quiet(prisma.guardian.deleteMany({ where: { schoolId } }));
      await quiet(prisma.academicYear.deleteMany({ where: { schoolId } }));
      await quiet(prisma.school.deleteMany({ where: { id: schoolId } }));
    }
    if (foreignSchoolId) {
      await quiet(prisma.billArrearsSnapshot.deleteMany({ where: { schoolId: foreignSchoolId } }));
      await quiet(prisma.bill.deleteMany({ where: { schoolId: foreignSchoolId } }));
      await quiet(prisma.student.deleteMany({ where: { schoolId: foreignSchoolId } }));
      await quiet(prisma.academicYear.deleteMany({ where: { schoolId: foreignSchoolId } }));
      await quiet(prisma.school.deleteMany({ where: { id: foreignSchoolId } }));
    }
    if (foreignOrganizationId) await quiet(prisma.organization.deleteMany({ where: { id: foreignOrganizationId } }));
    if (organizationId) await quiet(prisma.organization.deleteMany({ where: { id: organizationId } }));
    if (profileIds.length) await quiet(prisma.userProfile.deleteMany({ where: { id: { in: profileIds } } }));
    if (userIds.length) await quiet(prisma.user.deleteMany({ where: { id: { in: userIds } } }));
    await prisma.$disconnect();
  });

  it("allows a linked guardian to read their ward's statement", async () => {
    const statement = await service.getMyWardFeeStatement(schoolId, guardianUserId, wardId, { scope: "term" });
    expect(statement.student.id).toBe(wardId);
    expect(statement.entries).toHaveLength(1);
    expect(statement.entries[0]?.reference).toBe(`INV-${run}-WARD`);
    expect(statement.closingBalance).toBe(100);
  });

  it("enforces the school's previous-term arrears clearance policy", async () => {
    const previousYear = await prisma.academicYear.create({
      data: {
        schoolId,
        name: "Prior year arrears",
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-12-31"),
        isCurrent: false,
      },
    });
    await prisma.bill.create({
      data: {
        schoolId,
        studentId: wardId,
        academicYearId: previousYear.id,
        billNumber: `INV-${run}-PRIOR`,
        totalAmount: "250.00",
        grossAmount: "250.00",
        paidAmount: "0.00",
        balanceAmount: "250.00",
        status: "PENDING",
        issuedAt: new Date("2025-08-01T00:00:00.000Z"),
      },
    });
    await prisma.school.update({ where: { id: schoolId }, data: { arrearsPolicy: "BLOCK_CLEARANCE_UNTIL_PAID" } });
    const blocked = await service.getMyFeeStatus(schoolId, wardUserId);
    expect(blocked.status).toBe("BLOCKED_BY_ARREARS");
    expect(blocked.clearanceAllowed).toBe(false);

    await prisma.school.update({ where: { id: schoolId }, data: { arrearsPolicy: "SHOW_ONLY" } });
    const shown = await service.getMyFeeStatus(schoolId, wardUserId);
    expect(shown.status).not.toBe("BLOCKED_BY_ARREARS");
    expect(shown.arrearsPolicy).toBe("SHOW_ONLY");
  });

  it("denies another family member's student and a student from another tenant", async () => {
    await expect(
      service.getMyWardFeeStatement(schoolId, guardianUserId, unrelatedStudentId, { scope: "all" }),
    ).rejects.toThrow(/student not found/i);

    const foreignStudent = await prisma.student.findFirstOrThrow({
      where: { schoolId: foreignSchoolId, profile: { user: { email: `${run}-foreign@example.test` } } },
      select: { id: true },
    });
    await expect(
      service.getMyWardFeeStatement(schoolId, guardianUserId, foreignStudent.id, { scope: "all" }),
    ).rejects.toThrow(/student not found/i);
  });
});
