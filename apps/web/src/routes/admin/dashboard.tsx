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
import { Link, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/dashboard")({
  component: AdminDashboard,
});

interface PlatformStats {
  totalSchools: number;
  totalStudents: number;
  totalTeachers: number;
  activeSubscriptions: number;
}

interface SchoolSummary {
  id: string;
  name: string;
  code: string;
  subdomain: string;
  createdAt: string;
  organization: { subscriptionStatus: string; metadata: string | null };
  students: { id: string }[];
  teachers: { id: string }[];
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

  return (
    <div className="space-y-7">
      <section className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-[#111d48] via-[#1e3475] to-[#3158aa] px-6 py-7 text-white shadow-xl shadow-blue-950/10 sm:px-8 sm:py-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-32 size-80 rounded-full border border-white/10" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-2 -top-20 size-56 rounded-full border border-white/10" />
        <div aria-hidden="true" className="pointer-events-none absolute bottom-0 right-40 size-44 rounded-full bg-sky-400/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-blue-100 backdrop-blur">
              <Sparkles className="size-3.5 text-sky-200" />
              SchoolHub platform control
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Platform overview
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-blue-100/75">
              A real-time snapshot of schools, learners, educators, and subscriptions across your platform.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void navigate({ to: "/admin/schools/new" })}
            className="superadmin-button-secondary inline-flex h-11 items-center gap-2 rounded-xl border border-white/70 bg-white px-4 text-xs font-bold text-indigo-900 shadow-lg shadow-blue-950/15 transition hover:-translate-y-0.5 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-800"
          >
            <Plus className="size-4" />
            Enroll a school
            <ArrowRight className="size-3.5" />
          </button>
        </div>
      </section>

      {statsError && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
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

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_4px_24px_rgba(15,23,42,0.035)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Building2 className="size-5" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 sm:text-base">
                Recently enrolled schools
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {schools?.meta.total ?? 0} schools on the platform
              </p>
            </div>
          </div>
          <Link
            to="/admin/schools"
            className="superadmin-button-secondary group inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50 hover:text-indigo-900"
          >
            View all schools
            <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
        </div>

        {schoolsLoading ? (
          <div className="space-y-3 p-6" aria-label="Loading schools">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : schoolsError ? (
          <div role="alert" className="flex items-start gap-3 px-6 py-10 text-sm text-red-700 dark:text-red-300">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p>Schools could not be loaded: {schoolsError.message}</p>
          </div>
        ) : !schools || schools.data.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <School className="size-6" />
            </span>
            <p className="text-sm font-semibold text-slate-800">No schools enrolled yet</p>
            <p className="mb-5 mt-1 max-w-xs text-xs leading-5 text-slate-500">
              Enroll your first school to start managing your platform.
            </p>
            <Link
              to="/admin/schools/new"
              className="superadmin-button-primary inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
            >
              <Plus className="size-3.5" />
              Enroll a school
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left">
              <thead className="bg-slate-50/70">
                <tr className="border-b border-slate-100">
                  {["School", "Region", "Students", "Subscription", "Enrolled", ""].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-5 py-3.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {schools.data.map((school) => {
                  let region = "";
                  try {
                    const meta = school.organization.metadata
                      ? (JSON.parse(school.organization.metadata) as { region?: string })
                      : null;
                    region = meta?.region ?? "";
                  } catch {
                    /* ignore */
                  }

                  return (
                    <tr
                      key={school.id}
                      className="border-b border-slate-100 last:border-b-0 transition hover:bg-slate-50/70"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-xs font-bold text-indigo-600">
                            {school.name.slice(0, 1).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {school.name}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-slate-400">{school.subdomain}.schoolhub</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-500">
                        {region || "—"}
                      </td>
                      <td className="px-5 py-4 text-sm font-semibold tabular-nums text-slate-700">
                        {school.students.length}
                      </td>
                      <td className="px-5 py-4">
                        <SubscriptionBadge
                          status={school.organization.subscriptionStatus}
                        />
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-500">
                        {new Date(school.createdAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link
                          to="/admin/schools/$schoolId"
                          params={{ schoolId: school.id }}
                          className="superadmin-button-secondary inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50 hover:text-indigo-900"
                        >
                          View <ArrowRight className="size-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
