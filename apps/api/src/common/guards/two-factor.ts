import { ForbiddenException } from "@nestjs/common";

/** Machine-readable marker the web client looks for in the `error` field. */
export const TWO_FACTOR_REQUIRED = "TWO_FACTOR_REQUIRED";

/** School roles that hold administrative power over a whole school. */
export const SCHOOL_ADMIN_ROLES = ["owner", "admin"] as const;

/**
 * Platform super-admins must always use two-factor authentication. School
 * owners/admins require it in production by default. An explicit
 * REQUIRE_2FA_SCHOOL_ADMINS value overrides that deployment policy. Read at call time so it can be changed
 * (and tested) without re-importing modules.
 */
export function schoolAdminTwoFactorRequired(): boolean {
  return process.env.REQUIRE_2FA_SCHOOL_ADMINS === undefined
    ? process.env.NODE_ENV === "production"
    : process.env.REQUIRE_2FA_SCHOOL_ADMINS === "true";
}

export function hasSchoolAdminRole(roles: Iterable<string>): boolean {
  for (const role of roles) {
    if ((SCHOOL_ADMIN_ROLES as readonly string[]).includes(role)) return true;
  }
  return false;
}

/**
 * Blocks a session whose account has not enrolled in two-factor
 * authentication. The enrolment endpoints themselves are Better Auth routes
 * (/api/auth/two-factor/*), so they stay reachable and a blocked user can
 * always complete setup.
 */
export function assertTwoFactorEnabled(
  user: { twoFactorEnabled?: unknown } | undefined,
  audience: "super-admin" | "school-admin",
) {
  if (user?.twoFactorEnabled === true) return;
  throw new ForbiddenException({
    message:
      audience === "super-admin"
        ? "Two-factor authentication is required for platform administrators. Set it up to continue."
        : "Your school requires administrators to use two-factor authentication. Set it up to continue.",
    error: TWO_FACTOR_REQUIRED,
    audience,
  });
}
