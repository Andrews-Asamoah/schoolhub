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

/** Payroll and salary exports are confidential: only accountant, owner and headteacher may export. */
export const FINANCE_PAYROLL_EXPORT_ROLES = ["accountant", "owner", "headteacher"] as const;

export function isFinancePayrollExportRole(role: string | null | undefined): boolean {
  return !!role && (FINANCE_PAYROLL_EXPORT_ROLES as readonly string[]).includes(role);
}

/** RolesGuard has a global superAdmin bypass; payroll exports intentionally override that bypass. */
export function canExportFinancePayroll(actorPlatformRole: string | null | undefined, activeSchoolRole: string | null | undefined): boolean {
  return actorPlatformRole !== "superAdmin" && isFinancePayrollExportRole(activeSchoolRole);
}

/** Statutory payroll settings may only be approved by the actual owner or headteacher membership role. */
export const PAYROLL_SETTINGS_APPROVER_ROLES = ["owner", "headteacher"] as const;

export function isPayrollSettingsApproverRole(role: string | null | undefined): boolean {
  return !!role && (PAYROLL_SETTINGS_APPROVER_ROLES as readonly string[]).includes(role);
}
