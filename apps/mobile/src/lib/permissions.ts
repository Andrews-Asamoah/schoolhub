import {
  ROLES as SCHOOL_ROLES,
  type Role as SchoolRole,
} from "@schoolhub/shared";

export const MOBILE_ROLES = [
  "teacher",
  "student",
  "guardian",
] as const satisfies readonly SchoolRole[];
export type MobileRole = (typeof MOBILE_ROLES)[number];
export const ROLE_LABELS: Record<MobileRole, string> = {
  teacher: "Teacher",
  student: "Student",
  guardian: "Guardian",
};
export function isMobileRole(value: unknown): value is MobileRole {
  return (
    typeof value === "string" &&
    (MOBILE_ROLES as readonly string[]).includes(value) &&
    (SCHOOL_ROLES as readonly string[]).includes(value)
  );
}
export function assertMobileRole(value: unknown): asserts value is MobileRole {
  if (!isMobileRole(value))
    throw new Error("This role is not supported on mobile.");
}
export function mobileRoles(values: readonly string[]): MobileRole[] {
  return [...new Set(values.filter(isMobileRole))];
}
export function roleGroup(role: unknown) {
  assertMobileRole(role);
  return `(${role})` as const;
}
// BECE/external exams are deferred for teachers too. No mobile v1 role gets them.
export function canSeeBece(_role: unknown): boolean {
  return false;
}
export function assertFeature(
  role: unknown,
  feature: "announcements" | "bece",
) {
  assertMobileRole(role);
  if (feature === "bece")
    throw new Error("External examinations are unavailable on mobile.");
}

export function isAuthorizedSession(session: {
  status: string;
  activeRole: unknown;
}) {
  return session.status === "ready" && isMobileRole(session.activeRole);
}
export function canEnterRole(
  session: { status: string; activeRole: unknown },
  role: MobileRole,
) {
  return isAuthorizedSession(session) && session.activeRole === role;
}
