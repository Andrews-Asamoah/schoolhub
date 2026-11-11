import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export type FinanceApprovalControl =
  | "PAYROLL_SETTINGS" | "BANK_RECONCILIATION" | "PERIOD_CONTROL"
  | "MANUAL_JOURNAL" | "INVOICE_ADJUSTMENT" | "ACCOUNT_MAPPING";

interface ApprovalSettingRow { control: string; required: boolean; approverRoles: string[] }

/** Roles that may still decide an item when no approver is configured (or approval was switched off). */
const FALLBACK_DECIDERS = ["owner", "headteacher"];

/**
 * Works out, for one control, whether the school requires a second approver and who may decide.
 * Until the setting has loaded the stricter reading applies (approval required), so a screen never
 * promises that the accountant can finish a step on their own before that is known.
 */
export function resolveApproval(rows: ApprovalSettingRow[] | undefined, control: FinanceApprovalControl) {
  const setting = rows?.find((row) => row.control === control);
  const required = setting?.required ?? true;
  const deciderRoles = required && setting?.approverRoles.length ? setting.approverRoles : FALLBACK_DECIDERS;
  return { required, deciderRoles, canDecide: (role: string | null | undefined) => !!role && deciderRoles.includes(role) };
}

export function useFinanceApproval(control: FinanceApprovalControl) {
  const query = useQuery({
    queryKey: ["finance-approval-settings"],
    queryFn: () => apiFetch<ApprovalSettingRow[]>("/finance/approval-settings"),
    staleTime: 60_000,
  });
  return resolveApproval(query.data, control);
}
