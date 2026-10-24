import { useQuery } from "@tanstack/react-query";
import { Printer, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

interface TimetableEntry {
  id: string;
  type: string;
  label?: string | null;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  subject?: { id: string; name: string; code?: string } | null;
  teacher?: { id: string; name: string } | null;
  classroom?: { id: string; name: string } | null;
}

interface StudentTimetableResponse {
  class: { id: string; name: string; level: string } | null;
  academicYear: { id: string; name: string } | null;
  term: { id: string; name: string } | null;
  entries: TimetableEntry[];
}

const DAY_ORDER = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

function formatDay(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function StudentTimetableView() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["timetable", "me"],
    queryFn: () => apiFetch<StudentTimetableResponse>("/timetable/me"),
    retry: false,
  });

  const entries = data?.entries ?? [];
  const days = [...new Set(entries.map((entry) => entry.dayOfWeek))].sort((a, b) => {
    const aOrder = DAY_ORDER.indexOf(a);
    const bOrder = DAY_ORDER.indexOf(b);
    if (aOrder < 0 && bOrder < 0) return a.localeCompare(b);
    if (aOrder < 0) return 1;
    if (bOrder < 0) return -1;
    return aOrder - bOrder;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white">My Timetable</h2>
          <p className="text-xs text-slate-500">
            {data?.class
              ? [data.class.name, data.class.level].filter(Boolean).join(" · ")
              : "Your current class schedule"}
            {data?.academicYear?.name ? " · " + data.academicYear.name : ""}
            {data?.term?.name ? " · " + data.term.name : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={isLoading || isError || entries.length === 0}
          className="inline-flex w-fit items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          <Printer className="size-4" />
          Print timetable
        </button>
      </div>

      {isLoading ? (
        <p className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Loading your timetable…
        </p>
      ) : isError ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm text-rose-600 dark:text-rose-400">
            Your timetable could not be loaded.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"
          >
            <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
            {isFetching ? "Retrying…" : "Try again"}
          </button>
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center dark:border-slate-700">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            No timetable entries are available for your current class.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Contact your school if you believe a timetable should be published.
          </p>
        </div>
      ) : (
        <div className={cn("grid gap-4", days.length > 1 ? "sm:grid-cols-2 xl:grid-cols-3" : "grid-cols-1")}>
          {days.map((day) => (
            <section
              key={day}
              className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900"
            >
              <h3 className="border-b border-slate-100 pb-2 text-sm font-bold text-slate-900 dark:border-slate-800 dark:text-white">
                {formatDay(day)}
              </h3>
              <div className="mt-3 space-y-2">
                {entries.filter((entry) => entry.dayOfWeek === day).map((entry) => (
                  <article
                    key={entry.id}
                    className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/50"
                  >
                    <p className="text-[11px] font-medium text-slate-500">
                      {entry.startTime} – {entry.endTime}
                    </p>
                    <p className="mt-1 text-sm font-bold text-indigo-700 dark:text-indigo-300">
                      {entry.subject?.name ?? entry.label ?? "Scheduled activity"}
                    </p>
                    {(entry.teacher?.name || entry.classroom?.name) && (
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        {[entry.teacher?.name, entry.classroom?.name].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
