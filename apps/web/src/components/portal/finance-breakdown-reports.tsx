import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { apiFetch, getClientSubdomain } from "@/lib/api";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface AcademicTerm { id: string; name: string; isCurrent: boolean; startDate?: string; endDate?: string }
interface AcademicYear { id: string; name: string; isCurrent: boolean; startDate?: string; endDate?: string; terms: AcademicTerm[] }
interface Line { name: string; group: string; amount: string; count: number; sharePercent: string }
interface IncomeBreakdown {
  period: { from: string | null; to: string | null };
  totalIncome: string;
  feesCollected: { total: string; receiptCount: number; components: Line[]; byCategory: Array<{ name: string; amount: string; sharePercent: string }> };
  otherIncome: { total: string; items: Line[] };
  note: string | null;
}
interface ExpenditureBreakdown {
  period: { from: string | null; to: string | null };
  total: string; recordedExpenses: string; payroll: string; categories: Line[];
}
type Scope = "term" | "year" | "all";

const money = (value: string | number) => new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 2 }).format(Number(value) || 0);
const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const tab = (active: boolean) => cn("rounded-lg px-3 py-1.5 text-sm font-semibold transition", active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted");

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="rounded-xl border border-border bg-muted/30 p-3">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="mt-1 text-lg font-bold tabular-nums text-foreground">{value}</p>
    {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
  </div>;
}

/** One horizontal bar split by share, with a legend that spells out each amount. */
function ShareBar({ parts }: { parts: Array<{ name: string; amount: string; sharePercent: string }> }) {
  const visible = parts.filter(part => Number(part.amount) > 0);
  if (!visible.length) return null;
  return <div className="space-y-2">
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label="Share of total by component">
      {visible.map((part, i) => <div key={part.name} style={{ width: `${Number(part.sharePercent)}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} title={`${part.name}: ${money(part.amount)}`} />)}
    </div>
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {visible.map((part, i) => <li key={part.name} className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
        <span className="text-foreground">{part.name}</span> {money(part.amount)} ({part.sharePercent}%)
      </li>)}
    </ul>
  </div>;
}

function lineColumns(groupHeader: string, countHeader: string): DataTableColumn<Line>[] {
  return [
    { id: "name", header: "Component", cell: line => <span className="font-medium text-foreground">{line.name}</span>, value: line => line.name },
    { id: "group", header: groupHeader, cell: line => line.group, value: line => line.group },
    { id: "amount", header: "Amount (GHS)", cell: line => money(line.amount), value: line => Number(line.amount), className: "text-right tabular-nums" },
    { id: "share", header: "Share of total", cell: line => `${line.sharePercent}%`, value: line => Number(line.sharePercent), className: "text-right tabular-nums" },
    { id: "count", header: countHeader, cell: line => line.count, value: line => line.count, className: "text-right tabular-nums" },
  ];
}

function Block({ title, total, children }: { title: string; total?: string; children: ReactNode }) {
  return <div className="space-y-3">
    <div className="flex items-baseline justify-between gap-3"><h4 className="text-sm font-semibold text-foreground">{title}</h4>{total && <span className="text-sm font-bold tabular-nums text-foreground">{money(total)}</span>}</div>
    {children}
  </div>;
}

/** Income split by fee component (school fees, stationery, ...) and other income; expenditure split by category. */
export function FinanceBreakdownReports() {
  const schoolScope = getClientSubdomain();
  const [scope, setScope] = useState<Scope>("term");
  const [yearId, setYearId] = useState("");
  const [termId, setTermId] = useState("");

  const yearsQuery = useQuery({
    queryKey: ["schools", "academic-years", schoolScope],
    queryFn: () => apiFetch<AcademicYear[]>("/schools/academic-years"),
    enabled: scope !== "all", retry: false,
  });
  const years = yearsQuery.data ?? [];
  const selectedYear = years.find(y => y.id === yearId) ?? years.find(y => y.isCurrent) ?? years[0];
  const selectedTerm = selectedYear?.terms.find(t => t.id === termId) ?? selectedYear?.terms.find(t => t.isCurrent) ?? selectedYear?.terms[0];
  const periodReady = scope === "all" || (yearsQuery.isSuccess && (scope === "year" ? !!selectedYear : !!selectedTerm));
  const params = new URLSearchParams();
  if (scope !== "all" && selectedYear) params.set("yearId", selectedYear.id);
  if (scope === "term" && selectedTerm) params.set("termId", selectedTerm.id);
  const qs = params.size ? `?${params.toString()}` : "";

  const income = useQuery({
    queryKey: ["finance", "income-breakdown", schoolScope, qs],
    queryFn: () => apiFetch<IncomeBreakdown>(`/finance/reports/income-breakdown${qs}`),
    enabled: periodReady, retry: false, staleTime: 30_000,
  });
  const expenditure = useQuery({
    queryKey: ["finance", "expenditure-breakdown", schoolScope, qs],
    queryFn: () => apiFetch<ExpenditureBreakdown>(`/finance/reports/expenditure-breakdown${qs}`),
    enabled: periodReady, retry: false, staleTime: 30_000,
  });

  const i = income.data;
  const e = expenditure.data;
  const surplus = i && e ? Number(i.totalIncome) - Number(e.total) : null;
  const periodLabel = (p?: { from: string | null; to: string | null }) => p ? `${p.from ?? "start"} to ${p.to ?? "today"}` : "";

  return <section className="space-y-5 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h3 className="text-lg font-semibold text-foreground">Income and expenditure breakdown</h3>
        <p className="mt-1 text-sm text-muted-foreground">Where the money came from and where it went, by fee component and expense category. Cash basis: receipts by payment date, expenses by expense date, payroll when paid.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-border bg-background p-1" role="tablist" aria-label="Report period">
          {(["term", "year", "all"] as const).map(option => <button key={option} role="tab" aria-selected={scope === option} type="button" className={tab(scope === option)} onClick={() => setScope(option)}>{option === "term" ? "Term" : option === "year" ? "Academic year" : "All time"}</button>)}
        </div>
        {scope !== "all" && years.length > 0 && <Select value={selectedYear?.id ?? ""} onValueChange={value => { setYearId(value); setTermId(""); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Year" /></SelectTrigger>
          <SelectContent>{years.map(y => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}</SelectContent>
        </Select>}
        {scope === "term" && selectedYear && <Select value={selectedTerm?.id ?? ""} onValueChange={setTermId}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Term" /></SelectTrigger>
          <SelectContent>{selectedYear.terms.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
        </Select>}
      </div>
    </div>

    {(income.isPending || expenditure.isPending) && periodReady && <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading breakdown…</p>}
    {(income.error || expenditure.error) && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{(income.error ?? expenditure.error)!.message}</p>}

    {i && <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Total income" value={money(i.totalIncome)} hint={periodLabel(i.period)} />
        <Stat label="Fees collected" value={money(i.feesCollected.total)} hint={`${i.feesCollected.receiptCount} receipts`} />
        <Stat label="Other income" value={money(i.otherIncome.total)} hint="Donations, grants and similar" />
      </div>
      <Block title="Fees collected, by fee component" total={i.feesCollected.total}>
        <ShareBar parts={i.feesCollected.byCategory} />
        <DataTable rows={i.feesCollected.components} columns={lineColumns("Fee category", "Receipts")} getRowId={line => `${line.group}|${line.name}`}
          emptyTitle="No fees collected" emptyDescription="No completed receipts fall in this period." exportTitle="Fees collected by component" searchable={false} embedded />
      </Block>
      {i.otherIncome.items.length > 0 && <Block title="Other income" total={i.otherIncome.total}>
        <DataTable rows={i.otherIncome.items} columns={lineColumns("Type", "Entries")} getRowId={line => line.name}
          emptyTitle="No other income" emptyDescription="Nothing recorded." exportTitle="Other income" searchable={false} embedded />
      </Block>}
      {i.note && <p className="text-xs text-muted-foreground">{i.note}</p>}
    </div>}

    {e && <div className="space-y-5 border-t border-border pt-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Total expenditure" value={money(e.total)} hint={periodLabel(e.period)} />
        <Stat label="Recorded expenses" value={money(e.recordedExpenses)} />
        <Stat label="Payroll paid" value={money(e.payroll)} hint="Gross pay + employer SSNIT" />
      </div>
      <Block title="Expenditure, by category" total={e.total}>
        <ShareBar parts={e.categories} />
        <DataTable rows={e.categories} columns={lineColumns("Source", "Entries").map(col => col.id === "name" ? { ...col, header: "Category" } : col)} getRowId={line => `${line.group}|${line.name}`}
          emptyTitle="No expenditure" emptyDescription="No expenses or paid payroll fall in this period." exportTitle="Expenditure by category" searchable={false} embedded />
      </Block>
      {surplus !== null && <p className={cn("rounded-xl p-3 text-sm", surplus >= 0 ? "bg-success/5 text-foreground" : "bg-destructive/5 text-destructive")}>
        Income less expenditure for this period: <strong className="tabular-nums">{money(surplus)}</strong>
      </p>}
    </div>}
  </section>;
}
