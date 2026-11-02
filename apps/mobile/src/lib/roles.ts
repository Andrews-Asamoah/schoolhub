// Compatibility exports intentionally expose only the mobile allowlist.
export {
  MOBILE_ROLES as ROLES,
  ROLE_LABELS,
  isMobileRole as isRole,
} from "./permissions";
export type { MobileRole as Role } from "./permissions";
