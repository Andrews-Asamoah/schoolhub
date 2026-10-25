import { useMemo, type ReactNode } from "react";
import { ChartColumn, ChartPie, WalletCards, Activity, CalendarClock } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FinanceSummaryResponse } from "@schoolhub/shared";

interface ExpenseRecord {
  amount: number | string;
  date: string;
  category?: string | null;
  customCategory?: { name: string } | null;
  registryCategory?: { name: string } | null;
}
interface AccountantFinanceChartsProps {
  summary?: FinanceSummaryResponse;
  expenses: ExpenseRecord[];
  loading?: boolean;
  error?: string;
}

const money = (value: number) =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0);
const tooltipStyle = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  color: "var(--popover-foreground)",
  fontSize: 12,
};
const tickStyle = { fill: "var(--muted-foreground)", fontSize: 11 };
const categoryLabel = (value?: string | null) =>
  (value?.trim() || "OTHER").replaceAll("_", " ").toLocaleLowerCase("en-GB").replace(/\b\w/g, (letter) => letter.toUpperCase());

function ChartPanel({ title, description, icon: Icon, children }: {
  title: string;
  description: string;
  icon: typeof Activity;
  children: ReactNode;
}) {
  return (
    <article className="min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex items-start gap-2">
        <span className="rounded-lg bg-muted p-2"><Icon className="size-4 text-primary" /></span>
        <div><h3 className="text-sm font-semibold text-foreground">{title}</h3><p className="mt-1 text-xs text-muted-foreground">{description}</p></div>
      </div>
      {children}
    </article>
  );
}

function ChartEmpty({ children }: { children: string }) {
  return <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-border px-5 text-center text-sm text-muted-foreground">{children}</div>;
}

export function AccountantFinanceCharts({ summary, expenses, loading, error }: AccountantFinanceChartsProps) {
  const expenseSeries = useMemo(() => {
    const totals = new Map<string, number>();
    for (const expense of expenses) {
      const category = categoryLabel(expense.customCategory?.name ?? expense.registryCategory?.name ?? expense.category);
      totals.set(category, (totals.get(category) ?? 0) + (Number(expense.amount) || 0));
    }
    return [...totals.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 7);
  }, [expenses]);

  const methodSeries = (summary?.byPaymentMethod ?? []).map((row) => ({
    name: categoryLabel(row.method),
    amount: row.amount,
    receipts: row.count,
  })).sort((a, b) => b.amount - a.amount);

  const classSeries = (summary?.byClass ?? []).map((row) => ({
    name: row.className,
    billed: row.billed,
    collected: row.collected,
    outstanding: row.outstanding,
  })).sort((a, b) => b.billed - a.billed).slice(0, 10);

  const ageingSeries = (summary?.ageing ?? []).map((row) => ({
    name: row.bucket === "90+" ? "90+ days" : `${row.bucket} days`,
    amount: row.amount,
    bills: row.count,
  }));

  if (error) {
    return <section aria-label="Finance analytics" className="rounded-2xl border border-destructive/25 bg-destructive/5 p-5 text-sm text-destructive">Finance charts could not be loaded: {error}</section>;
  }

  return (
    <section aria-label="Finance analytics" className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <ChartPanel title="Collections by payment method" description="Completed receipts aggregated by the finance API for the selected academic period." icon={WalletCards}>
          {loading && !summary ? <ChartEmpty>Loading server totals…</ChartEmpty> : methodSeries.length ? (
            <div className="h-64 w-full min-w-0"><ResponsiveContainer width="100%" height="100%" minWidth={0}><BarChart data={methodSeries} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 4 }}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tickFormatter={(value: number) => value >= 1000 ? `₵${Math.round(value / 1000)}k` : `₵${value}`} tick={tickStyle} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="name" width={110} tick={tickStyle} axisLine={false} tickLine={false} /><Tooltip contentStyle={tooltipStyle} formatter={(value) => [money(Number(value ?? 0)), "Collections"]} /><Bar dataKey="amount" name="Collections" fill="#0d9488" radius={[0, 5, 5, 0]} maxBarSize={22} /></BarChart></ResponsiveContainer></div>
          ) : <ChartEmpty>Payment-method totals appear once completed receipts are recorded.</ChartEmpty>}
        </ChartPanel>

        <ChartPanel title="Billing and receivables by class" description="Billed and outstanding amounts calculated on the server, not from the visible page." icon={ChartColumn}>
          {loading && !summary ? <ChartEmpty>Loading server totals…</ChartEmpty> : classSeries.length ? (
            <div className="h-64 w-full min-w-0"><ResponsiveContainer width="100%" height="100%" minWidth={0}><BarChart data={classSeries} margin={{ top: 4, right: 8, left: 0, bottom: 16 }}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={tickStyle} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={52} /><YAxis tickFormatter={(value: number) => value >= 1000 ? `₵${Math.round(value / 1000)}k` : `₵${value}`} tick={tickStyle} axisLine={false} tickLine={false} /><Tooltip contentStyle={tooltipStyle} formatter={(value) => [money(Number(value ?? 0))]} /><Bar dataKey="billed" name="Billed" fill="#6366f1" radius={[4, 4, 0, 0]} /><Bar dataKey="outstanding" name="Outstanding" fill="#f59e0b" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
          ) : <ChartEmpty>Class totals appear once bills are issued.</ChartEmpty>}
        </ChartPanel>

        <ChartPanel title="Overdue balance ageing" description="Open balances bucketed by days past the due date; overdue status is derived by the API." icon={CalendarClock}>
          {loading && !summary ? <ChartEmpty>Loading server totals…</ChartEmpty> : ageingSeries.length ? (
            <div className="h-56 w-full min-w-0"><ResponsiveContainer width="100%" height="100%" minWidth={0}><BarChart data={ageingSeries} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={tickStyle} axisLine={false} tickLine={false} /><YAxis tickFormatter={(value: number) => value >= 1000 ? `₵${Math.round(value / 1000)}k` : `₵${value}`} tick={tickStyle} axisLine={false} tickLine={false} /><Tooltip contentStyle={tooltipStyle} formatter={(value) => [money(Number(value ?? 0)), "Overdue"]} /><Bar dataKey="amount" name="Overdue" fill="#dc2626" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div>
          ) : <ChartEmpty>Ageing data appears when bills remain unpaid after their due dates.</ChartEmpty>}
        </ChartPanel>

        <ChartPanel title="Expenses by category" description="Recorded expenses grouped by category for the selected academic period." icon={ChartPie}>
          {expenseSeries.length ? (
            <div className="h-56 w-full min-w-0"><ResponsiveContainer width="100%" height="100%" minWidth={0}><BarChart data={expenseSeries} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 4 }}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tickFormatter={(value: number) => value >= 1000 ? `₵${Math.round(value / 1000)}k` : `₵${value}`} tick={tickStyle} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="name" width={110} tick={tickStyle} axisLine={false} tickLine={false} /><Tooltip contentStyle={tooltipStyle} formatter={(value) => [money(Number(value ?? 0)), "Expenses"]} /><Bar dataKey="amount" name="Expenses" fill="#f59e0b" radius={[0, 5, 5, 0]} maxBarSize={22} /></BarChart></ResponsiveContainer></div>
          ) : <ChartEmpty>Expense categories appear once expenses have been recorded.</ChartEmpty>}
        </ChartPanel>
      </div>
    </section>
  );
}
