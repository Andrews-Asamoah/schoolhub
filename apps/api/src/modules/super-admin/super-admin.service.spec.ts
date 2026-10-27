import { describe, expect, it, vi } from "vitest";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { SUBSCRIPTION_TRIAL_DAYS } from "@schoolhub/shared";
import { CredentialsService, DEFAULT_PASSWORDS } from "../accounts/credentials.service.js";
import { SuperAdminService } from "./super-admin.service.js";

const actor = { id: "sa1", ipAddress: "10.0.0.1", userAgent: "vitest" };
const DAY = 86_400_000;

function makeService(overrides: Record<string, any> = {}) {
  const client: Record<string, any> = {
    school: { findUnique: vi.fn(), findFirst: vi.fn(async () => null), update: vi.fn(), create: vi.fn(async (a: any) => ({ id: "sch1", ...a.data })), count: vi.fn() },
    organization: { update: vi.fn(), create: vi.fn() },
    subscription: { upsert: vi.fn(), create: vi.fn() },
    user: { findUnique: vi.fn(async () => null), create: vi.fn(async (a: any) => ({ ...a.data })) },
    account: { create: vi.fn() },
    member: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    session: { deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
    ...overrides,
  };
  client.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(client));
  const service = new SuperAdminService({ client } as never, new CredentialsService());
  return { service, client };
}

const org = (status: string, expiresAt: Date | null) => ({ id: "org1", subscriptionStatus: status, expiresAt });

describe("updateSubscription", () => {
  const school = (status = "TRIALING", expiresAt: Date | null = new Date(Date.now() + 5 * DAY)) => ({ id: "sch1", organizationId: "org1", organization: org(status, expiresAt) });

  it("updates access and billing records together and writes an audit entry with old and new values", async () => {
    const { service, client } = makeService();
    client.school.findUnique.mockResolvedValue(school());
    vi.spyOn(service, "getSchool").mockResolvedValue({} as never);

    await service.updateSubscription("sch1", { status: "ACTIVE", expiresAt: "2099-12-31", note: "Paid term 1" }, actor);

    expect(client.organization.update.mock.calls[0]![0].data).toMatchObject({ subscriptionStatus: "ACTIVE" });
    expect((client.organization.update.mock.calls[0]![0].data.expiresAt as Date).toISOString()).toBe("2099-12-31T23:59:59.999Z");
    expect(client.subscription.upsert.mock.calls[0]![0].update).toMatchObject({ status: "ACTIVE", isOnTrial: false });
    const audit = client.auditLog.create.mock.calls[0]![0].data;
    expect(audit).toMatchObject({ action: "SUBSCRIPTION_CHANGED", schoolId: "sch1", userId: "sa1" });
    expect(audit.oldValues.status).toBe("TRIALING");
    expect(audit.newValues).toMatchObject({ status: "ACTIVE", note: "Paid term 1" });
  });

  it("maps CANCELLED to the billing enum's CANCELED spelling", async () => {
    const { service, client } = makeService();
    client.school.findUnique.mockResolvedValue(school("ACTIVE"));
    vi.spyOn(service, "getSchool").mockResolvedValue({} as never);
    await service.updateSubscription("sch1", { status: "CANCELLED" }, actor);
    expect(client.subscription.upsert.mock.calls[0]![0].update.status).toBe("CANCELED");
  });

  it("refuses an ACTIVE status whose expiry is long past (it would lock the school out instantly)", async () => {
    const { service, client } = makeService();
    client.school.findUnique.mockResolvedValue(school());
    await expect(service.updateSubscription("sch1", { status: "ACTIVE", expiresAt: "2020-01-01" }, actor)).rejects.toThrow(BadRequestException);
    expect(client.organization.update).not.toHaveBeenCalled();
    expect(client.auditLog.create).not.toHaveBeenCalled();
  });

  it("refuses to re-activate against an already-lapsed stored expiry unless a new date is given", async () => {
    const { service, client } = makeService();
    client.school.findUnique.mockResolvedValue(school("SUSPENDED", new Date(Date.now() - 60 * DAY)));
    await expect(service.updateSubscription("sch1", { status: "ACTIVE" }, actor)).rejects.toThrow(BadRequestException);
  });

  it("allows suspending regardless of expiry, and clearing the expiry with null", async () => {
    const { service, client } = makeService();
    client.school.findUnique.mockResolvedValue(school("ACTIVE", new Date(Date.now() - 60 * DAY)));
    vi.spyOn(service, "getSchool").mockResolvedValue({} as never);
    await expect(service.updateSubscription("sch1", { status: "SUSPENDED" }, actor)).resolves.toBeDefined();
    await expect(service.updateSubscription("sch1", { status: "ACTIVE", expiresAt: null }, actor)).resolves.toBeDefined();
    expect(client.organization.update.mock.calls[1]![0].data.expiresAt).toBeNull();
  });
});

