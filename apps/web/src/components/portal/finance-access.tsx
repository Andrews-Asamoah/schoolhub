import { Lock } from "lucide-react";
import { useSchoolRole } from "@/components/school/school-role-switcher";

/**
 * Only the accountant role may change financial data (the API enforces this;
 * hiding controls here is only a courtesy). Mirrors FINANCE_WRITE_ROLES in
 * apps/api/src/modules/finance/finance.permissions.ts.
 */
export const FINANCE_WRITE_ROLES = ["accountant"] as const;

export function useFinanceAccess() {
  const { activeRole } = useSchoolRole();
  return {
    activeRole,
    canWrite: (FINANCE_WRITE_ROLES as readonly string[]).includes(activeRole ?? ""),
  };
}

export function FinanceReadOnlyNotice() {
  return (
    <div role="note" className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
      <Lock className="mt-0.5 size-4 shrink-0" />
      <span>
        You can view these financial records. Only the school accountant can record or change them. Ask your
        accountant, or the SchoolHub support team, if something needs correcting.
      </span>
    </div>
  );
}
