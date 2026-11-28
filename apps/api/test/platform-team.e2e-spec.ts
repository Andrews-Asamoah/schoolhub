import { randomUUID } from "node:crypto";
import type { ExecutionContext } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PLATFORM_STAFF_ROLE } from "@schoolhub/shared";
import { PlatformStaffGuard } from "../src/common/guards/platform-staff.guard.js";
import { SuperAdminGuard } from "../src/common/guards/super-admin.guard.js";
import type { PlatformTeamService } from "../src/modules/super-admin/platform-team.service.js";
import type { SuperAdminService } from "../src/modules/super-admin/super-admin.service.js";

const database = process.env.TEST_DATABASE_URL;
const suffix = randomUUID().slice(0, 8);
const actor = { id: randomUUID(), ipAddress: null, userAgent: null };

function context(role: string, fields: { twoFactorEnabled?: boolean; client?: string } = {}) {
  return { switchToHttp: () => ({
    getRequest: () => ({
      session: { user: { role, twoFactorEnabled: fields.twoFactorEnabled ?? true } },
      headers: { "x-schoolhub-client": fields.client },
    }),
  }) } as ExecutionContext;
}

it("gates platform staff by role, web client and two-factor authentication", () => {
  const guard = new PlatformStaffGuard();
  expect(guard.canActivate(context(PLATFORM_STAFF_ROLE))).toBe(true);
  expect(() => guard.canActivate(context(PLATFORM_STAFF_ROLE, { twoFactorEnabled: false }))).toThrow();
  expect(() => guard.canActivate(context(PLATFORM_STAFF_ROLE, { client: "desktop" }))).toThrow();
  expect(() => guard.canActivate(context("user"))).toThrow();
  expect(() => new SuperAdminGuard().canActivate(context(PLATFORM_STAFF_ROLE))).toThrow();
});

describe.skipIf(!database)("platform team school assignments", () => {
  let prisma: PrismaClient;
  let service: PlatformTeamService;
  let superAdmin: SuperAdminService;
  let employee: string;
  let temporaryPassword: string;
  let supportSchool: string;
  let desktopSchool: string;
  let otherSchool: string;
  const organizations: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = database!;
    process.env.BETTER_AUTH_SECRET ??= "platform-team-e2e-only-test-secret-1234";
    process.env.BETTER_AUTH_URL ??= "http://localhost:3001";
    process.env.WEB_ORIGIN ??= "http://localhost:5173";
    const { prisma: db } = await import("../src/prisma/prisma.client.js");
    const { CredentialsService } = await import("../src/modules/accounts/credentials.service.js");
    const { PlatformTeamService } = await import("../src/modules/super-admin/platform-team.service.js");
    const { SuperAdminService } = await import("../src/modules/super-admin/super-admin.service.js");
    prisma = db;
    const credentials = new CredentialsService();
    service = new PlatformTeamService({ client: db } as never, credentials);
    superAdmin = new SuperAdminService({ client: db } as never, credentials);
    await prisma.user.create({ data: { id: actor.id, name: "Synthetic root", email: `root-${suffix}@test.invalid`, role: "superAdmin" } });
    const created = await service.invite({ name: `Platform ${suffix}`, email: `employee-${suffix}@test.invalid` }, actor);
    temporaryPassword = created.credentials.temporaryPassword;
    employee = (await prisma.user.findUniqueOrThrow({ where: { email: created.credentials.loginEmail } })).id;
    const schools = [];
    for (const name of ["support", "desktop", "other"]) {
      const subdomain = `${name}-${suffix}`;
      const org = await prisma.organization.create({ data: { id: randomUUID(), slug: subdomain, name, subscriptionStatus: "ACTIVE" } });
      organizations.push(org.id);
      schools.push(await prisma.school.create({ data: { name, code: subdomain.toUpperCase(), subdomain, organizationId: org.id } }));
    }
    [supportSchool, desktopSchool, otherSchool] = schools.map(({ id }) => id);
    for (const school of schools) await prisma.subscription.create({ data: { schoolId: school.id, settings: { keep: true } } });
    await prisma.user.create({ data: { id: `tenant-${suffix}`, name: `Tenant ${suffix}`, email: `tenant-${suffix}@test.invalid`,
      members: { create: { id: randomUUID(), organizationId: organizations[0], role: "headteacher" } } } });
  }, 30000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.auditLog.deleteMany({ where: { userId: { in: [actor.id, ...(employee ? [employee] : [])] } } });
    await prisma.organization.deleteMany({ where: { id: { in: organizations } } });
    await prisma.user.deleteMany({ where: { id: { in: [actor.id, `tenant-${suffix}`, ...(employee ? [employee] : [])] } } });
    await prisma.$disconnect();
  });

  it("signs a platform employee into the web with the restricted global role", async () => {
    const { createAuth } = await import("../src/auth/auth.factory.js");
    const auth = createAuth(prisma);
    const signIn = (desktop = false) => auth.handler(new Request("http://localhost:3001/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(desktop ? { "x-schoolhub-client": "desktop", "x-schoolhub-client-version": "0.1.0" } : {}),
      },
      body: JSON.stringify({ email: `employee-${suffix}@test.invalid`, password: temporaryPassword }),
    }));
    const web = await signIn();
    expect(web.status).toBe(200);
    expect(await web.json()).toMatchObject({ user: { role: PLATFORM_STAFF_ROLE, mustChangePassword: true } });
    expect((await signIn(true)).status).toBe(403);
  });

  it("lists only platform employees and resolves a school by its public address", async () => {
    expect((await superAdmin.listUsers({ page: 1, limit: 20, q: suffix })).data.map(({ id }) => id)).toEqual([employee]);
    const school = await superAdmin.getSchool(`support-${suffix}`, true);
    expect(school.id).toBe(supportSchool);
    expect(school.userCounts).toEqual({ total: 1, headteachers: 1 });
    expect((await superAdmin.getSchool(supportSchool)).id).toBe(supportSchool);
  });

  it("limits staff operations to their exact grant and stops a revoked user", async () => {
    await service.setSchoolRole(employee, supportSchool, "SUPPORT", actor);
    await service.setSchoolRole(employee, desktopSchool, "DESKTOP_ACCESS", actor);
    const employeeActor = { ...actor, id: employee };
    expect((await service.assignedSchools(employee)).map(({ id }) => id).sort()).toEqual([supportSchool, desktopSchool].sort());
    await expect(service.setDesktopAccess(supportSchool, true, employeeActor)).rejects.toThrow("You cannot manage");
    await expect(service.setDesktopAccess(otherSchool, true, employeeActor)).rejects.toThrow("You cannot manage");
    await service.setDesktopAccess(desktopSchool, true, employeeActor);
    const subscription = await prisma.subscription.findUniqueOrThrow({ where: { schoolId: desktopSchool } });
    expect(subscription.settings).toEqual({ keep: true, desktopEnabled: true });
    await service.setSchoolRole(employee, desktopSchool, null, actor);
    await expect(service.setDesktopAccess(desktopSchool, false, employeeActor)).rejects.toThrow("You cannot manage");
    await service.setSuspended(employee, true, actor);
    expect(await service.assignedSchools(employee)).toEqual([]);
  });
});
