import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { FileSpreadsheet, FileText, LoaderCircle, Printer } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface AcademicTerm { id: string; name: string; isCurrent: boolean; }
interface AcademicYear { id: string; name: string; isCurrent: boolean; terms: AcademicTerm[]; }
interface FinanceSummary {
  asOf: string;
  balanceAsOf: string;
  balanceBasis: "CURRENT";
  reconciliation: { status: "RECONCILED" | "DISCREPANCY"; ageingTotal: string; ageingDifference: string; ageingReconciled: boolean; invoiceItemMismatchCount: number; studentBalanceMismatchCount: number; receiptAllocationMismatchCount: number; ledgerMismatchCount: number };
  period: { from: string | null; to: string | null; yearId: string | null; termId: string | null; basis: string };
  billed: string;
  billedCount: number;
  collected: string;
  receiptCount: number;
  outstanding: string;
  outstandingBillCount: number;
  overdue: string;
  overdueBillCount: number;
  collectionRate: string | null;
  byMethod: { method: string; amount: string; receiptCount: number }[];
  byClass: { classId: string | null; className: string; billed: string; collected: string; outstanding: string; billCount: number }[];
  ageing: { days0To30: string; days31To60: string; days61To90: string; days90Plus: string; notDue: string };
}
interface HistoricalReceivables {
  asOf: string;
  complete: boolean;
  warning: string | null;
  billed: string;
  collected: string;
  outstanding: string;
  ageing: { notDue: string; days0To30: string; days31To60: string; days61To90: string; days90Plus: string };
  exceptions: { reference: string; issue: string }[];
  students: { studentId: string; admissionNumber: string | null; balance: string; invoiceCount: number }[];
  invoices: { billId: string; billNumber: string; studentId: string; admissionNumber: string | null; issuedAt: string; dueDate: string | null; billed: string; collected: string; outstanding: string; daysOverdue: number | null }[];
}
interface CloseReadiness {
  asOf: string;
  basis: "CURRENT_UNCLOSED";
  closeReady: boolean;
  reportingOnly: true;
  warning: string;
  openInvoiceCount: number;
  openInvoices: string;
  studentBalances: string;
  journalReceivables: string;
  cachedReceivables: string;
  receivableAccounts: { id: string; code: string; name: string }[];
  checks: { code: string; status: "PASS" | "FAIL" | "NOT_CONFIGURED"; difference: string; exceptionCount?: number; details: string }[];
}
interface TrialBalance {
  asOf: string;
  basis: "POSTED_JOURNAL_ONLY";
  accrualComplete: false;
  warning: string;
  totalDebits: string;
  totalCredits: string;
  difference: string;
  balanced: boolean;
  cachedAccountMismatchCount: number | null;
  orphanAccountCount: number;
  accounts: Array<{
    accountId: string; code: string; name: string; accountType: string;
    debit: string; credit: string; postedBalance: string;
    cachedBalance: string; discrepancy: string;
  }>;
}
const money = (value: string | number) => new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 2 }).format(Number(value) || 0);
const inputClass = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/30";
const secondaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-50";

