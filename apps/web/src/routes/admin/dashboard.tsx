import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  Users,
  GraduationCap,
  CreditCard,
  School,
  ArrowRight,
  ArrowUpRight,
  CircleAlert,
  Plus,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { StatCard } from "@/components/superadmin/stat-card";
import { OperationsHealthPanel } from "@/components/superadmin/operations-health-panel";
import { SubscriptionBadge } from "@/components/superadmin/subscription-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Link, useNavigate } from "@tanstack/react-router";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export const Route = createFileRoute("/admin/dashboard")({
  component: AdminDashboard,
});

interface PlatformStats {
  totalSchools: number;
  totalStudents: number;
  totalTeachers: number;
  activeSubscriptions: number;
  trialing?: number;
  pastDue?: number;
  suspended?: number;
  expiringSoon?: number;
  lapsed?: number;
  cancelled?: number;
  subscriptionStatusCounts?: Record<string, number>;
}

interface SchoolSummary {
  id: string;
  name: string;
  code: string;
  subdomain: string;
  createdAt: string;
  organization: { subscriptionStatus: string; expiresAt: string | null; metadata: string | null };
  _count: { students: number; teachers: number };
}

interface SchoolsListResponse {
  data: SchoolSummary[];
  meta: { total: number };
}

function AdminDashboard() {
  const navigate = useNavigate();
  const {
    data: stats,
    isPending: statsLoading,
    error: statsError,
    refetch: refetchStats,
    isFetching: statsFetching,
    dataUpdatedAt: statsUpdatedAt,
  } = useQuery({
    queryKey: ["superadmin", "stats"],
    queryFn: () => apiFetch<PlatformStats>("/super-admin/stats"),
    retry: false,
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const {
    data: schools,
    isPending: schoolsLoading,
    error: schoolsError,
    refetch: refetchSchools,
    isFetching: schoolsFetching,
    dataUpdatedAt: schoolsUpdatedAt,
  } = useQuery({
    queryKey: ["superadmin", "schools", 1],
    queryFn: () => apiFetch<SchoolsListResponse>("/super-admin/schools?page=1&limit=5"),
    retry: false,
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const isRefreshing = statsFetching || schoolsFetching;
  const lastUpdatedAt = Math.max(statsUpdatedAt, schoolsUpdatedAt);
  const regionOf = (metadata: string | null | undefined) => {
    try {
      return (metadata ? (JSON.parse(metadata) as { region?: string }) : null)?.region ?? "";
    } catch {
      return "";
    }
  };
  const schoolColumns: DataTableColumn<NonNullable<typeof schools>["data"][number]>[] = [
    {
      id: "school",
      header: "School",
      value: (school) => `${school.name} (${school.subdomain}.schoolhub)`,
      cell: (school) => (
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xs font-bold text-primary">
            {school.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{school.name}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{school.subdomain}.schoolhub</p>
          </div>
        </div>
      ),
    },
    { id: "region", header: "Region", value: (school) => regionOf(school.organization.metadata), cell: (school) => regionOf(school.organization.metadata) || "—" },
    { id: "students", header: "Students", value: (school) => school._count.students, cell: (school) => <span className="font-semibold tabular-nums">{school._count.students}</span> },
    {
      id: "subscription",
      header: "Subscription",
      value: (school) => school.organization.subscriptionStatus,
      cell: (school) => <SubscriptionBadge status={school.organization.subscriptionStatus} expiresAt={school.organization.expiresAt} />,
    },
    {
      id: "enrolled",
      header: "Enrolled",
      value: (school) => String(school.createdAt).slice(0, 10),
      cell: (school) => new Date(school.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
    },
    {
      id: "actions",
      header: "",
      className: "text-right",
      cell: (school) => (
        <Link
          to="/admin/schools/$schoolId"
          params={{ schoolId: school.id }}
          className="superadmin-button-secondary inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-primary transition hover:bg-primary/10 hover:text-primary"
        >
          View <ArrowRight className="size-3.5" />
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-7">
      <section className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-brand via-brand-mid to-brand-soft px-6 py-7 text-brand-foreground shadow-xl shadow-brand/10 sm:px-8 sm:py-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-32 size-80 rounded-full border border-brand-foreground/10" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-2 -top-20 size-56 rounded-full border border-brand-foreground/10" />
        <div aria-hidden="true" className="pointer-events-none absolute bottom-0 right-40 size-44 rounded-full bg-info/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-foreground/15 bg-brand-foreground/10 px-3 py-1.5 text-[11px] font-semibold text-brand-foreground/80 backdrop-blur">
              <Sparkles className="size-3.5 text-brand-foreground/80" />
              SchoolHub platform control
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Platform overview
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-brand-foreground/80">
              Platform-wide school, learner, educator, and subscription data. Automatically refreshes every minute.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-right text-xs text-brand-foreground/75" aria-live="polite">
              <p>{isRefreshing ? "Refreshing platform data…" : "Platform data"}</p>
              {lastUpdatedAt > 0 && !isRefreshing && (
                <p className="mt-1">Updated {new Date(lastUpdatedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => void Promise.all([refetchStats(), refetchSchools()])}
              disabled={isRefreshing}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-brand-foreground/25 bg-brand-foreground/10 px-4 text-xs font-bold text-brand-foreground transition hover:bg-brand-foreground/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} aria-hidden="true" />
              {isRefreshing ? "Refreshing…" : "Refresh data"}
            </button>
            <button
              type="button"
              onClick={() => void navigate({ to: "/admin/schools/new" })}
            className="superadmin-button-secondary inline-flex h-11 items-center gap-2 rounded-xl border border-border/70 bg-card px-4 text-xs font-bold text-primary shadow-lg shadow-primary/15 transition hover:-translate-y-0.5 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
          >
            <Plus className="size-4" />
            Enroll a school
            <ArrowRight className="size-3.5" />
            </button>
          </div>
        </div>
      </section>

      <OperationsHealthPanel />

      {statsError && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>Platform statistics could not be loaded: {statsError.message}</span>
        </div>
      )}

      <section aria-label="Platform statistics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total schools"
          value={statsLoading ? "…" : (stats?.totalSchools ?? "—")}
          icon={Building2}
          color="indigo"
        />
        <StatCard
          label="Students"
          value={statsLoading ? "…" : (stats?.totalStudents ?? "—")}
          icon={Users}
          color="emerald"
        />
        <StatCard
          label="Teachers"
          value={statsLoading ? "…" : (stats?.totalTeachers ?? "—")}
          icon={GraduationCap}
          color="amber"
        />
        <StatCard
          label="Active subscriptions"
          value={statsLoading ? "…" : (stats?.activeSubscriptions ?? "—")}
          icon={CreditCard}
          color="rose"
        />
      </section>

      {stats && (stats.lapsed ?? 0) + (stats.expiringSoon ?? 0) + (stats.pastDue ?? 0) + (stats.suspended ?? 0) > 0 && (
        <section aria-label="Needs attention" className="flex flex-col gap-4 rounded-2xl border border-warning/30 bg-warning/10 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning"><CircleAlert className="size-5" /></span>
            <div>
              <h2 className="text-sm font-bold text-foreground">Subscriptions need attention</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {[
                  stats.lapsed ? `${stats.lapsed} lapsed` : null,
                  stats.expiringSoon ? `${stats.expiringSoon} expiring within 14 days` : null,
                  stats.pastDue ? `${stats.pastDue} past due` : null,
                  stats.suspended ? `${stats.suspended} suspended` : null,
                ].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
          <Link to="/admin/subscriptions" className="superadmin-button-secondary inline-flex shrink-0 items-center gap-2 self-start rounded-xl px-4 py-2.5 text-sm font-semibold sm:self-center">
            Review subscriptions <ArrowRight className="size-3.5" />
          </Link>
        </section>
      )}

      <section aria-label="Subscription analytics" className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
        <article className="min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground sm:text-base">Platform subscription distribution</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Current subscription status across every enrolled school, not only the newest records.</p>
            </div>
            <span className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">Platform-wide</span>
          </div>
          {statsLoading ? (
            <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">Loading subscription data…</div>
          ) : statsError || !stats ? (
            <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-border px-5 text-center text-sm text-muted-foreground">Subscription data is unavailable. Try refreshing the dashboard.</div>
          ) : (() => {
            const palette: Record<string, string> = {
              ACTIVE: "var(--success)",
              TRIALING: "var(--chart-1)",
              PAST_DUE: "var(--warning)",
              SUSPENDED: "var(--destructive)",
              CANCELLED: "var(--chart-4)",
              CANCELED: "var(--chart-4)",
              EXPIRED: "var(--muted-foreground)",
              UNPAID: "var(--chart-5)",
              INCOMPLETE: "var(--info)",
              INCOMPLETE_EXPIRED: "var(--chart-3)",
              UNKNOWN: "var(--border)",
            };
            const data = Object.entries(stats.subscriptionStatusCounts ?? {})
              .filter(([, value]) => value > 0)
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([status, value]) => ({ status, label: status.replaceAll("_", " "), value, fill: palette[status] ?? "var(--chart-2)" }));
            if (!data.length) {
              return <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-border px-5 text-center text-sm text-muted-foreground">No school subscription records are available yet.</div>;
            }
            return (
              <div className="grid min-w-0 items-center gap-4 sm:grid-cols-[minmax(180px,0.8fr)_minmax(0,1fr)]">
                <div role="img" aria-label={data.map((item) => `${item.label}: ${item.value} schools`).join(", ")} className="h-56 min-w-0">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <PieChart>
                      <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius="57%" outerRadius="82%" paddingAngle={2} stroke="none">
                        {data.map((item) => <Cell key={item.status} fill={item.fill} />)}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", backgroundColor: "var(--popover)", color: "var(--popover-foreground)", fontSize: 12 }} formatter={(value) => [`${Number(value ?? 0).toLocaleString("en-GH")} schools`, "Schools"]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="min-w-0 space-y-2">
                  {data.map((item) => <li key={item.status} className="flex items-center justify-between gap-3 text-xs"><span className="flex min-w-0 items-center gap-2 text-muted-foreground"><span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: item.fill }} /><span className="truncate">{item.label}</span></span><span className="font-semibold tabular-nums text-foreground">{item.value.toLocaleString("en-GH")}</span></li>)}
                </ul>
              </div>
            );
          })()}
        </article>

        <article className="min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-foreground sm:text-base">Subscription health</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Items that may need follow-up from the platform team.</p>
          </div>
          {statsLoading ? <div className="grid gap-3 sm:grid-cols-2"><div className="h-24 animate-pulse rounded-xl bg-muted" /><div className="h-24 animate-pulse rounded-xl bg-muted" /><div className="h-24 animate-pulse rounded-xl bg-muted" /><div className="h-24 animate-pulse rounded-xl bg-muted" /></div>
          : statsError || !stats ? <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border px-5 text-center text-sm text-muted-foreground">Subscription health is unavailable.</div>
          : <div className="grid gap-3 sm:grid-cols-2">
            {[
              { label: "Expiring in 14 days", value: stats.expiringSoon ?? 0, tone: "warning" },
              { label: "Past expiry", value: stats.lapsed ?? 0, tone: "destructive" },
              { label: "Past due", value: stats.pastDue ?? 0, tone: "warning" },
              { label: "Suspended", value: stats.suspended ?? 0, tone: "destructive" },
            ].map((metric) => <div key={metric.label} className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">{metric.label}</p><p className={`mt-2 text-2xl font-bold tabular-nums ${metric.tone === "destructive" ? "text-destructive" : "text-warning"}`}>{metric.value.toLocaleString("en-GH")}</p></div>)}
            <Link to="/admin/subscriptions" className="sm:col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Review subscriptions <ArrowRight className="size-3.5" /></Link>
          </div>}
        </article>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-5 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Building2 className="size-5" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-foreground sm:text-base">
                Recently enrolled schools
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {schools?.meta.total ?? 0} schools on the platform
              </p>
            </div>
          </div>
          <Link
            to="/admin/schools"
            className="superadmin-button-secondary group inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/10 hover:text-primary"
          >
            View all schools
            <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
        </div>

        {schoolsLoading ? (
          <div className="space-y-3 p-6" aria-label="Loading schools">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : schoolsError ? (
          <div role="alert" className="flex items-start gap-3 px-6 py-10 text-sm text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p>Schools could not be loaded: {schoolsError.message}</p>
          </div>
        ) : !schools || schools.data.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <School className="size-6" />
            </span>
            <p className="text-sm font-semibold text-foreground">No schools enrolled yet</p>
            <p className="mb-5 mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
              Enroll your first school to start managing your platform.
            </p>
            <Link
              to="/admin/schools/new"
              className="superadmin-button-primary inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
            >
              <Plus className="size-3.5" />
              Enroll a school
            </Link>
          </div>
        ) : (
          <DataTable
            embedded
            compact
            paginate={false}
            rows={schools.data}
            columns={schoolColumns}
            getRowId={(school) => school.id}
            emptyTitle="No schools"
            emptyDescription="No schools to show."
          />
        )}
      </section>
    </div>
  );
}
