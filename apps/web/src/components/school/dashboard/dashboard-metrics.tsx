import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { weeklyAttendance } from "@/components/school/dashboard/dashboard-data";

interface MetricCardProps {
  label: string;
  value: string;
  change: string;
  trend: "up" | "down";
  detail: string;
  icon: LucideIcon;
  iconClass: string;
}

export function MetricCard({
  label,
  value,
  change,
  trend,
  detail,
  icon: Icon,
  iconClass,
}: MetricCardProps) {
  const TrendIcon = trend === "up" ? ArrowUpRight : ArrowDownRight;

  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.025)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-3 text-[26px] font-bold tracking-tight text-slate-900 dark:text-white">
            {value}
          </p>
        </div>
        <span
          className={cn(
            "flex size-10 items-center justify-center rounded-xl",
            iconClass,
          )}
        >
          <Icon className="size-[18px]" />
        </span>
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        <span
          className={cn(
            "inline-flex items-center gap-0.5 text-[11px] font-semibold",
            trend === "up" ? "text-emerald-600" : "text-rose-600",
          )}
        >
          <TrendIcon className="size-3.5" />
          {change}
        </span>
        <span className="text-[11px] text-slate-400">{detail}</span>
      </div>
    </article>
  );
}

export function AttendanceOverviewCard() {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.025)] sm:p-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Attendance overview
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Student attendance throughout this week
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-2 rounded-lg border border-slate-200 px-2.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
        >
          This week <ChevronDown className="size-3.5" />
        </button>
      </div>
      <div className="mb-4 flex items-baseline gap-2">
        <span className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          92.8%
        </span>
        <span className="inline-flex items-center text-[11px] font-semibold text-emerald-600">
          <ArrowUpRight className="size-3.5" />
          3.2%
        </span>
        <span className="text-[11px] text-slate-400">vs. last week</span>
      </div>
      <div className="flex h-44 items-end gap-3 border-b border-slate-100 pb-2 sm:gap-5">
        {weeklyAttendance.map(({ day, value }) => (
          <div
            key={day}
            className="flex h-full flex-1 flex-col items-center justify-end gap-2"
          >
            <div className="flex h-full w-full items-end justify-center">
              <div
                className={cn(
                  "w-full max-w-12 rounded-t-md transition-colors",
                  day === "Thu"
                    ? "bg-blue-600"
                    : "bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/40 dark:hover:bg-blue-800/50",
                )}
                style={{ height: `${value}%` }}
                aria-label={`${day}: ${value}%`}
                role="img"
              />
            </div>
            <span className="text-[10px] font-medium text-slate-400">
              {day}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between text-[10px] text-slate-400">
        <span>Mon, Oct 12</span>
        <span>Fri, Oct 16</span>
      </div>
    </div>
  );
}
