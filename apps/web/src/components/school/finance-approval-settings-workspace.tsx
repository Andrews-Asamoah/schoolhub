import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { apiFetch } from "@/lib/api";

type Control =
  | "PAYROLL_SETTINGS" | "BANK_RECONCILIATION" | "PERIOD_CONTROL"
  | "MANUAL_JOURNAL" | "INVOICE_ADJUSTMENT" | "ACCOUNT_MAPPING";

export interface ApprovalSetting {
  control: Control;
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

const HELP: Record<Control, string> = {
  PAYROLL_SETTINGS: "Activating or ending PAYE bands, SSNIT and pension rates.",
  BANK_RECONCILIATION: "Signing off a bank statement reconciliation.",
  PERIOD_CONTROL: "Closing a month or reopening a closed month.",
  MANUAL_JOURNAL: "Posting a journal the accountant wrote by hand.",
  INVOICE_ADJUSTMENT: "Credit notes and bad-debt write-offs on student invoices.",
  ACCOUNT_MAPPING: "Choosing which account the system uses for fees, cash and receivables.",
};

function SettingCard({ setting }: { setting: ApprovalSetting }) {
  const client = useQueryClient();
  const [required, setRequired] = useState(setting.required);
  const [roles, setRoles] = useState<string[]>(setting.approverRoles);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setRequired(setting.required);
    setRoles(setting.approverRoles);
  }, [setting.required, setting.approverRoles]);

  const save = useMutation({
    mutationFn: () => apiFetch<ApprovalSetting>(`/finance/approval-settings/${setting.control}`, {
      method: "PUT", body: JSON.stringify({ required, approverRoles: required ? roles : [] }),
    }),
    onSuccess: async () => {
      setMessage("Saved.");
      await client.invalidateQueries({ queryKey: ["finance-approval-settings"] });
    },
    onError: (error: Error) => setMessage(error.message),
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
          onChange={(event) => { setRequired(event.target.checked); setMessage(""); }} />
        Require a second person to approve
      </label>
      {required ? (
        <fieldset className="space-y-1 text-sm">
          <legend className="text-muted-foreground">Who can approve</legend>
          {APPROVER_ROLES.map((role) => (
            <label key={role.value} className="mr-4 inline-flex items-center gap-2">
              <input type="checkbox" checked={roles.includes(role.value)}
                onChange={(event) => {
                  setRoles((current) => event.target.checked
                    ? [...current, role.value] : current.filter((item) => item !== role.value));
                  setMessage("");
                }} />
              {role.label}
            </label>
          ))}
          {invalid && <p className="text-destructive">Choose at least one approver.</p>}
        </fieldset>
      ) : (
        <p className="text-sm text-muted-foreground">
          The accountant completes this step alone. Every such action is recorded as having no second approver.
        </p>
      )}
      <div className="flex items-center gap-3">
        <button type="button" disabled={save.isPending || unchanged || invalid} onClick={() => save.mutate()}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {save.isPending && <LoaderCircle className="size-4 animate-spin" />}Save
        </button>
        {message && <p role="status" className="text-sm">{message}</p>}
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
          By default the accountant can complete these steps alone. Turn on a second approver for any step your
          school wants checked, for example by the owner or headteacher. Changes apply to new submissions and are
          recorded in the activity log.
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
