import { Activity, ChartColumn, ChartPie, WalletCards, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface FinanceSummary {
  billed: string;
  collected: string;
  outstanding: string;
  overdue: string;
  collectionRate: string | null;
  byMethod: { method: string; amount: string; receiptCount: number }[];
  byClass: { classId: string | null; className: string; billed: string; collected: string; outstanding: string; billCount: number }[];
  ageing: { days0To30: string; days31To60: string; days61To90: string; days90Plus: string; notDue: string };
}
interface ExpenseRecord { amount: number | string; date: string; category?: string | null; customCategory?: { name: string } | null; registryCategory?: { name: string } | null; }
interface Props { summary: FinanceSummary | null; expenses: ExpenseRecord[]; }

const money = (value: number | string) =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 2 }).format(Number(value) || 0);
const tooltipStyle = { backgroundColor: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--popover-foreground)", fontSize: 12 };
const tickStyle = { fill: "var(--muted-foreground)", fontSize: 11 };
const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function ChartPanel({ title, description, icon: Icon, children }: { title: string; description: string; icon: LucideIcon; children: ReactNode }) {
  return <article className="min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"><div className="mb-4 flex items-start gap-2"><span className="rounded-lg bg-muted p-2"><Icon className="size-4 text-primary" /></span><div><h3 className="text-sm font-semibold text-foreground">{title}</h3><p className="mt-1 text-xs text-muted-foreground">{description}</p></div></div>{children}</article>;
}
function ChartEmpty({ children }: { children: string }) {
  return <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-border px-5 text-center text-sm text-muted-foreground">{children}</div>;
}

export function AccountantFinanceCharts({ summary, expenses }: Props) {
  if (!summary) return <ChartEmpty>Server finance analytics are unavailable. The charts are not estimated from the current page of records.</ChartEmpty>;
  const classRows = summary.byClass
    .map((row) => ({ name: row.className, billed: Number(row.billed), collected: Number(row.collected), outstanding: Number(row.outstanding) }))
    .sort((a, b) => b.billed - a.billed)
    .slice(0, 8);
  const methodRows = summary.byMethod.map((row) => ({
    name: row.method.replaceAll("_", " "),
    amount: Number(row.amount),
    receipts: row.receiptCount,
  }));
  const ageing = [
    { name: "Not due", amount: Number(summary.ageing.notDue) },
    { name: "0–30 days", amount: Number(summary.ageing.days0To30) },
    { name: "31–60 days", amount: Number(summary.ageing.days31To60) },
    { name: "61–90 days", amount: Number(summary.ageing.days61To90) },
    { name: "90+ days", amount: Number(summary.ageing.days90Plus) },
  ];
  const expenseTotal = expenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const expenseGroups = new Map<string, number>();
  for (const expense of expenses) {
    const label = expense.customCategory?.name ?? expense.registryCategory?.name ?? expense.category ?? "Other";
    expenseGroups.set(label, (expenseGroups.get(label) ?? 0) + (Number(expense.amount) || 0));
  }
  const expenseRows = [...expenseGroups.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 8);

  return <section aria-label="Finance analytics" className="space-y-5">
    <div className="grid gap-5 xl:grid-cols-3">
      <ChartPanel title="Collections by payment method" description={`${money(summary.collected)} collected for the selected academic period`} icon={ChartPie}>
        {methodRows.length ? <ResponsiveContainer width="100%" height={230}><PieChart><Pie data={methodRows} dataKey="amount" nameKey="name" innerRadius={48} outerRadius={82} paddingAngle={2} stroke="var(--card)">{methodRows.map((row, index) => <Cell key={row.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}</Pie><Tooltip formatter={(value) => money(String(value ?? 0))} contentStyle={tooltipStyle} /><Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} /></PieChart></ResponsiveContainer> : <ChartEmpty>No completed collections in this period.</ChartEmpty>}
      </ChartPanel>
      <ChartPanel title="Receivables ageing" description="Open balances grouped by days past due" icon={WalletCards}>
        <div className="space-y-3 py-2">{ageing.map((row) => <div key={row.name}><div className="mb-1 flex justify-between gap-3 text-xs"><span className="text-muted-foreground">{row.name}</span><span className="font-semibold tabular-nums">{money(row.amount)}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Number(summary.outstanding) > 0 ? Math.min(100, Math.max(0, row.amount / Number(summary.outstanding) * 100)) : 0}%` }} /></div></div>)}</div>
      </ChartPanel>
      <ChartPanel title="Expenses by category" description={`${money(expenseTotal)} in currently loaded expense records`} icon={Activity}>
        {expenseRows.length ? <ResponsiveContainer width="100%" height={230}><BarChart data={expenseRows} layout="vertical" margin={{ left: 8, right: 10 }}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} /><XAxis type="number" tick={tickStyle} tickFormatter={(value) => Number(value).toLocaleString("en-GH")} /><YAxis type="category" dataKey="name" tick={tickStyle} width={94} /><Tooltip formatter={(value) => money(String(value ?? 0))} contentStyle={tooltipStyle} /><Bar dataKey="amount" name="Expenses" fill="var(--chart-2)" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer> : <ChartEmpty>No expense records available.</ChartEmpty>}
      </ChartPanel>
    </div>
    <ChartPanel title="Billed, collected and outstanding by class" description="Values are computed on the server from all matching school records, not only the current list page." icon={ChartColumn}>
      {classRows.length ? <ResponsiveContainer width="100%" height={300}><BarChart data={classRows} margin={{ left: 4, right: 10, bottom: 20 }}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="name" tick={tickStyle} angle={-15} textAnchor="end" height={56} /><YAxis tick={tickStyle} tickFormatter={(value) => Number(value).toLocaleString("en-GH")} /><Tooltip formatter={(value) => money(String(value ?? 0))} contentStyle={tooltipStyle} /><Bar dataKey="billed" name="Billed" fill="var(--chart-1)" radius={[4, 4, 0, 0]} /><Bar dataKey="collected" name="Collected" fill="var(--chart-2)" radius={[4, 4, 0, 0]} /><Bar dataKey="outstanding" name="Outstanding" fill="var(--chart-3)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer> : <ChartEmpty>No bill/class data available for this period.</ChartEmpty>}
    </ChartPanel>
  </section>;
}
