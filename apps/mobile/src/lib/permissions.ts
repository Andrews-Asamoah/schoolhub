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
// The API also checks the teacher’s class assignment for each register.
export function canSeeBece(role: unknown): boolean {
  return role === "teacher";
}
export function assertFeature(
  role: unknown,
  feature: "announcements" | "bece",
) {
  assertMobileRole(role);
  if (feature === "bece" && !canSeeBece(role))
    throw new Error("External examinations require the teacher portal.");
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
