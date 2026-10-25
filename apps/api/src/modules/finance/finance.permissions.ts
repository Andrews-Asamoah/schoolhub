/**
 * Central finance access policy. Every finance route takes its roles from
 * here, so the policy is changed in one place and checked by
 * finance-permissions.spec.ts.
 *
 * - Platform superAdmin is allowed everywhere by RolesGuard (it bypasses
 *   school-role checks), which covers support interventions.
 * - NOTE: RolesGuard treats a headteacher as also being an "admin". Because
 *   "admin" is not a write role, headteachers cannot change financial data
 *   unless they ALSO hold the accountant role.
 */

/** Roles that may change financial data (bills, payments, expenses, payroll, concessions...). */
export const FINANCE_WRITE_ROLES = ["accountant"] as const;

/** Roles that may view financial data and reports. */
export const FINANCE_READ_ROLES = ["owner", "admin", "accountant", "headteacher"] as const;