describe("updateSchool", () => {
  it("blocks a subdomain change once students exist, because their login emails derive from it", async () => {
    const { service, client } = makeService();
    client.school.findUnique.mockResolvedValue({
      id: "sch1", organizationId: "org1", name: "A", code: "AAA", subdomain: "old", email: null, phone: null, address: null,
      organization: { metadata: null }, _count: { students: 120 },
    });
    await expect(
      service.updateSchool("sch1", { schoolName: "A", schoolCode: "AAA", subdomain: "new-name" }, actor),
    ).rejects.toThrow(ConflictException);
    expect(client.school.update).not.toHaveBeenCalled();
  });

  it("allows other edits when students exist and audits old and new values", async () => {
    const { service, client } = makeService();
    client.school.findUnique.mockResolvedValue({
      id: "sch1", organizationId: "org1", name: "A", code: "AAA", subdomain: "same", email: null, phone: null, address: null,
      organization: { metadata: "{bad json" }, _count: { students: 120 },
    });
    vi.spyOn(service, "getSchool").mockResolvedValue({} as never);
    await service.updateSchool("sch1", { schoolName: "Renamed", schoolCode: "AAA", subdomain: "same" }, actor);
    const audit = client.auditLog.create.mock.calls[0]![0].data;
    expect(audit.oldValues.name).toBe("A");
    expect(audit.newValues.name).toBe("Renamed");
  });
});

