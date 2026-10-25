import { describe, expect, it } from "vitest";
import { ForbiddenException, UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { SuperAdminGuard } from "./super-admin.guard.js";

const ctx = (user?: Record<string, unknown>) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ session: user ? { user } : undefined }) }) }) as unknown as ExecutionContext;

describe("SuperAdminGuard", () => {
  const guard = new SuperAdminGuard();

  it("lets an active super admin through", () => {
    expect(guard.canActivate(ctx({ id: "1", role: "superAdmin", twoFactorEnabled: true }))).toBe(true);
  });
  it("rejects anonymous requests", () => {
    expect(() => guard.canActivate(ctx())).toThrow(UnauthorizedException);
  });
  it("rejects every other role, including school owners", () => {
    for (const role of ["owner", "admin", "user"]) {
      expect(() => guard.canActivate(ctx({ id: "1", role }))).toThrow(ForbiddenException);
    }
  });
  it("rejects a banned super admin", () => {
    expect(() => guard.canActivate(ctx({ id: "1", role: "superAdmin", banned: true, twoFactorEnabled: true }))).toThrow(/suspended/);
  });
  it("requires two-factor: a super admin without it gets a machine-readable TWO_FACTOR_REQUIRED", () => {
    for (const twoFactorEnabled of [false, undefined, null, "true"]) {
      try {
        guard.canActivate(ctx({ id: "1", role: "superAdmin", twoFactorEnabled }));
        throw new Error("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).getResponse()).toMatchObject({ error: "TWO_FACTOR_REQUIRED", audience: "super-admin" });
      }
    }
  });
  it("asks for the password change before the second factor", () => {
    expect(() => guard.canActivate(ctx({ id: "1", role: "superAdmin", mustChangePassword: true, twoFactorEnabled: false }))).toThrow(/temporary password/);
  });
  it("blocks a super admin who still has a temporary password", () => {
    expect(() => guard.canActivate(ctx({ id: "1", role: "superAdmin", mustChangePassword: true, twoFactorEnabled: true }))).toThrow(ForbiddenException);
  });
});
