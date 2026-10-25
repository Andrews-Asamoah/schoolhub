import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChartColumn, FileDown, FileSpreadsheet, Printer, Search } from "lucide-react";
import type { FinanceSummaryResponse } from "@schoolhub/shared";
import { apiFetch } from "@/lib/api";
import { exportPdf, exportXlsx, printTable, type ExportTable } from "@/lib/table-export";

interface AcademicYearOption {
  id: string;
  name: string;
  isCurrent: boolean;
  startDate: string;
  endDate: string;
  terms: { id: string; name: string; isCurrent: boolean; startDate: string; endDate: string }[];
}

const money = (value: number) =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0);

export function AccountantFinanceReportingWorkspace() {
  const [scope, setScope] = useState<"term" | "year" | "all">("term");
  const [yearId, setYearId] = useState("");
  const [termId, setTermId] = useState("");
  const [classId, setClassId] = useState("ALL");
  const [search, setSearch] = useState("");

  const yearsQuery = useQuery({
    queryKey: ["schools", "academic-years"],
    queryFn: () => apiFetch<AcademicYearOption[]>("/schools/academic-years"),
    retry: false,
  });
  const years = yearsQuery.data ?? [];
  const activeYear = years.find((year) => year.id === yearId) ?? years.find((year) => year.isCurrent) ?? years[0];
  const activeTerm = activeYear?.terms.find((term) => term.id === termId) ?? activeYear?.terms.find((term) => term.isCurrent) ?? activeYear?.terms[0];

  const queryParams = new URLSearchParams();
  if (scope !== "all" && activeYear) queryParams.set("yearId", activeYear.id);
  if (scope === "term" && activeTerm) queryParams.set("termId", activeTerm.id);
  const summaryQuery = useQuery({
    queryKey: ["finance", "summary", "report", scope, activeYear?.id, activeTerm?.id],
    queryFn: () => apiFetch<FinanceSummaryResponse>(`/finance/summary?${queryParams.toString()}`),
    enabled: scope === "all" || Boolean(activeYear && (scope === "year" || activeTerm)),
    retry: false,
  });
  const summary = summaryQuery.data;

  const classRows = useMemo(() => (summary?.byClass ?? []).filter((row) => {
    const matchesClass = classId === "ALL" || row.classId === classId;
    const needle = search.trim().toLocaleLowerCase("en-GB");
    return matchesClass && (!needle || row.className.toLocaleLowerCase("en-GB").includes(needle));
  }), [summary?.byClass, classId, search]);

  const exportTable = useMemo<ExportTable | null>(() => {
    if (!summary) return null;
    const period = summary.scope.termName
      ? `${summary.scope.academicYearName} — ${summary.scope.termName}`
      : summary.scope.academicYearName ?? "All recorded periods";
    return {
      title: `SchoolHub finance report — ${period}`,
      headers: ["Class", "Bills", "Billed (GHS)", "Collected (GHS)", "Outstanding (GHS)"],
      rows: [
        ...classRows.map((row) => [row.className, row.billCount, row.billed, row.collected, row.outstanding]),
        ["TOTAL", classRows.reduce((sum, row) => sum + row.billCount, 0), classRows.reduce((sum, row) => sum + row.billed, 0), classRows.reduce((sum, row) => sum + row.collected, 0), classRows.reduce((sum, row) => sum + row.outstanding, 0)],
      ],
    };
  }, [summary, classRows]);

  const summaryCards = [
    { label: "Billed", value: summary?.billed ?? 0 },
    { label: "Collected", value: summary?.collected ?? 0 },
    { label: "Outstanding", value: summary?.outstanding ?? 0 },
    { label: "Overdue", value: summary?.overdue ?? 0 },
  ];

  return (
    <section className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-muted p-2"><ChartColumn className="size-5 text-primary" /></span>
          <div><h2 className="text-lg font-semibold text-foreground">Finance reporting workspace</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Reports use server-side aggregates over the selected academic term or year, not the first page of bills and payments.</p></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!exportTable} onClick={() => exportTable && printTable(exportTable)} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold disabled:opacity-50"><Printer className="size-4" /> Print</button>
          <button type="button" disabled={!exportTable} onClick={() => exportTable && void exportPdf(exportTable)} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold disabled:opacity-50"><FileDown className="size-4" /> PDF</button>
          <button type="button" disabled={!exportTable} onClick={() => exportTable && void exportXlsx(exportTable)} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold disabled:opacity-50"><FileSpreadsheet className="size-4" /> Excel</button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-semibold text-muted-foreground">Scope<select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)} className="mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"><option value="term">Academic term</option><option value="year">Academic year</option><option value="all">All recorded periods</option></select></label>
        {scope !== "all" && <label className="text-xs font-semibold text-muted-foreground">Academic year<select value={activeYear?.id ?? ""} onChange={(event) => { setYearId(event.target.value); setTermId(""); }} className="mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground" disabled={yearsQuery.isPending}>{years.map((year) => <option key={year.id} value={year.id}>{year.name}{year.isCurrent ? " (Current)" : ""}</option>)}</select></label>}
        {scope === "term" && <label className="text-xs font-semibold text-muted-foreground">Term<select value={activeTerm?.id ?? ""} onChange={(event) => setTermId(event.target.value)} className="mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground" disabled={!activeYear}>{(activeYear?.terms ?? []).map((term) => <option key={term.id} value={term.id}>{term.name}{term.isCurrent ? " (Current)" : ""}</option>)}</select></label>}
        <label className="text-xs font-semibold text-muted-foreground">Class<select value={classId} onChange={(event) => setClassId(event.target.value)} className="mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"><option value="ALL">All classes</option>{(summary?.byClass ?? []).filter((row) => row.classId).map((row) => <option key={row.classId!} value={row.classId!}>{row.className}</option>)}</select></label>
      </div>

      {scope !== "all" && !activeYear ? <div className="rounded-xl border border-warning/20 bg-warning/10 p-4 text-sm text-warning">Select or configure an academic year before running a report.</div> : null}
      {summaryQuery.isPending ? <div className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">Loading server-side finance report…</div>
        : summaryQuery.error ? <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">Finance report could not be loaded: {summaryQuery.error.message}</div>
          : summary ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{summaryCards.map((card) => <div key={card.label} className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">{card.label}</p><p className="mt-2 text-xl font-bold tracking-tight text-foreground tabular-nums">{money(card.value)}</p><p className="mt-1 text-xs text-muted-foreground">{summary.scope.termName ? `${summary.scope.academicYearName} · ${summary.scope.termName}` : summary.scope.academicYearName ?? "All time"}</p></div>)}</div>

              <div className="relative max-w-md"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter class summary" className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/30" /></div>
              <section className="overflow-hidden rounded-xl border border-border">
                <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground"><tr>{["Class", "Bills", "Billed", "Collected", "Outstanding"].map((label) => <th key={label} className="px-3 py-3 font-semibold">{label}</th>)}</tr></thead>
                  <tbody>
                    {classRows.map((row) => <tr key={row.classId ?? "none"} className="border-t border-border"><td className="px-3 py-3 font-medium">{row.className}</td><td className="px-3 py-3">{row.billCount}</td><td className="px-3 py-3 tabular-nums">{money(row.billed)}</td><td className="px-3 py-3 tabular-nums">{money(row.collected)}</td><td className="px-3 py-3 tabular-nums">{money(row.outstanding)}</td></tr>)}
                    {!classRows.length && <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">No class records match the selected filters.</td></tr>}
                    <tr className="border-t border-border bg-muted/20 font-bold"><td className="px-3 py-3">Filtered total</td><td className="px-3 py-3">{classRows.reduce((sum, row) => sum + row.billCount, 0)}</td><td className="px-3 py-3 tabular-nums">{money(classRows.reduce((sum, row) => sum + row.billed, 0))}</td><td className="px-3 py-3 tabular-nums">{money(classRows.reduce((sum, row) => sum + row.collected, 0))}</td><td className="px-3 py-3 tabular-nums">{money(classRows.reduce((sum, row) => sum + row.outstanding, 0))}</td></tr>
                  </tbody>
                </table></div>
              </section>

              <div className="grid gap-4 lg:grid-cols-2">
                <section className="rounded-xl border border-border p-4"><h3 className="font-semibold text-foreground">Collections by payment method</h3><div className="mt-3 divide-y divide-border">{summary.byPaymentMethod.map((row) => <div key={row.method} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="text-muted-foreground">{row.method.replaceAll("_", " ")}</span><span className="font-semibold tabular-nums">{money(row.amount)} <span className="text-xs font-normal text-muted-foreground">({row.count})</span></span></div>)}{!summary.byPaymentMethod.length && <p className="py-3 text-sm text-muted-foreground">No completed receipts in this scope.</p>}</div></section>
                <section className="rounded-xl border border-border p-4"><h3 className="font-semibold text-foreground">Overdue ageing</h3><div className="mt-3 divide-y divide-border">{summary.ageing.map((row) => <div key={row.bucket} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="text-muted-foreground">{row.bucket} days</span><span className="font-semibold tabular-nums">{money(row.amount)} <span className="text-xs font-normal text-muted-foreground">({row.count} bills)</span></span></div>)}</div></section>
              </div>
            </>
          ) : null}
    </section>
  );
}
