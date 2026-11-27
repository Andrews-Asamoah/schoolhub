import type { FinanceApprovalControl, Prisma } from "@prisma/client";
import { z } from "zod";

/**
 * Per-school second-person approval settings for the finance controls an accountant prepares.
 *
 * Payroll runs default to independent review. Other controls default to allowing the
 * accountant to complete the approval step. A waived decision is marked in the audit trail.
 */
export const FINANCE_APPROVAL_CONTROLS = [
  "PAYROLL_RUN", "PAYROLL_SETTINGS", "BANK_RECONCILIATION", "PERIOD_CONTROL",
  "MANUAL_JOURNAL", "INVOICE_ADJUSTMENT", "ACCOUNT_MAPPING",
] as const satisfies readonly FinanceApprovalControl[];

export const FINANCE_APPROVAL_CONTROL_LABELS: Record<FinanceApprovalControl, string> = {
  PAYROLL_RUN: "Payroll runs",
  PAYROLL_SETTINGS: "Payroll tax and pension settings",
  BANK_RECONCILIATION: "Bank reconciliations",
  PERIOD_CONTROL: "Closing and reopening accounting periods",
  MANUAL_JOURNAL: "Manual journals",
  INVOICE_ADJUSTMENT: "Credit notes and write-offs",
  ACCOUNT_MAPPING: "System account mappings",
};

/** Roles a school may name as approvers. Both can already read the items they approve. */
export const FINANCE_APPROVER_ROLE_OPTIONS = ["owner", "headteacher"] as const;
const PAYROLL_RUN_APPROVER_ROLES = ["owner", "accountant"] as const;
export type FinanceApproverRole = (typeof FINANCE_APPROVER_ROLE_OPTIONS)[number];

/** Recorded as the decision note when the school policy waives the second approver. */
export const POLICY_WAIVER_NOTE = "Approval not required by school policy.";

export interface EffectiveApprovalSetting {
  control: FinanceApprovalControl;
  required: boolean;
  approverRoles: string[];
  /** False when the school has never saved a setting (defaults apply). */
  configured: boolean;
}

export interface ApprovalActor {
  id: string;
  role: string | undefined;
  isSuperAdmin: boolean;
}

export function effectiveSetting(
  control: FinanceApprovalControl,
  row: { required: boolean; approverRoles: string[] } | null | undefined,
): EffectiveApprovalSetting {
  if (!row) {
    const required = control === "PAYROLL_RUN";
    return { control, required, approverRoles: required ? [...PAYROLL_RUN_APPROVER_ROLES] : [], configured: false };
  }
  return { control, required: row.required, approverRoles: row.required ? [...row.approverRoles] : [], configured: true };
}

/**
 * Who may decide an item that is waiting for approval. When approval is switched off, items
 * that were submitted earlier under a stricter setting can still be decided by the owner or
 * headteacher, so nothing is stranded.
 */
export function mayDecide(setting: EffectiveApprovalSetting, actor: ApprovalActor): boolean {
  if (actor.isSuperAdmin) return true;
  const roles = setting.required && setting.approverRoles.length
    ? setting.approverRoles
    : [...FINANCE_APPROVER_ROLE_OPTIONS];
  return actor.role !== undefined && roles.includes(actor.role);
}

/**
 * For approval steps that are a separate call (account mappings, payroll settings): the accountant
 * may also complete the step, but only when the school has switched second approval off.
 */
export function mayApproveStep(setting: EffectiveApprovalSetting, actor: ApprovalActor): boolean {
  return mayDecide(setting, actor) || (!setting.required && actor.role === "accountant");
}

export function mayApprovePayrollRun(setting: EffectiveApprovalSetting, role: string | undefined) {
  if (!setting.required) return role === "accountant" || role === "owner";
  return (role === "accountant" || role === "owner") && setting.approverRoles.includes(role);
}

function approvalInputSchema(roles: typeof FINANCE_APPROVER_ROLE_OPTIONS | typeof PAYROLL_RUN_APPROVER_ROLES) {
  return z.object({
    required: z.boolean(),
    approverRoles: z.array(z.enum(roles)).max(roles.length).default([]),
  }).refine(v => !v.required || v.approverRoles.length > 0, {
    message: "Choose at least one approver role when approval is required.",
    path: ["approverRoles"],
  });
}

export const approvalSettingInputSchema = approvalInputSchema(FINANCE_APPROVER_ROLE_OPTIONS);
export const payrollRunApprovalSettingInputSchema = approvalInputSchema(PAYROLL_RUN_APPROVER_ROLES);
export type ApprovalSettingInput = z.infer<typeof approvalSettingInputSchema>;

type SettingReader = Pick<Prisma.TransactionClient, "financeApprovalSetting">;

/** Loads one control's effective setting using the caller's client or transaction. */
export async function loadApprovalSetting(
  db: SettingReader, schoolId: string, control: FinanceApprovalControl,
): Promise<EffectiveApprovalSetting> {
  const row = await db.financeApprovalSetting.findUnique({ where: { schoolId_control: { schoolId, control } } });
  return effectiveSetting(control, row);
}
