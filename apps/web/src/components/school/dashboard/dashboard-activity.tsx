import {
  ArrowRight,
  CalendarDays,
  Check,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { recentActivities } from "@/components/school/dashboard/dashboard-data";

interface ScheduleItemProps {
  time: string;
  title: string;
  detail: string;
  color: string;
  status: "done" | "current" | "upcoming";
}

function ScheduleItem({
  time,
  title,
  detail,
  color,
  status,
}: ScheduleItemProps) {
  return (
    <div className="flex gap-3">
      <div className="w-11 shrink-0 pt-0.5 text-[10px] font-medium text-slate-400">
        {time}
      </div>
      <div className="relative flex min-w-0 flex-1 gap-3 border-l border-slate-100 pb-1 pl-4">
        <span
          className={cn(
            "absolute -left-[5px] top-1 size-2.5 rounded-full ring-4 ring-white",
            color,
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-xs font-semibold text-slate-800">
              {title}
            </p>
            {status === "done" && (
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <Check className="size-2.5" />
              </span>
            )}
            {status === "current" && (
              <span className="shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold text-blue-600">
                NOW
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-[10px] text-slate-500">{detail}</p>
        </div>
      </div>
    </div>
  );
}

export function ScheduleCard() {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.025)] sm:p-6">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Today&apos;s schedule
          </h2>
          <p className="mt-1 text-xs text-slate-500">Tuesday · October 13</p>
        </div>
        <button
          type="button"
          aria-label="More schedule options"
          className="flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </div>
      <div className="space-y-4">
        <ScheduleItem
          time="08:00"
          title="Morning assembly"
          detail="Main school courtyard"
          color="bg-blue-500"
          status="done"
        />
        <ScheduleItem
          time="10:30"
          title="Staff meeting"
          detail="Conference room · 12 attendees"
          color="bg-violet-500"
          status="current"
        />
        <ScheduleItem
          time="13:00"
          title="Mid-term assessments"
          detail="JHS 1 – JHS 3"
          color="bg-amber-500"
          status="upcoming"
        />
      </div>
      <button
        type="button"
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
      >
        View full calendar <ArrowRight className="size-3.5" />
      </button>
    </div>
  );
}

export function RecentActivityCard() {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.025)] sm:p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Recent activity
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            The latest updates across your school
          </p>
        </div>
        <button
          type="button"
          className="text-xs font-semibold text-blue-600 hover:text-blue-700"
        >
          View all
        </button>
      </div>
      <div className="divide-y divide-slate-100">
        {recentActivities.map(({ icon: Icon, color, title, detail, time }) => (
          <div
            key={title}
            className="flex items-center gap-3 py-3.5 first:pt-0 last:pb-0"
          >
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-xl",
                color,
              )}
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-800">
                {title}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-slate-500">
                {detail}
              </p>
            </div>
            <span className="shrink-0 text-[10px] text-slate-400">{time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SchoolYearCard({
  academicYear,
}: {
  academicYear?: {
    name: string;
    startDate: string;
    endDate: string;
    terms: { id: string; name: string; startDate: string; endDate: string; isCurrent: boolean }[];
  };
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.035)] sm:p-6 dark:border-white/10 dark:bg-slate-900/70">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Academic calendar</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
            {academicYear?.name ?? "Not configured"}
          </h2>
        </div>
        <span className="flex size-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-300">
          <CalendarDays className="size-[18px]" />
        </span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
        <span>{academicYear ? new Date(academicYear.startDate).toLocaleDateString() : "Set a start date"}</span>
        <span aria-hidden="true">→</span>
        <span>{academicYear ? new Date(academicYear.endDate).toLocaleDateString() : "Set an end date"}</span>
      </div>
      <div className="mt-5 border-t border-slate-100 pt-4 dark:border-white/10">
        <p className="mb-2 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
          {academicYear?.terms.length ?? 0} terms configured
        </p>
        {academicYear?.terms.length ? (
          <div className="flex flex-wrap gap-1.5">
            {academicYear.terms.map((term) => (
              <span
                key={term.id}
                className={`rounded-md border px-2 py-1 text-[10px] ${
                  term.isCurrent
                    ? "border-indigo-200 bg-indigo-50 font-semibold text-indigo-700 dark:border-indigo-300/20 dark:bg-indigo-400/10 dark:text-indigo-200"
                    : "border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400"
                }`}
              >
                {term.name}{term.isCurrent ? " · Current" : ""}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[11px] leading-5 text-slate-500 dark:text-slate-400">
            Create an academic year and its terms to prepare classes, billing, and assessments.
          </p>
        )}
      </div>
    </div>
  );
}
