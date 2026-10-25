import { afterEach, describe, expect, it } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { assertTwoFactorEnabled, hasSchoolAdminRole, schoolAdminTwoFactorRequired } from "./two-factor.js";

describe("two-factor policy helpers", () => {
  afterEach(() => { delete process.env.REQUIRE_2FA_SCHOOL_ADMINS; });

  it("only an explicit boolean true counts as enrolled (fails closed)", () => {
    expect(() => assertTwoFactorEnabled({ twoFactorEnabled: true }, "super-admin")).not.toThrow();
    for (const value of [false, undefined, null, 1, "true", "yes"]) {
      expect(() => assertTwoFactorEnabled({ twoFactorEnabled: value }, "school-admin")).toThrow(ForbiddenException);
    }
    expect(() => assertTwoFactorEnabled(undefined, "school-admin")).toThrow(ForbiddenException);
  });

  it("word the error for the audience so the web app can explain it", () => {
    try { assertTwoFactorEnabled({}, "school-admin"); } catch (error) {
      expect((error as ForbiddenException).getResponse()).toMatchObject({ error: "TWO_FACTOR_REQUIRED", audience: "school-admin" });
    }
  });

  it("school-admin enforcement is off unless explicitly switched on", () => {
    expect(schoolAdminTwoFactorRequired()).toBe(false);
    process.env.REQUIRE_2FA_SCHOOL_ADMINS = "false";
    expect(schoolAdminTwoFactorRequired()).toBe(false);
    process.env.REQUIRE_2FA_SCHOOL_ADMINS = "true";
    expect(schoolAdminTwoFactorRequired()).toBe(true);
  });

  it("recognises owners and admins, including as a secondary role", () => {
    expect(hasSchoolAdminRole(new Set(["owner"]))).toBe(true);
    expect(hasSchoolAdminRole(new Set(["teacher", "admin"]))).toBe(true);
    expect(hasSchoolAdminRole(new Set(["teacher", "accountant", "student"]))).toBe(false);
  });
});
