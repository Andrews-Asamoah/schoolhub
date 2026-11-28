import { toast } from "@/components/ui/toaster";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { FinanceApprovalControl } from "@/lib/finance-approval";

export interface ApprovalSetting {
  control: FinanceApprovalControl;
  label: string;
  required: boolean;
  approverRoles: string[];
  configured: boolean;
  updatedAt: string | null;
}

const APPROVER_ROLES = [
  { value: "owner", label: "Owner" },
  { value: "headteacher", label: "Headteacher" },
] as const;

const HELP: Record<FinanceApprovalControl, string> = {
  PAYROLL_RUN: "Choose who can approve a monthly payroll draft before salaries are marked paid.",
  PAYROLL_SETTINGS: "Activating or ending PAYE bands, SSNIT and pension rates.",
  BANK_RECONCILIATION: "Signing off a bank statement reconciliation.",
  PERIOD_CONTROL: "Closing a month or reopening a closed month.",
  MANUAL_JOURNAL: "Posting a journal the accountant wrote by hand.",
  INVOICE_ADJUSTMENT: "Credit notes and bad-debt write-offs on student invoices.",
  ACCOUNT_MAPPING: "Choosing which account the system uses for fees, cash and receivables.",
};

function SettingCard({ setting }: { setting: ApprovalSetting }) {
  const client = useQueryClient();
  const payrollRun = setting.control === "PAYROLL_RUN";
  const approverRoles = payrollRun ? [
    { value: "owner", label: "Owner" },
    { value: "accountant", label: "Another accountant" },
  ] : APPROVER_ROLES;
  const [required, setRequired] = useState(setting.required);
  const [roles, setRoles] = useState<string[]>(setting.approverRoles);


  useEffect(() => {
    setRequired(setting.required);
    setRoles(setting.approverRoles);
  }, [setting.required, setting.approverRoles]);

  const save = useMutation({
    mutationFn: () => apiFetch<ApprovalSetting>(`/finance/approval-settings/${setting.control}`, {
      method: "PUT", body: JSON.stringify({ required, approverRoles: required ? roles : [] }),
    }),
    onSuccess: async () => {
      toast.success("Saved.");
      await client.invalidateQueries({ queryKey: ["finance-approval-settings"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const unchanged = required === setting.required
    && (!required || [...roles].sort().join() === [...setting.approverRoles].sort().join());
  const invalid = required && roles.length === 0;

  return (
    <li className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div>
        <h3 className="font-medium">{setting.label}</h3>
        <p className="text-sm text-muted-foreground">{HELP[setting.control]}</p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={required}
          onChange={(event) => { setRequired(event.target.checked);  }} />
        Require a second person to approve
      </label>
      {required ? (
        <fieldset className="space-y-1 text-sm">
          <legend className="text-muted-foreground">Who can approve</legend>
          {approverRoles.map((role) => (
            <label key={role.value} className="mr-4 inline-flex items-center gap-2">
              <input type="checkbox" checked={roles.includes(role.value)}
                onChange={(event) => {
                  setRoles((current) => event.target.checked
                    ? [...current, role.value] : current.filter((item) => item !== role.value));

                }} />
              {role.label}
            </label>
          ))}
          {payrollRun && <p className="text-muted-foreground">An approver must be a different person from the one who generated the draft.</p>}
          {invalid && <p className="text-destructive">Choose at least one approver.</p>}
        </fieldset>
      ) : (
        <p className="text-sm text-muted-foreground">
          {payrollRun
            ? "The accountant can approve their own draft and confirm disbursement. The approval is recorded as having no second reviewer."
            : "The accountant can complete this step alone. The activity log records that there was no second approver."}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button type="button" disabled={save.isPending || unchanged || invalid} onClick={() => save.mutate()}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {save.isPending && <LoaderCircle className="size-4 animate-spin" />}Save
        </button>

      </div>
    </li>
  );
}

/** Owner and admin choose which finance steps need a second approver, and who approves. */
export function FinanceApprovalSettingsWorkspace() {
  const settings = useQuery({
    queryKey: ["finance-approval-settings"],
    queryFn: () => apiFetch<ApprovalSetting[]>("/finance/approval-settings"),
  });
  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">Finance approvals</h2>
        <p className="text-sm text-muted-foreground">
          Choose which finance steps require an independent approver. Payroll runs require one by default.
          Changes are recorded in the activity log.
        </p>
      </header>
      {settings.isPending && <LoaderCircle className="size-5 animate-spin" aria-label="Loading" />}
      {settings.error && <p role="alert" className="text-destructive">{(settings.error as Error).message}</p>}
      <ul className="grid gap-3 md:grid-cols-2">
        {settings.data?.map((setting) => <SettingCard key={setting.control} setting={setting} />)}
      </ul>
    </section>
  );
}
