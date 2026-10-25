import { describe, expect, it, vi } from "vitest";
import { actorFromRequest, redactForAudit, writeAudit } from "./audit.js";

describe("redactForAudit", () => {
  it("masks secrets at any depth and leaves other values alone", () => {
    const out = redactForAudit({
      email: "a@b.co",
      temporaryPassword: "hunter2",
      nested: { token: "abc", list: [{ passwordHash: "x", ok: 1 }] },
      when: new Date("2026-01-01T00:00:00Z"),
    }) as Record<string, any>;
    expect(out.email).toBe("a@b.co");
    expect(out.temporaryPassword).toBe("[redacted]");
    expect(out.nested.token).toBe("[redacted]");
    expect(out.nested.list[0]).toEqual({ passwordHash: "[redacted]", ok: 1 });
    expect(out.when).toBe("2026-01-01T00:00:00.000Z");
  });

  it("maps null/undefined to null so Prisma stores no value", () => {
    expect(redactForAudit(undefined)).toBeNull();
    expect(redactForAudit(null)).toBeNull();
  });
});

describe("writeAudit", () => {
  it("writes through the supplied (transaction) client with actor details", async () => {
    const create = vi.fn().mockResolvedValue({});
    await writeAudit({ auditLog: { create } } as never, { id: "u1", ipAddress: "1.2.3.4", userAgent: "UA" }, {
      action: "SUBSCRIPTION_CHANGED",
      entityType: "super-admin.subscription.update",
      entityId: "s1",
      schoolId: "s1",
      oldValues: { status: "ACTIVE" },
      newValues: { status: "SUSPENDED", password: "leak" },
    });
    const data = create.mock.calls[0]![0].data;
    expect(data).toMatchObject({ userId: "u1", schoolId: "s1", ipAddress: "1.2.3.4", action: "SUBSCRIPTION_CHANGED" });
    expect(data.newValues.password).toBe("[redacted]");
  });
});

describe("actorFromRequest", () => {
  it("reads the session user, ip and user-agent", () => {
    expect(actorFromRequest({ session: { user: { id: "u9" } }, ip: "9.9.9.9", headers: { "user-agent": "Mozilla" } })).toEqual({
      id: "u9",
      ipAddress: "9.9.9.9",
      userAgent: "Mozilla",
    });
  });
});
