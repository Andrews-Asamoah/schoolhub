import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download, FileText, LoaderCircle, ReceiptText } from "lucide-react";
import { apiDownload, apiFetch } from "@/lib/api";

interface MyPayslipSummary {
  id: string;
  month: number;
  year: number;
  status: "APPROVED" | "PAID";
  basicSalary: string;
  grossSalary: string;
  incomeTax: string;
  netSalary: string;
  paymentStatus: string;
  paidAt?: string | null;
}
interface MyPayslipLine {
  id: string;
  kind: "EARNING" | "DEDUCTION" | "EMPLOYER_CONTRIBUTION" | "MEMO";
  code: string;
  description: string;
  amount: string;
  originalAmount?: string | null;
  balance?: string | null;
  memo: boolean;
}
interface MyPayslipDetail extends MyPayslipSummary {
  school: { name: string; logo?: string | null; address?: string | null; phone?: string | null; email?: string | null };
  employee: { name: string; identifier: string; payProfile?: { ssnitNumber?: string | null; tin?: string | null; gradeOrPosition?: string | null; department?: string | null; paymentMode?: string | null } | null };
  allowances: string;
  ssnitEmployee: string;
  ssnitEmployer: string;
  tier2Employee: string;
  tier2Employer: string;
  tier3Employee: string;
  tier3Employer: string;
  otherDeductions: string;
  paymentMethod: string;
  lines: MyPayslipLine[];
}
const money = (value: string | null | undefined) => value == null ? "—" : `GHS ${value}`;
const periodName = (month: number, year: number) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));

export function MyPayslipsWorkspace() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const payslipsQuery = useQuery({
    queryKey: ["me", "payslips"],
    queryFn: () => apiFetch<{ items: MyPayslipSummary[] }>("/schools/current/me/payslips"),
    retry: false,
  });
  const detailQuery = useQuery({
    queryKey: ["me", "payslips", selectedId],
    queryFn: () => apiFetch<MyPayslipDetail>(`/schools/current/me/payslips/${encodeURIComponent(selectedId!)}`),
    enabled: Boolean(selectedId),
    retry: false,
  });
  const items = payslipsQuery.data?.items ?? [];
  const selected = detailQuery.data;

  async function downloadPdf() {
    if (!selectedId) return;
    setDownloadError(null);
    try {
      await apiDownload(`/schools/current/me/payslips/${encodeURIComponent(selectedId)}/pdf`, `schoolhub-payslip-${selectedId}.pdf`);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Could not download the payslip PDF.");
    }
  }

  return <div className="mx-auto w-full min-w-0 max-w-screen-xl space-y-6">
    <header className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ReceiptText className="size-5" /></div>
        <div><h1 className="text-2xl font-semibold tracking-tight text-foreground">My payslips</h1><p className="text-sm text-muted-foreground">Private payroll statements for your own approved or paid runs.</p></div>
      </div>
    </header>

    {payslipsQuery.isLoading && <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading your payslips…</div>}
    {payslipsQuery.error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{payslipsQuery.error.message}</div>}
    {!payslipsQuery.isLoading && !payslipsQuery.error && items.length === 0 && <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center"><FileText className="mx-auto size-8 text-muted-foreground" /><h2 className="mt-3 font-semibold text-foreground">No payslips available</h2><p className="mt-1 text-sm text-muted-foreground">Payslips appear here after a payroll run has been approved or marked paid.</p></div>}

    {items.length > 0 && <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3"><h2 className="font-semibold text-foreground">Payroll history</h2><p className="text-xs text-muted-foreground">Showing {items.length} available payslip(s).</p></div>
      <div className="divide-y divide-border">
        {items.map((item) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`flex w-full flex-col gap-3 px-4 py-4 text-left transition hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between ${selectedId === item.id ? "bg-primary/5" : ""}`}>
          <div><p className="font-medium text-foreground">{periodName(item.month, item.year)}</p><p className="mt-1 text-xs text-muted-foreground">Run {item.status.toLowerCase()} · Payment {item.paymentStatus.toLowerCase()}</p></div>
          <div className="grid grid-cols-2 gap-4 text-sm sm:min-w-72"><div><p className="text-xs text-muted-foreground">Gross</p><p className="font-medium text-foreground">{money(item.grossSalary)}</p></div><div><p className="text-xs text-muted-foreground">Net pay</p><p className="font-semibold text-foreground">{money(item.netSalary)}</p></div></div>
        </button>)}
      </div>
    </section>}

    {selectedId && <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-6">
      {detailQuery.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading payslip details…</div>}
      {detailQuery.error && <div role="alert" className="text-sm text-destructive">{detailQuery.error.message}</div>}
      {selected && <>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Confidential payslip</p><h2 className="mt-1 text-xl font-semibold text-foreground">{selected.school.name}</h2><p className="text-sm text-muted-foreground">{periodName(selected.month, selected.year)} · {selected.employee.name || "Employee"} · {selected.employee.identifier}</p></div>
          <button type="button" onClick={downloadPdf} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"><Download className="size-4" /> Download PDF</button>
        </div>
        {downloadError && <p role="alert" className="text-sm text-destructive">{downloadError}</p>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Basic salary", selected.basicSalary],
            ["Gross earnings", selected.grossSalary],
            ["PAYE", selected.incomeTax],
            ["Net pay", selected.netSalary],
          ].map(([label, value]) => <div key={label} className="rounded-xl border border-border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold text-foreground">{money(value)}</p></div>)}
        </div>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-3">Code</th><th className="px-3 py-3">Description</th><th className="px-3 py-3 text-right">Amount (GHS)</th><th className="px-3 py-3 text-right">Balance (GHS)</th></tr></thead>
            <tbody className="divide-y divide-border">{selected.lines.map((line) => <tr key={line.id}><td className="px-3 py-3 font-mono text-xs text-muted-foreground">{line.code}</td><td className="px-3 py-3 text-foreground">{line.description}{line.memo ? <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">MEMO</span> : null}</td><td className="px-3 py-3 text-right tabular-nums text-foreground">{line.amount}</td><td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{line.balance ?? "—"}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">Tier 2 and Tier 3 lines are shown only when your enrolment for the payslip period permits their disclosure.</p>
      </>}
    </section>}
  </div>;
}