describe("school administrators", () => {
  const member = { id: "m1", organizationId: "org1", userId: "u1", role: "admin", banned: false };
  const arrange = () => {
    const ctx = makeService();
    ctx.client.school.findUnique.mockResolvedValue({ organizationId: "org1" });
    ctx.client.member.findUnique.mockResolvedValue(member);
    return ctx;
  };

  it("refuses to mutate a school administrator from a different school's organization", async () => {
    const { service, client } = arrange();
    client.school.findUnique.mockResolvedValue({ organizationId: "org-other" });
    client.member.findUnique.mockResolvedValue(null);

    await expect(
      service.setSchoolAdminBanned("sch1", "u1", true, actor, "Repeated policy violations"),
    ).rejects.toThrow("School administrator membership not found");

    expect(client.$transaction).not.toHaveBeenCalled();
    expect(client.member.update).not.toHaveBeenCalled();
    expect(client.session.deleteMany).not.toHaveBeenCalled();
    expect(client.auditLog.create).not.toHaveBeenCalled();
  });

  it("does not reset 2FA or revoke sessions when the target is not a member of the requested school", async () => {
    const { service, client } = arrange();
    client.school.findUnique.mockResolvedValue({ organizationId: "org-other" });
    client.member.findUnique.mockResolvedValue(null);

    await expect(service.resetSchoolAdminTwoFactor("sch1", "u1", actor))
      .rejects.toThrow("School administrator membership not found");

    expect(client.$transaction).not.toHaveBeenCalled();
    expect(client.session.deleteMany).not.toHaveBeenCalled();
    expect(client.auditLog.create).not.toHaveBeenCalled();
  });

  it("requires a meaningful reason before attempting an administrator suspension", async () => {
    const { service, client } = arrange();
    await expect(service.setSchoolAdminBanned("sch1", "u1", true, actor)).rejects.toThrow(BadRequestException);
    await expect(service.setSchoolAdminBanned("sch1", "u1", true, actor, "   too short ")).rejects.toThrow(BadRequestException);
    expect(client.member.findUnique).not.toHaveBeenCalled();
    expect(client.member.update).not.toHaveBeenCalled();
  });

  it("will not suspend the last active administrator", async () => {
    const { service, client } = arrange();
    client.member.findFirst.mockResolvedValue(null);
    await expect(service.setSchoolAdminBanned("sch1", "u1", true, actor, "Repeated policy violations")).rejects.toThrow(BadRequestException);
    expect(client.member.update).not.toHaveBeenCalled();
  });

  it("suspends an administrator, revokes their sessions and audits it", async () => {
    const { service, client } = arrange();
    client.member.findFirst.mockResolvedValue({ id: "other" });
    await service.setSchoolAdminBanned("sch1", "u1", true, actor, "Repeated policy violations");
    expect(client.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(client.member.update.mock.calls[0]![0].data.banReason).toBe("Repeated policy violations");
    expect(client.auditLog.create.mock.calls[0]![0].data).toMatchObject({
      action: "ACCESS_CHANGED",
      entityType: "super-admin.school-admin.ban",
      newValues: { banned: true, reason: "Repeated policy violations" },
    });
  });

  it("will not remove the last active administrator", async () => {
    const { service, client } = arrange();
    client.member.findFirst.mockResolvedValue(null);
    await expect(service.removeSchoolAdmin("sch1", "u1", actor)).rejects.toThrow(BadRequestException);
    expect(client.member.delete).not.toHaveBeenCalled();
  });

  it("removes an administrator, revokes sessions and audits it", async () => {
    const { service, client } = arrange();
    client.member.findFirst.mockResolvedValue({ id: "other" });
    await service.removeSchoolAdmin("sch1", "u1", actor);
    expect(client.member.delete).toHaveBeenCalled();
    expect(client.session.deleteMany).toHaveBeenCalled();
    expect(client.auditLog.create.mock.calls[0]![0].data.action).toBe("DELETE");
  });
});

describe("enrollSchool", () => {
  const input = {
    schoolName: "Achimota School", schoolCode: "ACH-001", subdomain: "achimota",
    adminName: "Ama Mensah", adminEmail: "ama@achimota.edu.gh",
  };

  it("issues a random one-time password, starts a dated trial and audits without leaking the password", async () => {
    const { service, client } = makeService();
    const result = await service.enrollSchool(input as never, actor);

    expect(Object.values(DEFAULT_PASSWORDS)).not.toContain(result.credentials.temporaryPassword);
    expect(result.credentials.temporaryPassword).toHaveLength(16);
    expect(result.credentials.mustChangePassword).toBe(true);

    const orgData = client.organization.create.mock.calls[0]![0].data;
    expect(orgData.subscriptionStatus).toBe("TRIALING");
    const trialDays = (orgData.expiresAt.getTime() - orgData.createdAt.getTime()) / DAY;
    expect(Math.round(trialDays)).toBe(SUBSCRIPTION_TRIAL_DAYS);
    expect(client.subscription.create.mock.calls[0]![0].data).toMatchObject({ status: "TRIALING", isOnTrial: true });

    const audits = client.auditLog.create.mock.calls.map((c: any[]) => c[0].data);
    expect(audits.map((a: any) => a.action)).toEqual(["CREATE", "CREDENTIALS_ISSUED"]);
    expect(JSON.stringify(audits)).not.toContain(result.credentials.temporaryPassword);
    // the stored password is a hash, never the plaintext
    expect(client.account.create.mock.calls[0]![0].data.password).not.toContain(result.credentials.temporaryPassword);
  });

  it("returns a friendly 409 when the database reports a unique-constraint race", async () => {
    const { Prisma } = await import("@prisma/client");
    const { service, client } = makeService();
    client.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }));
    await expect(service.enrollSchool(input as never, actor)).rejects.toThrow(ConflictException);
  });

  it("rejects a duplicate admin email before opening a transaction", async () => {
    const { service, client } = makeService();
    client.user.findUnique.mockResolvedValue({ id: "x" });
    await expect(service.enrollSchool(input as never, actor)).rejects.toThrow(ConflictException);
    expect(client.$transaction).not.toHaveBeenCalled();
  });
});
