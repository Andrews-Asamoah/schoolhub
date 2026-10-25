import { useMemo } from "react";
import { Activity, ChartColumn, ChartPie, WalletCards } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface PaymentRecord {
  id?: string;
  amount: number | string;
  paymentDate: string;
  status: string;
  paymentMethod?: string;
  bill?: { id: string; billNumber?: string } | null;
}
interface ExpenseRecord {
  amount: number | string;
  date: string;
  category?: string | null;
  customCategory?: { name: string } | null;
  registryCategory?: { name: string } | null;
}
interface BillRecord {
  id: string;
  class?: { id: string; name: string } | null;
}
interface AccountantFinanceChartsProps {
  payments: PaymentRecord[];
  expenses: ExpenseRecord[];
  bills: BillRecord[];
}

const money = (value: number) =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 2 }).format(value);

const tooltipStyle = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  color: "var(--popover-foreground)",
  fontSize: 12,
};

const tickStyle = { fill: "var(--muted-foreground)", fontSize: 11 };
const isSettled = (status: string) => ["COMPLETED", "SUCCESS", "PAID"].includes(status.toUpperCase());
const categoryLabel = (value?: string | null) =>
  (value?.trim() || "OTHER").replaceAll("_", " ").toLocaleLowerCase("en-GB").replace(/\\b\\w/g, (letter) => letter.toUpperCase());

