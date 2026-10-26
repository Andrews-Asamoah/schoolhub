import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Activity, TrendingUp, UsersRound, WalletCards } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardAnalytics } from "@/components/school/dashboard/dashboard-data";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const GENDER_COLORS = ["var(--chart-1)", "var(--chart-4)", "var(--chart-5)", "var(--chart-2)"];
const chartTooltipStyle = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  color: "var(--popover-foreground)",
  fontSize: 12,
};
const numberFormat = new Intl.NumberFormat("en-GH");
const moneyFormat = new Intl.NumberFormat("en-GH", {
  style: "currency",
  currency: "GHS",
  maximumFractionDigits: 2,
});
const money = (value: number) => moneyFormat.format(value);

export interface InfographicCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
  aside?: ReactNode;
}

export function InfographicCard({
  title, description, icon: Icon, children, className, aside,
}: InfographicCardProps) {
  return (
    <article className={cn("min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6", className)}>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {aside}
          <span className="flex size-9 items-center justify-center rounded-xl bg-muted text-foreground"><Icon className="size-4" aria-hidden="true" /></span>
        </div>
      </div>
      {children}
      <p className="mt-4 border-t border-border/70 pt-3 text-[10px] text-muted-foreground">Based on live school records</p>
    </article>
  );
}

function EmptyChart({ message }: { message: string }) {
  return <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-border px-5 text-center text-sm text-muted-foreground">{message}</div>;
}

function ChartLoading() {
  return <div className="h-56 animate-pulse rounded-xl bg-muted/60" aria-label="Loading chart" />;
}

export function DashboardInfographics({
  data,
  isLoading,
  isError,
  selectedMonths,
  onMonthsChange,
}: {
  data?: DashboardAnalytics;
  isLoading: boolean;
  isError: boolean;
  selectedMonths: number;
  onMonthsChange: (months: number) => void;
}) {
  const periodSelect = (
    <Select value={String(selectedMonths)} onValueChange={(value) => onMonthsChange(Number(value))}>
      <SelectTrigger className="h-8 w-[92px] text-xs" aria-label="Select chart period"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="3">3 months</SelectItem>
        <SelectItem value="6">6 months</SelectItem>
        <SelectItem value="12">12 months</SelectItem>
      </SelectContent>
    </Select>
  );
  const unavailable = isError ? "Live analytics could not be loaded. Try refreshing the dashboard." : "No records are available for this chart yet.";

  return (
    <section aria-label="School analytics" className="mt-5 grid min-w-0 gap-5 lg:grid-cols-2">
      <InfographicCard title="Student gender distribution" description="Gender recorded on active student profiles" icon={UsersRound}>
        {isLoading ? <ChartLoading /> : isError ? <EmptyChart message={unavailable} /> : (data?.genderDistribution.reduce((sum, item) => sum + item.value, 0) ?? 0) === 0 ? <EmptyChart message="No active student profiles are available yet." /> : (
          <>
            <div className="h-56 w-full min-w-0" role="img" aria-label={data!.genderDistribution.map((item) => item.label + ": " + item.value).join(", ")}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart>
                  <Pie data={data!.genderDistribution} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius="55%" outerRadius="80%" paddingAngle={2} stroke="none">
                    {data!.genderDistribution.map((item, index) => <Cell key={item.label} fill={GENDER_COLORS[index % GENDER_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(value) => [numberFormat.format(Number(value ?? 0)), "Students"]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {data!.genderDistribution.map((item, index) => {
                const total = data!.genderDistribution.reduce((sum, entry) => sum + entry.value, 0);
                const pct = total ? (item.value / total) * 100 : 0;
                return <div key={item.label} className="flex items-start gap-2 text-xs">
                  <span className="mt-0.5 size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: GENDER_COLORS[index % GENDER_COLORS.length] }} />
                  <div className="min-w-0"><p className="text-muted-foreground">{item.label}</p><p className="mt-0.5 font-semibold text-foreground">{numberFormat.format(item.value)} <span className="font-normal text-muted-foreground">({pct.toFixed(1)}%)</span></p></div>
                </div>;
              })}
            </div>
          </>
        )}
      </InfographicCard>

      <InfographicCard title="Enrollment growth" description="Active student population by admission date, with new admissions each month" icon={TrendingUp} aside={periodSelect}>
        {isLoading ? <ChartLoading /> : isError ? <EmptyChart message={unavailable} /> : (data?.metrics.activeStudents ?? 0) === 0 ? <EmptyChart message="No active student enrollment history is available yet." /> : (
          <div className="h-64 w-full min-w-0" role="img" aria-label="Enrollment population and new admissions by month">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart data={data?.enrollmentGrowth ?? []} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                <YAxis yAxisId="population" tickLine={false} axisLine={false} allowDecimals={false} width={42} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
                <YAxis yAxisId="admissions" orientation="right" tickLine={false} axisLine={false} allowDecimals={false} width={30} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(value, name) => [numberFormat.format(Number(value ?? 0)), name === "population" ? "Active population" : "New admissions"]} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} formatter={(value) => value === "population" ? "Active population" : "New admissions"} />
                <Line yAxisId="population" type="monotone" dataKey="population" name="population" stroke="var(--chart-1)" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                <Line yAxisId="admissions" type="monotone" dataKey="newAdmissions" name="newAdmissions" stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </InfographicCard>

      {data?.canViewFinance && (
        <InfographicCard title="Financial status" description="Recorded revenue from completed payments versus recorded expenditures" icon={WalletCards} className="lg:col-span-2">
          {isLoading ? <ChartLoading /> : isError ? <EmptyChart message={unavailable} /> : !data.hasFinancialRecords ? <EmptyChart message="No payment or expenditure records exist for this period." /> : (
            <>
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Revenue this month</p><p className="mt-1 text-lg font-bold text-foreground">{money(data.metrics.revenueThisMonth ?? 0)}</p></div>
                <div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Expenditures this month</p><p className="mt-1 text-lg font-bold text-foreground">{money(data.metrics.expendituresThisMonth ?? 0)}</p></div>
                <div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Net recorded movement</p><p className="mt-1 text-lg font-bold text-foreground">{money((data.metrics.revenueThisMonth ?? 0) - (data.metrics.expendituresThisMonth ?? 0))}</p></div>
              </div>
              <div className="h-64 w-full min-w-0" role="img" aria-label="Monthly revenue versus expenditures in Ghana cedis">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={data.financialStatus} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={6}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                    <YAxis tickFormatter={(value: number) => value >= 1000 ? (value / 1000).toFixed(0) + "k" : String(value)} tickLine={false} axisLine={false} width={45} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
                    <Tooltip contentStyle={chartTooltipStyle} formatter={(value, name) => [money(Number(value ?? 0)), name === "revenue" ? "Revenue" : "Expenditures"]} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    <Bar dataKey="revenue" name="Revenue" fill="var(--chart-2)" radius={[5, 5, 0, 0]} maxBarSize={30} />
                    <Bar dataKey="expenditures" name="Expenditures" fill="var(--chart-5)" radius={[5, 5, 0, 0]} maxBarSize={30} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </InfographicCard>
      )}
    </section>
  );
}
