import { useQuery } from "@tanstack/react-query";
import { BarChart3, CalendarRange, GraduationCap, LoaderCircle, UsersRound } from "lucide-react";
import { useState } from "react";
import { DashboardInfographics } from "@/components/school/dashboard/dashboard-infographics";
import type { DashboardAnalytics } from "@/components/school/dashboard/dashboard-data";
import { apiFetch } from "@/lib/api";

const numberFormat = new Intl.NumberFormat("en-GH");
const moneyFormat = new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 2 });

export function SchoolReportsWorkspace() {
  const [months, setMonths] = useState(6);
  const reportQuery = useQuery({
    queryKey: ["school-reports", months],
    queryFn: () => apiFetch<DashboardAnalytics>(`/dashboard/analytics?months=${months}`),
    retry: false,
  });
  const data = reportQuery.data;

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><BarChart3 className="size-5" /></span><div><h2 className="text-sm font-semibold text-foreground">School performance and trends</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">Explore live enrollment, attendance, demographics and financial trends for the active school. Financial values are included only when your role has access.</p></div></div>
        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><CalendarRange className="size-4" />Reporting period<select value={months} onChange={(event) => setMonths(Number(event.target.value))} className="h-9 rounded-lg border border-input bg-background px-3 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value={3}>3 months</option><option value={6}>6 months</option><option value={12}>12 months</option></select></label>
      </section>

      {reportQuery.isPending ? <div className="flex min-h-48 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading school reports…</div>
      : reportQuery.isError ? <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">School reports could not be loaded: {reportQuery.error.message}<button type="button" onClick={() => void reportQuery.refetch()} className="ml-2 underline underline-offset-2">Try again</button></div>
      : data && <><section aria-label="School report summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><Summary label="Active students" value={numberFormat.format(data.metrics.activeStudents)} detail="Current active student records" icon={UsersRound} /><Summary label="Teaching staff" value={numberFormat.format(data.metrics.activeTeachers)} detail="Active teacher records" icon={GraduationCap} /><Summary label="New admissions" value={numberFormat.format(data.metrics.newAdmissionsThisMonth)} detail="Admitted this month" icon={BarChart3} />{data.canViewFinance && <><Summary label="Revenue this month" value={moneyFormat.format(data.metrics.revenueThisMonth ?? 0)} detail="Completed payments recorded" icon={BarChart3} /><Summary label="Expenditures this month" value={moneyFormat.format(data.metrics.expendituresThisMonth ?? 0)} detail="Recorded school expenses" icon={BarChart3} /></>}</section><DashboardInfographics data={data} isLoading={false} isError={false} selectedMonths={months} onMonthsChange={setMonths} />{data.generatedAt && <p className="text-right text-[10px] text-muted-foreground">Report data generated {new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.generatedAt))}</p>}</>}
    </div>
  );
}

function Summary({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof UsersRound }) {
  return <article className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-2 break-words text-2xl font-bold tracking-tight text-foreground tabular-nums">{value}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{detail}</p></div><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" /></span></div></article>;
}
