import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  CircleCheck, BookOpen, Building2, CalendarDays, CircleAlert, GraduationCap,
  UsersRound, WalletCards, UserRoundPlus, type LucideIcon,
} from "lucide-react";
import { DashboardInfographics } from "@/components/school/dashboard/dashboard-infographics";
import { RecentActivityCard, SchoolYearCard } from "@/components/school/dashboard/dashboard-activity";
import type { DashboardAnalytics } from "@/components/school/dashboard/dashboard-data";
import { apiFetch } from "@/lib/api";
import { schoolRoleLabel, useSchoolRole } from "@/components/school/school-role-switcher";
import { getSchoolNavGroupsForRole } from "@/lib/school-navigation";
import { StudentOverview } from "@/components/portal/student-overview";
import { TeacherOverview } from "@/components/portal/teacher-overview";
import { StaffOverview } from "@/components/portal/staff-overview";
import { GuardianPortalWorkspace } from "@/components/portal/guardian-portal-workspace";
import { AccountantFinanceCharts } from "@/components/portal/accountant-finance-charts";
import { useSchoolOrganization } from "@/components/school/school-organization";

interface SetupYear {
  id: string; name: string; startDate: string; endDate: string; isCurrent: boolean;
  terms: { id: string; name: string; startDate: string; endDate: string; isCurrent: boolean }[];
}
interface SetupSchool {
  id: string; name: string; email?: string | null; phone?: string | null; address?: string | null;
  academicYears: SetupYear[];
}
interface DashboardContentProps { today: string; greetingName: string; }
interface AccountantDashboardExpense {
  amount: number | string;
  date: string;
  category?: string | null;
  customCategory?: { name: string } | null;
  registryCategory?: { name: string } | null;
}
interface AccountantFinanceSummary {
  asOf: string;
  billed: string;
  collected: string;
  outstanding: string;
  overdue: string;
  collectionRate: string | null;
  byMethod: { method: string; amount: string; receiptCount: number }[];
  byClass: { classId: string | null; className: string; billed: string; collected: string; outstanding: string; billCount: number }[];
  ageing: { days0To30: string; days31To60: string; days61To90: string; days90Plus: string; notDue: string };
}
interface Metric { label: string; value: string; detail: string; icon: LucideIcon; className: string; }
const numberFormat = new Intl.NumberFormat("en-GH");
const moneyFormat = new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 2 });
function MetricTile({ metric }: { metric: Metric }) {
  return <article className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium text-muted-foreground">{metric.label}</p><p className="mt-3 break-words text-2xl font-bold tracking-tight text-foreground">{metric.value}</p></div><span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${metric.className}`}><metric.icon className="size-[18px]" /></span></div>
    <p className="mt-2 text-[11px] text-muted-foreground">{metric.detail}</p>
  </article>;
}
function Metrics({ data, isLoading, isError }: { data?: DashboardAnalytics; isLoading: boolean; isError: boolean }) {
  if (isLoading) return <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Loading school statistics">{[1,2,3,4].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl bg-muted/60" />)}</section>;
  if (isError || !data) return <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Live school statistics could not be loaded.</p>;
  const metrics: Metric[] = [
    { label: "Active students", value: numberFormat.format(data.metrics.activeStudents), detail: "Current active student records", icon: UsersRound, className: "bg-primary/10 text-primary" },
    { label: "Teaching staff", value: numberFormat.format(data.metrics.activeTeachers), detail: "Active teacher records", icon: GraduationCap, className: "bg-highlight/10 text-highlight" },
    { label: "New admissions", value: numberFormat.format(data.metrics.newAdmissionsThisMonth), detail: "Admitted this month", icon: UserRoundPlus, className: "bg-info/10 text-info" },
  ];
  if (data.canViewFinance) {
    metrics.push({ label: "Revenue this month", value: moneyFormat.format(data.metrics.revenueThisMonth ?? 0), detail: "Completed payments recorded", icon: WalletCards, className: "bg-success/10 text-success" });
    metrics.push({ label: "Expenditures this month", value: moneyFormat.format(data.metrics.expendituresThisMonth ?? 0), detail: "Recorded school expenses", icon: WalletCards, className: "bg-warning/10 text-warning" });
  }
  return <section aria-label="Live school statistics" className={`grid gap-3 sm:grid-cols-2 ${data.canViewFinance ? "xl:grid-cols-5" : "xl:grid-cols-3"}`}>{metrics.map((metric) => <MetricTile key={metric.label} metric={metric} />)}</section>;
}