function ChartPanel({ title, description, icon: Icon, children }: {
  title: string;
  description: string;
  icon: typeof Activity;
  children: React.ReactNode;
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

export function AccountantFinanceCharts({ payments, expenses, bills }: AccountantFinanceChartsProps) {
  const { monthlySeries, totalCollected, totalExpenses, classSeries, expenseSeries, methodSeries } = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      return {
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
        month: new Intl.DateTimeFormat("en-GB", { month: "short" }).format(date),
        collected: 0,
        expenses: 0,
      };
    });
    const byMonth = new Map(months.map((month) => [month.key, month]));
    const classTotals = new Map<string, number>();
    const methodTotals = new Map<string, number>();
    const expenseTotals = new Map<string, number>();
    const billById = new Map(bills.map((bill) => [bill.id, bill]));

    for (const payment of payments) {
      if (!isSettled(payment.status)) continue;
      const amount = Number(payment.amount) || 0;
      const date = new Date(payment.paymentDate);
      if (!Number.isNaN(date.getTime())) {
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        const month = byMonth.get(key);
        if (month) month.collected += amount;
      }
      const className = payment.bill?.id ? billById.get(payment.bill.id)?.class?.name ?? "Class not recorded" : "Unallocated payment";
      classTotals.set(className, (classTotals.get(className) ?? 0) + amount);
      const method = categoryLabel(payment.paymentMethod);
      methodTotals.set(method, (methodTotals.get(method) ?? 0) + amount);
    }

    for (const expense of expenses) {
      const amount = Number(expense.amount) || 0;
      const date = new Date(expense.date);
      if (!Number.isNaN(date.getTime())) {
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        const month = byMonth.get(key);
        if (month) month.expenses += amount;
      }
      const category = categoryLabel(expense.customCategory?.name ?? expense.registryCategory?.name ?? expense.category);
      expenseTotals.set(category, (expenseTotals.get(category) ?? 0) + amount);
    }

    const sortAndLimit = (totals: Map<string, number>, limit = 7) =>
      [...totals.entries()]
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, limit);

    return {
      monthlySeries: months,
      totalCollected: months.reduce((sum, item) => sum + item.collected, 0),
      totalExpenses: months.reduce((sum, item) => sum + item.expenses, 0),
      classSeries: sortAndLimit(classTotals),
      expenseSeries: sortAndLimit(expenseTotals),
      methodSeries: sortAndLimit(methodTotals),
    };
  }, [payments, expenses, bills]);

  const hasMonthlyRecords = totalCollected > 0 || totalExpenses > 0;

  return (
    <section aria-label="Finance analytics" className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <article className="min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><Activity className="size-4 text-primary" /> Cash flow overview</div>
              <p className="mt-1 text-xs text-muted-foreground">Recorded collections and expenses · last six months</p>
            </div>
            <span className="rounded-full border border-border bg-muted/60 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">Live records</span>
          </div>
          <div className="mb-4 flex flex-wrap gap-5">
            <div><p className="text-xs text-muted-foreground">Collections</p><p className="mt-1 text-xl font-bold tracking-tight text-foreground">{money(totalCollected)}</p></div>
            <div><p className="text-xs text-muted-foreground">Expenses</p><p className="mt-1 text-xl font-bold tracking-tight text-foreground">{money(totalExpenses)}</p></div>
          </div>
          {hasMonthlyRecords ? (
            <div className="h-64 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <AreaChart data={monthlySeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="collectionsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0d9488" stopOpacity={0.28} /><stop offset="95%" stopColor="#0d9488" stopOpacity={0.01} /></linearGradient>
                    <linearGradient id="expensesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f59e0b" stopOpacity={0.2} /><stop offset="95%" stopColor="#f59e0b" stopOpacity={0.01} /></linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={tickStyle} />
                  <YAxis tickFormatter={(value: number) => value >= 1000 ? `₵${Math.round(value / 1000)}k` : `₵${value}`} width={48} tickLine={false} axisLine={false} tick={tickStyle} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [money(Number(value ?? 0))]} />
                  <Area type="monotone" dataKey="collected" name="Collections" stroke="#0d9488" strokeWidth={2.5} fill="url(#collectionsFill)" activeDot={{ r: 4 }} />
                  <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#f59e0b" strokeWidth={2.5} fill="url(#expensesFill)" activeDot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : <ChartEmpty>Cash-flow trends will appear when completed payments or expenses have been recorded in the last six months.</ChartEmpty>}
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground"><span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-teal-600" /> Collections</span><span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-amber-500" /> Expenses</span></div>
        </article>
        <article className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><WalletCards className="size-4 text-primary" /> Finance snapshot</div>
          <p className="mt-1 text-xs text-muted-foreground">Summary of recorded transactions in the displayed period</p>
          <div className="mt-5 space-y-5">
            <div><div className="mb-2 flex items-center justify-between gap-3 text-xs"><span className="text-muted-foreground">Collections</span><span className="font-semibold tabular-nums text-foreground">{money(totalCollected)}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-teal-600" style={{ width: `${totalCollected + totalExpenses ? totalCollected / (totalCollected + totalExpenses) * 100 : 0}%` }} /></div></div>
            <div><div className="mb-2 flex items-center justify-between gap-3 text-xs"><span className="text-muted-foreground">Expenses</span><span className="font-semibold tabular-nums text-foreground">{money(totalExpenses)}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-amber-500" style={{ width: `${totalCollected + totalExpenses ? totalExpenses / (totalCollected + totalExpenses) * 100 : 0}%` }} /></div></div>
            <div className="rounded-xl bg-muted/60 p-4"><p className="text-xs text-muted-foreground">Net recorded movement</p><p className={`mt-1 text-2xl font-bold tracking-tight ${totalCollected - totalExpenses >= 0 ? "text-teal-700 dark:text-teal-400" : "text-destructive"}`}>{money(totalCollected - totalExpenses)}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">Collections minus recorded expenses; this is not an audited balance.</p></div>
          </div>
        </article>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <ChartPanel title="Collections by class" description="Completed receipts grouped by the class on the linked bill." icon={ChartColumn}>
          {classSeries.length ? <div className="h-56 w-full min-w-0"><ResponsiveContainer width="100%" height="100%" minWidth={0}><BarChart data={classSeries} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 4 }}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tickFormatter={(value: number) => value >= 1000 ? `₵${Math.round(value / 1000)}k` : `₵${value}`} tick={tickStyle} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="name" width={100} tick={tickStyle} axisLine={false} tickLine={false} /><Tooltip contentStyle={tooltipStyle} formatter={(value) => [money(Number(value ?? 0)), "Collections"]} /><Bar dataKey="amount" name="Collections" fill="#0d9488" radius={[0, 5, 5, 0]} maxBarSize={22} /></BarChart></ResponsiveContainer></div> : <ChartEmpty>Class collection totals will appear when completed receipts linked to bills have been recorded.</ChartEmpty>}
        </ChartPanel>

        <ChartPanel title="Expenses by category" description="Where recorded school expenses are being allocated." icon={ChartPie}>
          {expenseSeries.length ? <div className="h-56 w-full min-w-0"><ResponsiveContainer width="100%" height="100%" minWidth={0}><BarChart data={expenseSeries} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 4 }}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tickFormatter={(value: number) => value >= 1000 ? `₵${Math.round(value / 1000)}k` : `₵${value}`} tick={tickStyle} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="name" width={100} tick={tickStyle} axisLine={false} tickLine={false} /><Tooltip contentStyle={tooltipStyle} formatter={(value) => [money(Number(value ?? 0)), "Expenses"]} /><Bar dataKey="amount" name="Expenses" fill="#f59e0b" radius={[0, 5, 5, 0]} maxBarSize={22} /></BarChart></ResponsiveContainer></div> : <ChartEmpty>Expense categories will appear when expenses have been recorded.</ChartEmpty>}
        </ChartPanel>

        <ChartPanel title="Collections by method" description="Completed receipts grouped by payment method." icon={WalletCards}>
          {methodSeries.length ? <div className="h-56 w-full min-w-0"><ResponsiveContainer width="100%" height="100%" minWidth={0}><BarChart data={methodSeries} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 4 }}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tickFormatter={(value: number) => value >= 1000 ? `₵${Math.round(value / 1000)}k` : `₵${value}`} tick={tickStyle} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="name" width={100} tick={tickStyle} axisLine={false} tickLine={false} /><Tooltip contentStyle={tooltipStyle} formatter={(value) => [money(Number(value ?? 0)), "Collections"]} /><Bar dataKey="amount" name="Collections" fill="#6366f1" radius={[0, 5, 5, 0]} maxBarSize={22} /></BarChart></ResponsiveContainer></div> : <ChartEmpty>Payment-method totals will appear when completed receipts have been recorded.</ChartEmpty>}
        </ChartPanel>
      </div>
    </section>
  );
}
