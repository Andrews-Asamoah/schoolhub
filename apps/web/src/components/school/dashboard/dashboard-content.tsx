import {
  ChevronDown,
  CircleHelp,
  Plus,
} from "lucide-react";
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
        <SchoolYearCard />
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
