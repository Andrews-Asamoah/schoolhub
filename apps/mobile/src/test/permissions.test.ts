import {
  canEnterRole,
  isAuthorizedSession,
  MOBILE_ROLES,
  isMobileRole,
  roleGroup,
  canSeeBece,
  assertFeature,
} from "@/lib/permissions";
test("allows only the three mobile roles", () => {
  expect(MOBILE_ROLES).toEqual(["teacher", "student", "guardian"]);
  for (const role of MOBILE_ROLES) {
    expect(isMobileRole(role)).toBe(true);
    expect(roleGroup(role)).toBe(`(${role})`);
  }
  for (const role of [
    "admin",
    "superAdmin",
    "owner",
    "headteacher",
    "accountant",
    "staff",
    null,
    undefined,
    "Teacher",
  ]) {
    expect(isMobileRole(role)).toBe(false);
    expect(() => roleGroup(role)).toThrow();
  }
});
test("BECE and external examinations are unavailable to every mobile v1 role", () => {
  for (const role of MOBILE_ROLES) {
    expect(canSeeBece(role)).toBe(false);
    expect(() => assertFeature(role, "bece")).toThrow();
  }
});

test("route guards fail closed for every blocked status and unsupported role", () => {
  for (const status of [
    "loading",
    "signedOut",
    "needsRoleSelection",
    "needsPasswordChange",
    "needsTwoFactorSetup",
    "subscriptionInactive",
  ]) {
    for (const role of MOBILE_ROLES)
      expect(canEnterRole({ status, activeRole: role }, role)).toBe(false);
  }
  for (const role of MOBILE_ROLES) {
    for (const target of MOBILE_ROLES)
      expect(canEnterRole({ status: "ready", activeRole: role }, target)).toBe(
        role === target,
      );
  }
  for (const activeRole of [
    "owner",
    "admin",
    "headteacher",
    "accountant",
    "staff",
    "superAdmin",
    null,
  ])
    expect(isAuthorizedSession({ status: "ready", activeRole })).toBe(false);
});
