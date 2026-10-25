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
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { StatCard } from "@/components/superadmin/stat-card";
import { SubscriptionBadge } from "@/components/superadmin/subscription-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Link, useNavigate } from "@tanstack/react-router";
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
  } = useQuery({
    queryKey: ["superadmin", "stats"],
    queryFn: () => apiFetch<PlatformStats>("/super-admin/stats"),
    retry: false,
  });

  const {
    data: schools,
    isPending: schoolsLoading,
    error: schoolsError,
  } = useQuery({
    queryKey: ["superadmin", "schools", 1],
    queryFn: () => apiFetch<SchoolsListResponse>("/super-admin/schools?page=1&limit=5"),
    retry: false,
  });

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
              A real-time snapshot of schools, learners, educators, and subscriptions across your platform.
            </p>
          </div>
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
      </section>

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

      <section aria-label="Platform analytics" className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <article className="min-w-0 rounded-2xl border border-border/80 bg-card p-5 shadow-[0_4px_24px_rgba(15,23,42,0.035)] sm:p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-sm font-semibold text-foreground sm:text-base">Platform footprint</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Current totals from platform statistics</p></div>
            <span className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">Live data</span>
          </div>
          {statsLoading ? <div className="flex h-64 items-center justify-center text-sm text-muted-foreground/70">Loading platform metrics…</div> : statsError || !stats ? <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border px-5 text-center text-sm text-muted-foreground">Platform statistics are unavailable. Chart data will appear when the API responds.</div> : (
            <div role="img" aria-label={`Platform totals: ${stats.totalSchools} schools, ${stats.totalStudents} students, ${stats.totalTeachers} teachers, ${stats.activeSubscriptions} active subscriptions`} className="h-64 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={[{ label: "Schools", value: stats.totalSchools, fill: "var(--chart-1)" }, { label: "Students", value: stats.totalStudents, fill: "var(--chart-2)" }, { label: "Teachers", value: stats.totalTeachers, fill: "var(--chart-3)" }, { label: "Active plans", value: stats.activeSubscriptions, fill: "var(--chart-4)" }]} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--chart-5)", fontSize: 11 }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={42} tick={{ fill: "var(--chart-5)", fontSize: 10 }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} formatter={(value) => [Number(value ?? 0).toLocaleString("en-GH"), "Total"]} />
                  <Bar dataKey="value" radius={[7, 7, 0, 0]} maxBarSize={48}>{[{ fill: "var(--chart-1)" }, { fill: "var(--chart-2)" }, { fill: "var(--chart-3)" }, { fill: "var(--chart-4)" }].map((item, index) => <Cell key={index} fill={item.fill} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="mt-3 text-[10px] leading-4 text-muted-foreground/70">Counts use different units; compare each category over time, not against one another.</p>
        </article>
        <article className="min-w-0 rounded-2xl border border-border/80 bg-card p-5 shadow-[0_4px_24px_rgba(15,23,42,0.035)] sm:p-6">
          <div className="mb-4"><h2 className="text-sm font-semibold text-foreground sm:text-base">Subscription mix</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Status of the five most recently enrolled schools shown below</p></div>
          {schoolsLoading ? <div className="flex h-48 items-center justify-center text-sm text-muted-foreground/70">Loading school records…</div> : schoolsError || !schools?.data.length ? <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border px-5 text-center text-sm text-muted-foreground">No school subscription data available yet.</div> : (() => {
            const groups = schools.data.reduce<Record<string, number>>((acc, school) => { const status = school.organization.subscriptionStatus || "UNKNOWN"; acc[status] = (acc[status] ?? 0) + 1; return acc; }, {});
            const palette = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "#e11d48", "var(--chart-4)"];
            const data = Object.entries(groups).map(([name, value]) => ({ name: name.replaceAll("_", " "), value }));
            return <><div role="img" aria-label={data.map((item) => `${item.name}: ${item.value} schools`).join(", ")} className="h-48 w-full min-w-0"><ResponsiveContainer width="100%" height="100%" minWidth={0}><PieChart><Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="58%" outerRadius="82%" paddingAngle={3} stroke="none">{data.map((item, index) => <Cell key={item.name} fill={palette[index % palette.length]} />)}</Pie><Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} formatter={(value) => [`${value ?? 0} schools`, "Count"]} /></PieChart></ResponsiveContainer></div><div className="mt-3 space-y-2">{data.map((item, index) => <div key={item.name} className="flex items-center justify-between gap-3 text-xs"><span className="flex min-w-0 items-center gap-2 text-muted-foreground"><span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: palette[index % palette.length] }} />{item.name}</span><span className="font-semibold tabular-nums text-foreground">{item.value}</span></div>)}</div></>;
          })()}
        </article>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_4px_24px_rgba(15,23,42,0.035)]">
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
