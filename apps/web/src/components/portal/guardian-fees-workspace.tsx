import { useQuery } from "@tanstack/react-query";
import { CreditCard, FileText, LoaderCircle, ShieldCheck, UserRound, Printer, FileSpreadsheet, FileDown } from "lucide-react";
import { useMemo, useState } from "react";
import type { StudentProfileData } from "@/components/school/student-profile-panel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { exportPdf, exportXlsx, printTable, type ExportTable } from "@/lib/table-export";
import type { StudentStatementResponse, StudentStatementScope } from "@schoolhub/shared";

function fullName(ward: StudentProfileData) {
  return [ward.profile.firstName, ward.profile.otherNames, ward.profile.lastName].filter(Boolean).join(" ");
}

function money(value: number) {
  return new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

const scopeLabels: Record<StudentStatementScope, string> = {
  term: "Current term",
  year: "Current academic year",
  all: "All time",
};

export function GuardianFeesWorkspace() {
  const [wardId, setWardId] = useState("");
  const [scope, setScope] = useState<StudentStatementScope>("term");
  const wardsQuery = useQuery({
    queryKey: ["students", "my-wards"],
    queryFn: () => apiFetch<StudentProfileData[]>("/students/my-wards"),
    retry: false,
  });
  const wards = wardsQuery.data ?? [];
  const selectedId = wards.some((ward) => ward.id === wardId) ? wardId : wards[0]?.id ?? "";
  const selected = wards.find((ward) => ward.id === selectedId);
  const statementQuery = useQuery({
    queryKey: ["students", "my-wards", selectedId, "fees", scope],
    queryFn: () => apiFetch<StudentStatementResponse>(`/students/my-wards/${encodeURIComponent(selectedId)}/fees?scope=${scope}`),
    enabled: Boolean(selectedId),
    retry: false,
  });
  const statement = statementQuery.data;
  const exportTable = useMemo<ExportTable | null>(() => {
    if (!statement) return null;
    return {
      title: `Fee statement - ${[statement.student.firstName, statement.student.lastName].filter(Boolean).join(" ") || statement.student.admissionNumber || "Student"}`,
      headers: ["Date", "Type", "Reference", "Description", "Debit (GHS)", "Credit (GHS)", "Running balance (GHS)"],
      rows: statement.entries.map((entry) => [
        new Date(entry.date).toLocaleDateString("en-GB"),
        entry.type,
        entry.reference,
        entry.description,
        entry.debit,
        entry.credit,
        entry.balance,
      ]),
    };
  }, [statement]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Family centre</p>
        <div className="mt-1 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Ward fees</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">View the fee account and payment history for a child linked to your guardian account.</p>
          </div>
          {wards.length > 0 && (
            <div className="w-full sm:w-72">
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Child</label>
              <Select value={selectedId} onValueChange={setWardId}>
                <SelectTrigger className="h-11 w-full text-sm"><SelectValue placeholder="Choose a child" /></SelectTrigger>
                <SelectContent>
                  {wards.map((ward) => <SelectItem key={ward.id} value={ward.id}>{fullName(ward)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        {selected && (
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-muted/50 p-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><UserRound className="size-5" /></span>
            <div><p className="text-sm font-semibold text-foreground">{fullName(selected)}</p><p className="text-xs text-muted-foreground">{selected.class?.name ?? "Class not assigned"}</p></div>
          </div>
        )}
      </section>

      {wardsQuery.isPending ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-12 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading linked children…</div>
      ) : wardsQuery.isError ? (
        <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">Your linked children could not be loaded. Please try again later.</div>
      ) : wards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center"><UserRound className="mx-auto size-8 text-muted-foreground" /><h3 className="mt-3 font-semibold text-foreground">No children linked yet</h3><p className="mt-2 text-sm text-muted-foreground">Contact the school office to link your child to this guardian account.</p></div>
      ) : (
        <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Statement of account</h3>
              <p className="mt-1 text-sm text-muted-foreground">Scope: {scopeLabels[scope]}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["term", "year", "all"] as const).map((item) => (
                <button key={item} type="button" onClick={() => setScope(item)} aria-pressed={scope === item} className={scope === item ? "rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground" : "rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground"}>
                  {scopeLabels[item]}
                </button>
              ))}
            </div>
          </div>

          {statementQuery.isPending ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-12 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading fee statement…</div>
          ) : statementQuery.isError ? (
            <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">This ward's fee statement could not be loaded. Refresh the page or contact the school accounts office.</div>
          ) : statement ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Summary label="Opening balance" value={money(statement.openingBalance)} />
                <Summary label="Closing balance" value={money(statement.closingBalance)} />
                <Summary label="Unallocated credit" value={money(statement.unallocatedCredit)} />
                <Summary label="Entries" value={String(statement.entries.length)} />
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => exportTable && printTable(exportTable)} disabled={!exportTable} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground disabled:opacity-50"><Printer className="size-4" /> Print</button>
                <button type="button" onClick={() => exportTable && void exportPdf(exportTable)} disabled={!exportTable} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground disabled:opacity-50"><FileDown className="size-4" /> PDF</button>
                <button type="button" onClick={() => exportTable && void exportXlsx(exportTable)} disabled={!exportTable} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground disabled:opacity-50"><FileSpreadsheet className="size-4" /> Excel</button>
              </div>

              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                <div className="flex items-center gap-3 border-b border-border p-4"><FileText className="size-5 text-primary" /><div><h4 className="font-semibold text-foreground">{statement.period.label}</h4><p className="text-xs text-muted-foreground">{statement.period.from ?? "Earliest record"} to {statement.period.to ?? "Today"}</p></div></div>
                <div className="overflow-x-auto">
                  <table className="min-w-[850px] w-full text-left text-sm">
                    <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground"><tr>{["Date", "Type", "Reference", "Description", "Debit", "Credit", "Balance"].map((heading) => <th key={heading} className="px-3 py-3 font-semibold">{heading}</th>)}</tr></thead>
                    <tbody>
                      <tr className="border-t border-border bg-muted/20"><td className="px-3 py-3" colSpan={6}>Opening balance</td><td className="px-3 py-3 font-semibold tabular-nums">{money(statement.openingBalance)}</td></tr>
                      {statement.entries.map((entry) => (
                        <tr key={entry.id} className="border-t border-border">
                          <td className="whitespace-nowrap px-3 py-3">{new Date(entry.date).toLocaleDateString("en-GB")}</td>
                          <td className="whitespace-nowrap px-3 py-3">{entry.type.replaceAll("_", " ")}</td>
                          <td className="whitespace-nowrap px-3 py-3 font-medium">{entry.reference}</td>
                          <td className="px-3 py-3">{entry.description}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{entry.debit ? money(entry.debit) : "—"}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{entry.credit ? money(entry.credit) : "—"}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums">{money(entry.balance)}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-border bg-muted/20"><td className="px-3 py-3 font-semibold" colSpan={6}>Closing balance</td><td className="px-3 py-3 text-right font-bold tabular-nums">{money(statement.closingBalance)}</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-border bg-card p-4">
                  <h4 className="font-semibold text-foreground">Outstanding balance ageing</h4>
                  <p className="mt-1 text-xs text-muted-foreground">Based on the due dates of unpaid invoices.</p>
                  <div className="mt-3 divide-y divide-border">{statement.ageing.map((row) => <div key={row.bucket} className="flex items-center justify-between py-2 text-sm"><span className="text-muted-foreground">{row.bucket}</span><span className="font-semibold tabular-nums">{money(row.amount)}</span></div>)}</div>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4">
                  <h4 className="font-semibold text-foreground">Clearance policy</h4>
                  <p className="mt-2 text-sm text-muted-foreground">{statement.arrearsPolicy === "BLOCK_CLEARANCE_UNTIL_PAID" ? "The school blocks examination clearance while previous-term arrears remain unpaid." : "The school displays previous-term arrears for information; ask the accounts office about clearance requirements."}</p>
                  <p className="mt-3 inline-flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4" /> Contact the school accounts office for a billing correction.</p>
                </div>
              </div>
            </>
          ) : null}
        </section>
      )}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-lg font-bold tracking-tight text-foreground tabular-nums">{value}</p></div>;
}