export function AccountantFinanceReportingWorkspace() {
  const [yearId, setYearId] = useState("");
  const [termId, setTermId] = useState("");
  const [scope, setScope] = useState<"term" | "year" | "all">("term");
  const [closeReadinessVisible, setCloseReadinessVisible] = useState(false);
  const closeReadinessQuery = useQuery({
    queryKey: ["finance", "receivables-close-readiness"],
    queryFn: () => apiFetch<CloseReadiness>("/finance/ledger/close-readiness"),
    enabled: closeReadinessVisible,
    staleTime: 0,
    retry: false,
  });
  const [trialBalanceVisible, setTrialBalanceVisible] = useState(false);
  const trialBalanceQuery = useQuery({
    queryKey: ["finance", "journal-trial-balance"],
    queryFn: () => apiFetch<TrialBalance>("/finance/ledger/trial-balance"),
    enabled: trialBalanceVisible,
    retry: false,
  });
  const [historyDate, setHistoryDate] = useState("");
  const historicalQuery = useQuery({
    queryKey: ["finance", "historical-receivables", historyDate],
    queryFn: () => apiFetch<HistoricalReceivables>("/finance/receivables/history?asOf=" + encodeURIComponent(historyDate)),
    enabled: Boolean(historyDate),
    staleTime: 0,
    retry: false,
  });

  const yearsQuery = useQuery({
    queryKey: ["schools", "academic-years"],
    queryFn: () => apiFetch<AcademicYear[]>("/schools/academic-years"),
    retry: false,
  });
  const years = yearsQuery.data ?? [];
  const currentYear = years.find((year) => year.isCurrent) ?? years[0];
  const selectedYearId = yearId || currentYear?.id || "";
  const selectedYear = years.find((year) => year.id === selectedYearId);
  const selectedTermId = termId || selectedYear?.terms.find((term) => term.isCurrent)?.id || selectedYear?.terms[0]?.id || "";
  const summaryQuery = useQuery({
    queryKey: ["finance", "report-summary", scope, selectedYearId, selectedTermId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (scope !== "all" && selectedYearId) params.set("yearId", selectedYearId);
      if (scope === "term" && selectedTermId) params.set("termId", selectedTermId);
      return apiFetch<FinanceSummary>(`/finance/summary${params.size ? `?${params.toString()}` : ""}`);
    },
    retry: false,
  });
  const summary = summaryQuery.data;

  const exportPdf = () => {
    if (!summary) return;
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    pdf.setFontSize(16);
    pdf.text("School finance report", 14, 16);
    pdf.setFontSize(9);
    pdf.text(`Scope: ${scope === "all" ? "All available academic years" : `${selectedYear?.name ?? "Academic year"}${scope === "term" ? ` · ${selectedYear?.terms.find((term) => term.id === selectedTermId)?.name ?? "Term"}` : ""}`}`, 14, 23);
    pdf.text(`Activity: ${summary.period.from ?? "All time"} to ${summary.period.to}; balances: ${summary.balanceAsOf}`, 14, 29);
    autoTable(pdf, {
      startY: 35,
      head: [["Measure", "Amount / rate", "Count"]],
      body: [
        ["Billed", summary.billed, String(summary.billedCount)],
        ["Collected", summary.collected, String(summary.receiptCount)],
        ["Outstanding", summary.outstanding, String(summary.outstandingBillCount)],
        ["Overdue", summary.overdue, String(summary.overdueBillCount)],
        ["Collection rate", summary.collectionRate == null ? "Not available" : `${summary.collectionRate}%`, ""],
      ],
      styles: { fontSize: 9 },
    });
    autoTable(pdf, {
      startY: (pdf as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY
        ? ((pdf as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 35) + 7
        : 70,
      head: [["Class", "Billed", "Collected", "Outstanding", "Bills"]],
      body: summary.byClass.map((row) => [row.className, row.billed, row.collected, row.outstanding, String(row.billCount)]),
      styles: { fontSize: 8 },
      didDrawPage: () => {
        pdf.setFontSize(8);
        pdf.text("Confidential · SchoolHub", 14, 200);
        pdf.text(`Page ${pdf.getNumberOfPages()}`, 280, 200, { align: "right" });
      },
    });
    pdf.save("school-finance-report.pdf");
  };

  const exportExcel = async () => {
    if (!summary) return;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "SchoolHub";
    workbook.created = new Date();
    const info = workbook.addWorksheet("Report info");
    info.addRows([
      ["Report", "School finance summary"],
      ["Scope", scope],
      ["Academic year", selectedYear?.name ?? "All academic years"],
      ["Term", scope === "term" ? selectedYear?.terms.find((term) => term.id === selectedTermId)?.name ?? "—" : "—"],
      ["Activity period", `${summary.period.from ?? "All time"} to ${summary.period.to}`],
      ["Balances as of", summary.balanceAsOf],
      ["Reconciliation status", summary.reconciliation.status],
      ["Billed (GHS)", Number(summary.billed)],
      ["Collected (GHS)", Number(summary.collected)],
      ["Outstanding (GHS)", Number(summary.outstanding)],
      ["Overdue (GHS)", Number(summary.overdue)],
      ["Collection rate (%)", summary.collectionRate == null ? "—" : Number(summary.collectionRate)],
      ["Generated at", new Date().toISOString()],
    ]);
    info.getColumn(1).width = 24;
    info.getColumn(2).width = 38;
    [8,9,10,11].forEach((row) => { info.getCell(row,2).numFmt = "#,##0.00"; });
    const classes = workbook.addWorksheet("By class", { views: [{ state: "frozen", ySplit: 1 }] });
    classes.columns = [
      { header: "Class", key: "className", width: 28 },
      { header: "Billed (GHS)", key: "billed", width: 18, style: { numFmt: "#,##0.00" } },
      { header: "Collected (GHS)", key: "collected", width: 18, style: { numFmt: "#,##0.00" } },
      { header: "Outstanding (GHS)", key: "outstanding", width: 20, style: { numFmt: "#,##0.00" } },
      { header: "Bill count", key: "billCount", width: 14 },
    ];
    summary.byClass.forEach((row) => classes.addRow({ className: row.className, billed: Number(row.billed), collected: Number(row.collected), outstanding: Number(row.outstanding), billCount: row.billCount }));
    classes.getRow(1).font = { bold: true };
    const methods = workbook.addWorksheet("By method");
    methods.columns = [
      { header: "Payment method", key: "method", width: 24 },
      { header: "Collected (GHS)", key: "amount", width: 20, style: { numFmt: "#,##0.00" } },
      { header: "Receipt count", key: "receiptCount", width: 16 },
    ];
    summary.byMethod.forEach((row) => methods.addRow({ method: row.method, amount: Number(row.amount), receiptCount: row.receiptCount }));
    methods.getRow(1).font = { bold: true };
    const bytes = await workbook.xlsx.writeBuffer();
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "school-finance-report.xlsx";
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  };

  return <section className="space-y-5">
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Finance</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground">Finance reports</h2><p className="mt-2 text-sm text-muted-foreground">Reports are calculated on the server using all matching school records, not the currently displayed page.</p></div><div className="flex gap-2"><button type="button" className={secondaryButton} onClick={() => window.print()}><Printer className="size-4" /> Print</button><button type="button" className={secondaryButton} onClick={exportPdf} disabled={!summary}><FileText className="size-4" /> PDF</button><button type="button" className={secondaryButton} onClick={() => void exportExcel()} disabled={!summary}><FileSpreadsheet className="size-4" /> Excel</button></div></div>
      <div className="mt-5 grid gap-3 md:grid-cols-[190px_1fr_1fr]">
        <select className={inputClass} value={scope} onChange={(event) => setScope(event.target.value as typeof scope)} aria-label="Report scope"><option value="term">Academic term</option><option value="year">Academic year</option><option value="all">All time</option></select>
        {scope !== "all" ? <select className={inputClass} value={selectedYearId} onChange={(event) => { setYearId(event.target.value); setTermId(""); }} aria-label="Academic year">{years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select> : <div />}
        {scope === "term" ? <select className={inputClass} value={selectedTermId} onChange={(event) => setTermId(event.target.value)} aria-label="Academic term">{(selectedYear?.terms ?? []).map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}</select> : <div />}
      </div>
    </div>
    <section className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-lg font-semibold text-foreground">Historical receivables ledger</h3>
      <p className="mt-1 text-sm text-muted-foreground">Reconstruct invoice balances, payments and reversals as of a chosen date. This is distinct from today's open receivables.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label htmlFor="historical-as-of" className="text-sm text-muted-foreground">Balance as of</label>
        <input id="historical-as-of" className={inputClass} style={{ maxWidth: 230 }} type="date" max={new Date().toISOString().slice(0, 10)} value={historyDate} onChange={(event) => setHistoryDate(event.target.value)} />
      </div>
      {historicalQuery.isPending && historyDate && <p role="status" className="mt-3 text-sm text-muted-foreground">Reconstructing historical ledger…</p>}
      {historicalQuery.isError && <p role="alert" className="mt-3 text-sm text-destructive">{historicalQuery.error.message}</p>}
      {historicalQuery.data && <div className="mt-4 space-y-4">
        {!historicalQuery.data.complete && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <p className="font-semibold">Provisional historical totals — do not use for audited close-out</p>
          <p>{historicalQuery.data.warning}</p>
          <ul className="mt-2 list-disc pl-5">{historicalQuery.data.exceptions.slice(0, 15).map((row, index) => <li key={index}>{row.reference}: {row.issue}</li>)}</ul>
          {historicalQuery.data.exceptions.length > 15 && <p>{historicalQuery.data.exceptions.length - 15} additional exceptions</p>}
        </div>}
        <div className="grid gap-3 sm:grid-cols-3">
          {([["Historical billed",historicalQuery.data.billed],["Payments applied",historicalQuery.data.collected],["Historical outstanding",historicalQuery.data.outstanding]] as const).map(([label, value]) => <div key={label} className="rounded-xl bg-muted/40 p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold tabular-nums">{money(value)}</p></div>)}
        </div>
        <p className="text-sm text-muted-foreground">As at {historicalQuery.data.asOf}. Not yet due: {money(historicalQuery.data.ageing.notDue)}; 1–30 days: {money(historicalQuery.data.ageing.days0To30)}; 31–60 days: {money(historicalQuery.data.ageing.days31To60)}; 61–90 days: {money(historicalQuery.data.ageing.days61To90)}; over 90 days: {money(historicalQuery.data.ageing.days90Plus)}.</p>
        <DataTable rows={historicalQuery.data.invoices} columns={[
          { id: "bill", header: "Invoice", cell: (row) => row.billNumber, value: (row) => row.billNumber },
          { id: "student", header: "Student", cell: (row) => row.admissionNumber ?? row.studentId, value: (row) => row.admissionNumber ?? row.studentId },
          { id: "issued", header: "Issued", cell: (row) => row.issuedAt, value: (row) => row.issuedAt },
          { id: "due", header: "Due", cell: (row) => row.dueDate ?? "—", value: (row) => row.dueDate ?? "" },
          { id: "billed", header: "Billed", cell: (row) => money(row.billed), value: (row) => Number(row.billed) },
          { id: "collected", header: "Applied", cell: (row) => money(row.collected), value: (row) => Number(row.collected) },
          { id: "balance", header: "Balance", cell: (row) => money(row.outstanding), value: (row) => Number(row.outstanding) },
        ] satisfies DataTableColumn<HistoricalReceivables["invoices"][number]>[]} getRowId={(row) => row.billId} embedded exportTitle="Historical receivables" searchable={false} emptyTitle="No historical invoices" emptyDescription="There are no invoices on or before this date." />
      </div>}
    </section>
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Accounts receivable close-readiness</h3>
          <p className="mt-1 text-sm text-muted-foreground">Verify school fee receivables, student balances, receipt allocations and general-ledger control totals before attempting financial period close.</p>
        </div>
        <button type="button" className={secondaryButton} onClick={() => setCloseReadinessVisible((visible) => !visible)}>
          {closeReadinessVisible ? "Hide checks" : "Review discrepancies"}
        </button>
      </div>
      {closeReadinessVisible && closeReadinessQuery.isPending && <p role="status" className="mt-3 text-sm text-muted-foreground">Checking accounting controls…</p>}
      {closeReadinessVisible && closeReadinessQuery.isError && <p role="alert" className="mt-3 text-sm text-destructive">{closeReadinessQuery.error.message}</p>}
      {closeReadinessVisible && closeReadinessQuery.data && <div className="mt-4 space-y-4">
        <div role="status" className="text-sm font-semibold">{closeReadinessQuery.data.closeReady ? "All current receivables checks passed" : "Not ready for accounting close — review exceptions"}</div>
        <p className="text-sm text-muted-foreground">{closeReadinessQuery.data.warning}</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {([
            ["Open invoices", closeReadinessQuery.data.openInvoices],
            ["Student balances", closeReadinessQuery.data.studentBalances],
            ["Posted receivables", closeReadinessQuery.data.journalReceivables],
            ["Cached control account", closeReadinessQuery.data.cachedReceivables],
          ] as const).map(([label, value]) => <div key={label} className="rounded-xl bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold tabular-nums">{money(value)}</p></div>)}
        </div>
        <div className="space-y-2">
          {closeReadinessQuery.data.checks.map((check) => <div key={check.code} className="rounded-lg border border-border p-3">
            <p className="text-sm font-semibold">{check.code.replaceAll("_", " ")} — {check.status}</p>
            <p className="text-xs text-muted-foreground">{check.details} Difference: {money(check.difference)}{check.exceptionCount === undefined ? "" : "; exceptions: " + check.exceptionCount}.</p>
          </div>)}
        </div>
      </div>}
    </section>
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="text-lg font-semibold text-foreground">Posted-journal trial balance</h3>
        <p className="mt-1 text-sm text-muted-foreground">Double-entry verification of saved journal transactions. This is not yet a complete accrual-basis trial balance.</p></div>
        <button type="button" className={secondaryButton} onClick={() => setTrialBalanceVisible((visible) => !visible)}>{trialBalanceVisible ? "Hide trial balance" : "View trial balance"}</button>
      </div>
      {trialBalanceVisible && trialBalanceQuery.isPending && <p role="status" className="mt-3 text-sm text-muted-foreground">Reconciling posted transactions…</p>}
      {trialBalanceVisible && trialBalanceQuery.isError && <p role="alert" className="mt-3 text-sm text-destructive">{trialBalanceQuery.error.message}</p>}
      {trialBalanceVisible && trialBalanceQuery.data && <div className="mt-4 space-y-3">
        <p className="text-sm text-muted-foreground">{trialBalanceQuery.data.warning}</p>
        <p className="text-sm font-semibold">Debit: {money(trialBalanceQuery.data.totalDebits)} · Credit: {money(trialBalanceQuery.data.totalCredits)} · Difference: {money(trialBalanceQuery.data.difference)} · {trialBalanceQuery.data.balanced ? "Journal balances" : "Journal discrepancy"}</p>
        {trialBalanceQuery.data.cachedAccountMismatchCount !== null && trialBalanceQuery.data.cachedAccountMismatchCount > 0 && <p role="alert" className="text-sm text-destructive">{trialBalanceQuery.data.cachedAccountMismatchCount} account balances differ from the journal movements. Investigate opening balances and prior postings.</p>}
        <DataTable rows={trialBalanceQuery.data.accounts} columns={[
          { id: "code", header: "Code", cell: (row) => row.code, value: (row) => row.code },
          { id: "account", header: "Account", cell: (row) => row.name, value: (row) => row.name },
          { id: "type", header: "Type", cell: (row) => row.accountType, value: (row) => row.accountType },
          { id: "debit", header: "Debit", cell: (row) => money(row.debit), value: (row) => Number(row.debit) },
          { id: "credit", header: "Credit", cell: (row) => money(row.credit), value: (row) => Number(row.credit) },
        ] satisfies DataTableColumn<TrialBalance["accounts"][number]>[]} getRowId={(row) => row.accountId} embedded searchable={false} exportTitle="Posted journal trial balance" emptyTitle="No journal accounts" emptyDescription="No chart-of-accounts records exist yet."/>
      </div>}
    </section>
    {summaryQuery.isPending || yearsQuery.isPending ? <div role="status" className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-12 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Calculating report from saved records…</div> : null}
    {summaryQuery.isError ? <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">The finance report could not be loaded. {summaryQuery.error.message}</div> : null}
    {summary && <div className="finance-report-print space-y-5">
      <section className="rounded-2xl border border-border bg-card p-4 text-sm">
        <p className="font-semibold text-foreground">Reporting basis</p>
        <p className="mt-1 text-muted-foreground">Invoices and receipts: {summary.period.from ?? "All time"} to {summary.period.to}, using issue dates and receipt dates respectively. Outstanding balances and ageing: current open receivables as of {summary.balanceAsOf}, including unpaid invoices from earlier terms. These are not reconstructed historical closing balances.</p>
      </section>
      {summary.reconciliation.status === "DISCREPANCY" && <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        <p className="font-semibold">Finance reconciliation requires attention</p>
        <p className="mt-1">Ageing difference: {money(summary.reconciliation.ageingDifference)}. Invoice/item mismatches: {summary.reconciliation.invoiceItemMismatchCount}; student balance mismatches: {summary.reconciliation.studentBalanceMismatchCount}; receipt allocation mismatches: {summary.reconciliation.receiptAllocationMismatchCount}; ledger mismatches: {summary.reconciliation.ledgerMismatchCount}. Investigate before relying on this report for close-out.</p>
      </div>}
      {summary.reconciliation.status === "RECONCILED" && <p className="text-sm text-muted-foreground">Current receivables, ageing, allocations and ledger summary checks reconcile.</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Billed", summary.billed, summary.billedCount + " invoices"],
          ["Collected", summary.collected, summary.receiptCount + " receipts"],
          ["Outstanding", summary.outstanding, summary.outstandingBillCount + " open bills"],
          ["Overdue", summary.overdue, summary.overdueBillCount + " overdue bills"],
          ["Collection rate", summary.collectionRate == null ? "—" : summary.collectionRate + "%", "Server-calculated"],
        ].map(([label, value, detail]) => <div key={label} className="rounded-2xl border border-border bg-card p-4"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-2 text-xl font-bold tabular-nums text-foreground">{label === "Collection rate" ? value : money(value ?? "0.00")}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>)}
      </div>
      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-lg font-semibold text-foreground">Receivables ageing</h3><p className="mt-1 text-sm text-muted-foreground">Open balance aged from each bill's due date, as of {summary.asOf}.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[["Not due",summary.ageing.notDue],["0–30 days",summary.ageing.days0To30],["31–60 days",summary.ageing.days31To60],["61–90 days",summary.ageing.days61To90],["90+ days",summary.ageing.days90Plus]].map(([label,value])=><div key={label} className="rounded-xl bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold tabular-nums text-foreground">{money(value ?? "0.00")}</p></div>)}</div>
      </section>
      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5"><h3 className="text-lg font-semibold text-foreground">Totals by class</h3><div className="mt-4"><DataTable rows={summary.byClass} columns={[
{ id: "class", header: "Class", cell: (row) => row.className, value: (row) => row.className },
{ id: "billed", header: "Billed", cell: (row) => money(row.billed), value: (row) => Number(row.billed), className: "text-right tabular-nums" },
{ id: "collected", header: "Collected", cell: (row) => money(row.collected), value: (row) => Number(row.collected), className: "text-right tabular-nums" },
{ id: "outstanding", header: "Outstanding", cell: (row) => money(row.outstanding), value: (row) => Number(row.outstanding), className: "text-right tabular-nums" },
{ id: "bills", header: "Bills", cell: (row) => row.billCount, value: (row) => row.billCount, className: "text-right tabular-nums" }
] satisfies DataTableColumn<(typeof summary.byClass)[number]>[]} getRowId={(row) => row.classId ?? "__unassigned"} emptyTitle="No bill records" emptyDescription="No bill records in this scope." embedded searchable={false} exportTitle="Totals by class" /></div></div>
        <div className="rounded-2xl border border-border bg-card p-5"><h3 className="text-lg font-semibold text-foreground">Collections by method</h3><div className="mt-4"><DataTable rows={summary.byMethod} columns={[
{ id: "method", header: "Method", cell: (row) => row.method.replaceAll("_", " "), value: (row) => row.method },
{ id: "collected", header: "Collected", cell: (row) => money(row.amount), value: (row) => Number(row.amount), className: "text-right tabular-nums" },
{ id: "receipts", header: "Receipts", cell: (row) => row.receiptCount, value: (row) => row.receiptCount, className: "text-right tabular-nums" }
] satisfies DataTableColumn<(typeof summary.byMethod)[number]>[]} getRowId={(row) => row.method} emptyTitle="No completed receipts" emptyDescription="No completed receipts in this scope." embedded searchable={false} exportTitle="Collections by method" /></div></div>
      </section>
      <p className="border-t border-border pt-3 text-xs leading-5 text-muted-foreground">Generated from saved SchoolHub data. Billed and collected totals use the selected academic context; outstanding and overdue include earlier unpaid bills carried forward into receivables. Data source: current bills and receipt allocations pending the dedicated receivables-ledger phase.</p>
      <style>{`@media print { body * { visibility: hidden !important; } .finance-report-print, .finance-report-print * { visibility: visible !important; } .finance-report-print { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; background: white !important; color: black !important; padding: 6mm !important; } @page { size: A4 landscape; margin: 8mm; } }`}</style>
    </div>}
  </section>;
}
