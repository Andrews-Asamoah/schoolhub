import { describe, expect, it, vi } from "vitest";
import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { SUBSCRIPTION_INACTIVE } from "@schoolhub/shared";
import { SchoolTenantGuard } from "./school-tenant.guard.js";
import { AllowInactiveSubscription } from "../decorators/allow-inactive-subscription.decorator.js";

const DAY = 86_400_000;

function setup(org: { subscriptionStatus: string; expiresAt: Date | null }, user: Record<string, unknown> = { id: "u1", role: "user" }) {
  const school = { id: "sch1", organizationId: "org1", subdomain: "achimota", name: "Achimota" };
  const prisma = {
    client: {
      school: {
        findUnique: vi.fn(async (args: { where: Record<string, string> }) =>
          args.where.subdomain || args.where.organizationId ? { ...school, organization: org } : null,
        ),
      },
      member: {
        findUnique: vi.fn(async () => ({ id: "m1", role: "admin", roles: [], banned: false })),
        count: vi.fn(async () => 1),
      },
      auditLog: { create: vi.fn(async (_args: { data: Record<string, unknown> }) => ({})) },
    },
  };
  const guard = new SchoolTenantGuard(prisma as never, new Reflector());
  const handler = () => undefined;
  const request: Record<string, any> = {
    session: { user },
    headers: { "x-school-subdomain": "achimota" },
    method: "GET",
    path: "/x",
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
  } as unknown as ExecutionContext;
  return { guard, context, request, prisma, handler };
}

describe("SchoolTenantGuard subscription enforcement", () => {
  it("allows an active school and exposes the school without subscription internals", async () => {
    const { guard, context, request } = setup({ subscriptionStatus: "ACTIVE", expiresAt: new Date(Date.now() + 30 * DAY) });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.school.id).toBe("sch1");
    expect(request.school.organization).toBeUndefined();
  });

  it.each([
    ["SUSPENDED", null],
    ["CANCELLED", null],
    ["ACTIVE", new Date(Date.now() - 30 * DAY)],
    ["TRIALING", new Date(Date.now() - 10 * DAY)],
  ])("blocks a %s school (expiry %s) with a machine-readable error", async (status, expiresAt) => {
    const { guard, context } = setup({ subscriptionStatus: status, expiresAt });
    const error = await guard.canActivate(context).catch((e) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({ error: SUBSCRIPTION_INACTIVE });
  });

  it("still lets a lapsed school through during the grace period", async () => {
    const { guard, context } = setup({ subscriptionStatus: "ACTIVE", expiresAt: new Date(Date.now() - 2 * DAY) });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("does not block a suspended school on handlers marked AllowInactiveSubscription", async () => {
    const { guard, context, handler } = setup({ subscriptionStatus: "SUSPENDED", expiresAt: null });
    AllowInactiveSubscription()(handler as never, "x" as never, { value: handler } as never);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("never blocks a platform super admin, and audits the access once per window", async () => {
    const { guard, context, prisma } = setup({ subscriptionStatus: "SUSPENDED", expiresAt: null }, { id: "sa1", role: "superAdmin" });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    await Promise.resolve();
    expect(prisma.client.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.client.auditLog.create.mock.calls[0]![0].data).toMatchObject({ action: "SCHOOL_ACCESSED", schoolId: "sch1" });
  });

  it("rejects a banned account before touching the database", async () => {
    const { guard, context, prisma } = setup({ subscriptionStatus: "ACTIVE", expiresAt: null }, { id: "u1", role: "user", banned: true });
    await expect(guard.canActivate(context)).rejects.toThrow(/suspended/);
    expect(prisma.client.school.findUnique).not.toHaveBeenCalled();
  });
});
