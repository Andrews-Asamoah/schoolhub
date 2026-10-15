import {
  ChevronDown,
  CircleHelp,
  Check,
  CircleAlert,
  ArrowRight,
  BookOpen,
  Building2,
  CalendarDays,
  Plus,
  UsersRound,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { dashboardMetrics } from "@/components/school/dashboard/dashboard-data";
import {
  RecentActivityCard,
  ScheduleCard,
  SchoolYearCard,
} from "@/components/school/dashboard/dashboard-activity";
import {
  AttendanceOverviewCard,
  MetricCard,
} from "@/components/school/dashboard/dashboard-metrics";
import { apiFetch } from "@/lib/api";
import {
  schoolRoleLabel,
  useSchoolRole,
} from "@/components/school/school-role-switcher";
import { getSchoolNavGroupsForRole } from "@/lib/school-navigation";

interface SetupYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  terms: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    isCurrent: boolean;
  }[];
}

interface SetupSchool {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  academicYears: SetupYear[];
}

interface DashboardContentProps {
  today: string;
  greetingName: string;
  search: string;
}

export function DashboardContent({
  today,
  greetingName,
  search,
}: DashboardContentProps) {
  const { activeRole } = useSchoolRole();
  const isManagementRole = ["owner", "admin", "headmistress"].includes(
    activeRole ?? "",
  );
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
    {
      title: "Complete school profile",
      detail: "Confirm the school contact details.",
      complete:
        !!schoolQuery.data?.email &&
        !!schoolQuery.data.phone &&
        !!schoolQuery.data.address,
      icon: Building2,
      page: "settings",
    },
    {
      title: "Create academic year and terms",
      detail: "Define the dates that classes and school records follow.",
      complete: years.some((year) => year.terms.length > 0),
      icon: CalendarDays,
      page: "academic-years",
    },
    {
      title: "Add subjects",
      detail: "Set up the subjects taught at your school.",
      complete: (subjectsQuery.data?.length ?? 0) > 0,
      icon: BookOpen,
      page: "subjects",
    },
    {
      title: "Create classes",
      detail: "Organize learners under the current academic year.",
      complete: (classesQuery.data?.length ?? 0) > 0,
      icon: UsersRound,
      page: "classes",
    },
  ];
  const completedSteps = setupItems.filter((item) => item.complete).length;
  const setupHasError =
    schoolQuery.isError || classesQuery.isError || subjectsQuery.isError;

  if (!isManagementRole) {
    const roleLinks = getSchoolNavGroupsForRole(activeRole ?? undefined)
      .flatMap((group) => group.items)
      .slice(0, 6);
    return (
      <main className="mx-auto max-w-[1440px] px-4 py-7 sm:px-6 lg:px-9 lg:py-9">
        <div className="rounded-3xl border border-indigo-100 bg-gradient-to-br from-white via-indigo-50/60 to-sky-50/70 p-6 shadow-sm sm:p-9">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-700">
            {schoolRoleLabel(activeRole)}
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Welcome, {greetingName}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            You are viewing your {schoolRoleLabel(activeRole).toLowerCase()} workspace. Choose an area to continue.
          </p>
        </div>
        <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {roleLinks.map((item) => (
            <Link
              key={item.id}
              to="/$page"
              params={{ page: item.id }}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                <item.icon className="size-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-slate-900">
                  {item.label}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {item.description}
                </span>
              </span>
            </Link>
          ))}
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-7 sm:px-6 lg:px-9 lg:py-9">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <p className="text-xs font-medium text-slate-500">{today}</p>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700">
              Preview data
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[30px]">
            Good morning, {greetingName}
            <span className="ml-2 inline-block origin-bottom-right animate-[wave_1.8s_ease-in-out_infinite]">
              👋
            </span>
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Here&apos;s what&apos;s happening at your school today.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          <Plus className="size-4" />
          Quick action
          <ChevronDown className="size-3.5 opacity-80" />
        </button>
      </div>

      <section className="mb-6 overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-sm dark:border-indigo-300/10 dark:bg-slate-900/70">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50/90 via-white to-sky-50/70 px-5 py-5 sm:px-6 dark:border-white/10 dark:from-indigo-400/[0.08] dark:via-slate-900 dark:to-sky-400/[0.04]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-700 dark:text-indigo-300">
              Getting started
            </p>
            <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-900 dark:text-white">
              Prepare your school to run
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600 dark:text-slate-400">
              Set the calendar first, then complete the school profile, subjects, and classes. These are live setup checks—not sample dashboard figures.
            </p>
          </div>
          <div className="min-w-40 rounded-xl border border-indigo-100 bg-white/90 px-4 py-3 dark:border-white/10 dark:bg-slate-950/50">
            <p className="text-lg font-bold text-slate-900 dark:text-white">
              {completedSteps}<span className="text-slate-400">/{setupItems.length}</span>
            </p>
            <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400">setup steps complete</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all dark:bg-indigo-400"
                style={{ width: `${(completedSteps / setupItems.length) * 100}%` }}
              />
            </div>
          </div>
        </div>
        {setupHasError && (
          <p role="alert" className="flex items-center gap-2 border-b border-rose-100 bg-rose-50 px-5 py-2.5 text-xs text-rose-800 dark:border-rose-400/10 dark:bg-rose-400/[0.06] dark:text-rose-200">
            <CircleAlert className="size-4 shrink-0" />
            Some setup checks could not load. Refresh the page or retry after the API connection is restored.
          </p>
        )}
        <div className="grid gap-px bg-slate-100 sm:grid-cols-2 xl:grid-cols-4 dark:bg-white/[0.06]">
          {setupItems.map(({ title, detail, complete, icon: Icon, page }) => (
            <Link
              key={page}
              to="/$page"
              params={{ page }}
              className="group flex min-h-24 items-start gap-3 bg-white p-4 transition hover:bg-indigo-50/60 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:bg-slate-900 dark:hover:bg-white/[0.04]"
            >
              <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${
                complete
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200"
                  : "bg-indigo-50 text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-200"
              }`}>
                {complete ? <Check className="size-4" /> : <Icon className="size-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {title}
                </span>
                <span className="mt-1 block text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                  {complete ? "Done" : detail}
                </span>
              </span>
              <ArrowRight className="mt-1 size-3.5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-600 dark:text-slate-600 dark:group-hover:text-indigo-300" />
            </Link>
          ))}
        </div>
      </section>

      {search && (
        <p className="mb-4 text-xs text-slate-500">
          Dashboard preview for{" "}
          <span className="font-medium text-slate-700">{search}</span>
        </p>
      )}

      <section
        aria-label="School statistics"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {dashboardMetrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)]">
        <AttendanceOverviewCard />
        <ScheduleCard />
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <RecentActivityCard />
        <SchoolYearCard academicYear={activeYear} />
      </section>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 pb-2 text-[10px] text-slate-400">
        <CircleHelp className="size-3.5" />
        <span>
          Dashboard figures are sample data and will be connected to your
          school&apos;s live records.
        </span>
      </div>
    </main>
  );
}
