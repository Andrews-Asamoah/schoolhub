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

/**
 * Roles that may view detailed financial records and reports. Administrators
 * receive aggregate-only totals from the school dashboard, not these routes.
 */
export const FINANCE_READ_ROLES = ["owner", "accountant", "headteacher"] as const;

/** Roles allowed aggregate-only finance metrics on the school dashboard. */
export const FINANCE_SUMMARY_ROLES = ["owner", "admin", "accountant", "headteacher"] as const;

/** Payroll and salary exports are confidential: only accountant, owner and headteacher may export. */
export const FINANCE_PAYROLL_EXPORT_ROLES = ["accountant", "owner", "headteacher"] as const;

export function isFinancePayrollExportRole(role: string | null | undefined): boolean {
  return !!role && (FINANCE_PAYROLL_EXPORT_ROLES as readonly string[]).includes(role);
}

/** RolesGuard has a global superAdmin bypass; payroll exports intentionally override that bypass. */
export function canExportFinancePayroll(actorPlatformRole: string | null | undefined, activeSchoolRole: string | null | undefined): boolean {
  return actorPlatformRole !== "superAdmin" && isFinancePayrollExportRole(activeSchoolRole);
}

/**
 * Routes where the approval step is its own call (activating payroll settings, verifying an
 * account mapping, deciding a reconciliation or period control). The route lets the possible
 * deciders in; the service then enforces the school's own approval setting
 * (finance-approval-settings.ts): the owner or headteacher decide when approval is required,
 * and the accountant may complete the step only when the school has switched approval off.
 */
export const FINANCE_APPROVAL_ACTION_ROLES = ["owner", "headteacher", "accountant"] as const;

/** Anyone who needs to know whether a second approver is required can read the setting. */
export const FINANCE_APPROVAL_SETTINGS_READ_ROLES = ["owner", "admin", "accountant", "headteacher"] as const;

/**
 * Who may change the setting. RolesGuard also admits a headteacher as an "admin", so the service
 * re-checks that the active role is owner or admin.
 */
export const FINANCE_APPROVAL_SETTINGS_WRITE_ROLES = ["owner", "admin"] as const;
