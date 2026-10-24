import { useMemo } from "react";
import { Activity, WalletCards } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface PaymentRecord {
  amount: number | string;
  paymentDate: string;
  status: string;
}
interface ExpenseRecord {
  amount: number | string;
  date: string;
}
interface AccountantFinanceChartsProps {
  payments: PaymentRecord[];
  expenses: ExpenseRecord[];
}

const money = (value: number) =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 0 }).format(value);

const tooltipStyle = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  color: "var(--popover-foreground)",
  fontSize: 12,
};

export function AccountantFinanceCharts({ payments, expenses }: AccountantFinanceChartsProps) {
  const series = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      return { key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`, month: new Intl.DateTimeFormat("en-GB", { month: "short" }).format(date), collected: 0, expenses: 0 };
    });
    const byMonth = new Map(months.map((month) => [month.key, month]));
    for (const payment of payments) {
      if (!["COMPLETED", "SUCCESS", "PAID"].includes(payment.status.toUpperCase())) continue;
      const date = new Date(payment.paymentDate);
      if (Number.isNaN(date.getTime())) continue;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const month = byMonth.get(key);
      if (month) month.collected += Number(payment.amount) || 0;
    }
    for (const expense of expenses) {
      const date = new Date(expense.date);
      if (Number.isNaN(date.getTime())) continue;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const month = byMonth.get(key);
      if (month) month.expenses += Number(expense.amount) || 0;
    }
    return months;
  }, [payments, expenses]);

  const hasRecords = payments.length > 0 || expenses.length > 0;
  const totalCollected = series.reduce((sum, item) => sum + item.collected, 0);
  const totalExpenses = series.reduce((sum, item) => sum + item.expenses, 0);

  return (
    <section aria-label="Finance analytics" className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
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
        {hasRecords ? (
          <div className="h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="collectionsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0d9488" stopOpacity={0.28} /><stop offset="95%" stopColor="#0d9488" stopOpacity={0.01} /></linearGradient>
                  <linearGradient id="expensesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f59e0b" stopOpacity={0.2} /><stop offset="95%" stopColor="#f59e0b" stopOpacity={0.01} /></linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                <YAxis tickFormatter={(value: number) => value >= 1000 ? `₵${Math.round(value / 1000)}k` : `₵${value}`} width={48} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => [money(Number(value ?? 0))]} />
                <Area type="monotone" dataKey="collected" name="Collections" stroke="#0d9488" strokeWidth={2.5} fill="url(#collectionsFill)" activeDot={{ r: 4 }} />
                <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#f59e0b" strokeWidth={2.5} fill="url(#expensesFill)" activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border px-5 text-center text-sm text-muted-foreground">Cash-flow trends will appear when payments or expenses have been recorded.</div>}
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
    </section>
  );
}
