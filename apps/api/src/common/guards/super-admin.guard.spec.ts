import { describe, expect, it } from "vitest";
import { ForbiddenException, UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { SuperAdminGuard } from "./super-admin.guard.js";

const ctx = (user?: Record<string, unknown>) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ session: user ? { user } : undefined }) }) }) as unknown as ExecutionContext;

describe("SuperAdminGuard", () => {
  const guard = new SuperAdminGuard();

  it("lets an active super admin through", () => {
    expect(guard.canActivate(ctx({ id: "1", role: "superAdmin" }))).toBe(true);
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
    expect(() => guard.canActivate(ctx({ id: "1", role: "superAdmin", banned: true }))).toThrow(/suspended/);
  });
  it("blocks a super admin who still has a temporary password", () => {
    expect(() => guard.canActivate(ctx({ id: "1", role: "superAdmin", mustChangePassword: true }))).toThrow(ForbiddenException);
  });
});