export function DashboardContent({ today, greetingName }: DashboardContentProps) {
  const { activeRole } = useSchoolRole();
  const { activeOrganization } = useSchoolOrganization();
  const [selectedMonths, setSelectedMonths] = useState(6);
  const isManagementRole = ["owner", "admin", "headteacher"].includes(activeRole ?? "");
  // School-wide analytics are for leadership and finance only. Teachers, staff, guardians and
  // students have their own overviews and must not load whole-school data (the API refuses them).
  const canSeeAnalytics = isManagementRole || activeRole === "accountant";
  const analyticsQuery = useQuery({
    queryKey: ["dashboard", "analytics", selectedMonths, activeOrganization?.id],
    queryFn: () => apiFetch<DashboardAnalytics>(`/dashboard/analytics?months=${selectedMonths}`),
    enabled: canSeeAnalytics && Boolean(activeOrganization),
    retry: false,
    refetchInterval: 60_000,
  });
  const accountantYearsQuery = useQuery({
    queryKey: ["dashboard", "accountant-finance", "academic-years", activeOrganization?.id],
    queryFn: () => apiFetch<SetupYear[]>("/schools/academic-years"),
    enabled: activeRole === "accountant" && Boolean(activeOrganization),
    retry: false,
    staleTime: 60_000,
  });
  const accountantCurrentYear = accountantYearsQuery.data?.find((year) => year.isCurrent);
  const accountantCurrentTerm = accountantCurrentYear?.terms.find((term) => term.isCurrent);
  const accountantSummaryQuery = useQuery({
    queryKey: ["dashboard", "accountant-finance", "summary", activeOrganization?.id, accountantCurrentYear?.id, accountantCurrentTerm?.id],
    queryFn: () => {
      const params = new URLSearchParams();
      if (accountantCurrentYear) params.set("yearId", accountantCurrentYear.id);
      if (accountantCurrentTerm) params.set("termId", accountantCurrentTerm.id);
      return apiFetch<AccountantFinanceSummary>(`/finance/summary${params.size ? `?${params.toString()}` : ""}`);
    },
    enabled: activeRole === "accountant" && Boolean(activeOrganization),
    retry: false,
    refetchInterval: 60_000,
  });
  const accountantExpensesQuery = useQuery({
    queryKey: ["dashboard", "accountant-finance", "expenses", activeOrganization?.id],
    queryFn: () => apiFetch<AccountantDashboardExpense[]>("/finance/expenses"),
    enabled: activeRole === "accountant" && Boolean(activeOrganization),
    retry: false,
    refetchInterval: 60_000,
  });
  const schoolQuery = useQuery({
    queryKey: ["school", "current"],
    queryFn: () => apiFetch<SetupSchool>("/schools/current"),
    enabled: isManagementRole,
    retry: false,
  });
  const classesQuery = useQuery({
    queryKey: ["academics", "classes"],
    queryFn: () => apiFetch<unknown[]>("/academics/classes"),
    enabled: isManagementRole,
    retry: false,
  });
  const subjectsQuery = useQuery({
    queryKey: ["academics", "subjects"],
    queryFn: () => apiFetch<unknown[]>("/academics/subjects"),
    enabled: isManagementRole,
    retry: false,
  });
  const years = schoolQuery.data?.academicYears ?? [];
  const activeYear = years.find((year) => year.isCurrent);
  const setupItems = [
    { title: "Complete school profile", detail: "Confirm the school contact details.", complete: !!schoolQuery.data?.email && !!schoolQuery.data.phone && !!schoolQuery.data.address, icon: Building2, page: "settings" },
    { title: "Create academic year and terms", detail: "Define the dates that classes and school records follow.", complete: years.some((year) => year.terms.length > 0), icon: CalendarDays, page: "academic-years" },
    { title: "Add subjects", detail: "Set up the subjects taught at your school.", complete: (subjectsQuery.data?.length ?? 0) > 0, icon: BookOpen, page: "subjects" },
    { title: "Create classes", detail: "Organize learners under the current academic year.", complete: (classesQuery.data?.length ?? 0) > 0, icon: UsersRound, page: "classes" },
  ];
  const completedSteps = setupItems.filter((item) => item.complete).length;
  const setupLoading = schoolQuery.isPending || classesQuery.isPending || subjectsQuery.isPending;
  const setupHasError = schoolQuery.isError || classesQuery.isError || subjectsQuery.isError;
  const roleLinks = getSchoolNavGroupsForRole(activeRole ?? undefined).flatMap((group) => group.items).slice(0, 6);
  const data = analyticsQuery.data;

  if (activeRole === "student") return <main className="mx-auto max-w-[1440px] px-4 py-7 sm:px-6 lg:px-9 lg:py-9"><StudentOverview /></main>;
  if (activeRole === "guardian") return <main className="mx-auto max-w-[1440px] px-4 py-7 sm:px-6 lg:px-9 lg:py-9"><GuardianPortalWorkspace showSectionNav={false} /></main>;
  if (activeRole === "teacher") return <TeacherOverview today={today} greetingName={greetingName} />;
  if (activeRole === "staff") return <StaffOverview today={today} greetingName={greetingName} />;

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-7 sm:px-6 lg:px-9 lg:py-9">
      <div className="mb-7">
        <p className="mb-2 text-xs font-medium text-muted-foreground">{today}</p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[30px]">Good day, {greetingName}<span className="ml-2">👋</span></h1>
        <p className="mt-1.5 text-sm text-muted-foreground">A live overview of your school&apos;s records and activity.</p>
      </div>

      {isManagementRole && !setupLoading && !(completedSteps === setupItems.length && !setupHasError) && <section className="mb-6 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border bg-muted/30 px-5 py-5 sm:px-6">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Getting started</p><h2 className="mt-1 text-lg font-bold tracking-tight text-foreground">Prepare your school to run</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">These checks reflect your current school configuration.</p></div>
          <div className="min-w-32 rounded-xl border border-border bg-card px-4 py-3"><p className="text-lg font-bold text-foreground">{completedSteps}<span className="text-muted-foreground">/{setupItems.length}</span></p><p className="text-[10px] font-medium text-muted-foreground">setup steps complete</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(completedSteps / setupItems.length) * 100}%` }} /></div></div>
        </div>
        {setupHasError && <p role="alert" className="flex items-center gap-2 border-b border-destructive/20 bg-destructive/5 px-5 py-2.5 text-xs text-destructive"><CircleAlert className="size-4 shrink-0" />Some setup checks could not load. Retry after the API connection is restored.</p>}
        <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">{setupItems.map(({ title, detail, complete, icon: Icon, page }) => <Link key={page} to="/$page" params={{ page }} className="group flex min-h-24 items-start gap-3 bg-card p-4 transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"><span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${complete ? "bg-success/10 text-success" : "bg-primary/10 text-primary"}`}>{complete ? <CircleCheck className="size-4" /> : <Icon className="size-4" />}</span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-foreground">{title}</span><span className="mt-1 block text-[10px] leading-4 text-muted-foreground">{complete ? "Complete" : detail}</span></span></Link>)}</div>
      </section>}

      {!isManagementRole && <section className="mb-5 rounded-2xl border border-border bg-card p-5"><p className="text-xs font-semibold uppercase tracking-wide text-primary">{schoolRoleLabel(activeRole)}</p><p className="mt-1 text-sm text-muted-foreground">Quick links for your workspace</p><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{roleLinks.map((item) => <Link key={item.id} to="/$page" params={{ page: item.id }} className="flex items-center gap-3 rounded-xl border border-border p-3 transition hover:bg-muted/50"><span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><item.icon className="size-4" /></span><span><span className="block text-sm font-semibold text-foreground">{item.label}</span><span className="mt-0.5 block text-xs text-muted-foreground">{item.description}</span></span></Link>)}</div></section>}

      <Metrics data={data} isLoading={analyticsQuery.isPending} isError={analyticsQuery.isError} />
      <DashboardInfographics data={data} isLoading={analyticsQuery.isPending} isError={analyticsQuery.isError} selectedMonths={selectedMonths} onMonthsChange={setSelectedMonths} />
      {activeRole === "accountant" && (
        <section className="mt-6 space-y-3" aria-label="Accountant finance dashboard">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Finance overview</h2>
            <p className="mt-1 text-sm text-muted-foreground">Live collections, expenses and breakdowns from saved finance records.</p>
          </div>
          {(accountantSummaryQuery.isPending || accountantExpensesQuery.isPending || accountantYearsQuery.isPending) ? (
            <div className="grid gap-5 xl:grid-cols-2" aria-label="Loading finance analytics">
              <div className="h-80 animate-pulse rounded-2xl bg-muted/60" />
              <div className="h-80 animate-pulse rounded-2xl bg-muted/60" />
            </div>
          ) : accountantSummaryQuery.isError || accountantExpensesQuery.isError ? (
            <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              Finance charts could not load. Check your accountant finance permissions and API connection, then refresh this dashboard.
            </p>
          ) : (
            <AccountantFinanceCharts
              summary={accountantSummaryQuery.data ?? null}
              expenses={accountantExpensesQuery.data ?? []}
            />
          )}
        </section>
      )}
      <section className={`mt-5 grid gap-5 ${isManagementRole ? "xl:grid-cols-2" : "xl:grid-cols-1"}`}>
        <RecentActivityCard activities={data?.recentActivities ?? []} isLoading={analyticsQuery.isPending} isError={analyticsQuery.isError} canViewFinance={Boolean(data?.canViewFinance)} />
        {isManagementRole && <SchoolYearCard academicYear={activeYear} />}
      </section>
      {data?.generatedAt && <p className="mt-5 text-center text-[10px] text-muted-foreground">Updated {new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.generatedAt))} · automatically refreshes every minute</p>}
    </main>
  );
}
