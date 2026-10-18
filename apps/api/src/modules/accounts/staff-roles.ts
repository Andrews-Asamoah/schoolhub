import type { Role } from "@schoolhub/shared";

type StaffTypeValue =
  | "ACCOUNTANT"
  | "HEADTEACHER"
  | "ADMIN"
  | "LIBRARIAN"
  | "DRIVER"
  | "SECURITY"
  | "NURSE"
  | "COUNSELOR"
  | "IT_SUPPORT"
  | "RECEPTIONIST"
  | "COOK"
  | "CLEANER"
  | "OTHER";

/** School membership role granted to each non-teaching staff type. */
export function roleForStaffType(staffType: StaffTypeValue): Exclude<Role, "owner"> {
  switch (staffType) {
    case "ACCOUNTANT":
      return "accountant";
    case "HEADTEACHER":
      return "headmistress";
    case "ADMIN":
      return "admin";
    default:
      return "staff";
  }
}
