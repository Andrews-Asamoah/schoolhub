import { ROLES, type Role } from "@schoolhub/shared";

export { ROLES };
export type { Role };

/** Roles that get a mobile experience. Super admin is web-only. */
export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Administrator",
  headteacher: "Headteacher",
  teacher: "Teacher",
  accountant: "Accountant",
  staff: "Staff",
  student: "Student",
  guardian: "Guardian",
};

export function isRole(value: string | null | undefined): value is Role {
  return !!value && (ROLES as readonly string[]).includes(value);
}
