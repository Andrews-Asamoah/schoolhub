import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  Clock3,
  GraduationCap,
  MapPin,
  Printer,
  RefreshCw,
  Sparkles,
  Timer,
  UserRound,
  Zap,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

interface TimetableEntry {
  id: string;
  type: "LESSON" | "BREAK" | "ACTIVITY" | string;
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

type DayKey =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";

const DAYS: DayKey[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

const DAY_SHORT: Record<DayKey, string> = {
  MONDAY: "Mon",
  TUESDAY: "Tue",
  WEDNESDAY: "Wed",
  THURSDAY: "Thu",
  FRIDAY: "Fri",
  SATURDAY: "Sat",
  SUNDAY: "Sun",
};

function getDayKey(date: Date): DayKey {
  return DAYS[(date.getDay() + 6) % 7]!;
}

function formatDay(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatLongDate(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatClock(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);
}

function formatTime(value: string) {
  const minutes = parseTime(value);
  if (minutes === null) return value;
  const date = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function parseTime(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const suffix = match[3]?.toUpperCase();

  if (minute < 0 || minute > 59 || hour < 0 || hour > 24) return null;
  if (suffix) {
    if (hour < 1 || hour > 12) return null;
    if (suffix === "AM" && hour === 12) hour = 0;
    if (suffix === "PM" && hour !== 12) hour += 12;
  } else if (hour === 24) {
    if (minute !== 0) return null;
    hour = 24;
  }

  return hour * 60 + minute;
}

function periodTitle(entry: TimetableEntry) {
  if (entry.subject?.name) return entry.subject.name;
  if (entry.label?.trim()) return entry.label.trim();
  if (entry.type === "BREAK") return "Break time";
  if (entry.type === "ACTIVITY") return "School activity";
  return "Scheduled lesson";
}

function periodTypeLabel(type: string) {
  if (type === "BREAK") return "Break";
  if (type === "ACTIVITY") return "Activity";
  return "Lesson";
}

function teacherInitials(name?: string | null) {
  if (!name?.trim()) return "—";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function useLiveClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  return now;
}

function RetryMessage({
  message,
  onRetry,
  isFetching,
}: {
  message: string;
  onRetry: () => void;
  isFetching: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-9 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
        <RefreshCw className={cn("size-5", isFetching && "animate-spin")} />
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-100">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={isFetching}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60"
      >
        <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
        {isFetching ? "Refreshing…" : "Refresh timetable"}
      </button>
    </div>
  );
}

export function StudentTimetableView() {
  const now = useLiveClock();
  const [selectedDay, setSelectedDay] = useState<DayKey>(() => getDayKey(new Date()));

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["timetable", "me"],
    queryFn: () => apiFetch<StudentTimetableResponse>("/timetable/me"),
    retry: false,
  });

  const entries = data?.entries ?? [];
  const todayKey = getDayKey(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

  useEffect(() => {
    setSelectedDay(todayKey);
  }, [todayKey]);

  const entriesByDay = useMemo(() => {
    const grouped = Object.fromEntries(DAYS.map((day) => [day, [] as TimetableEntry[]])) as Record<
      DayKey,
      TimetableEntry[]
    >;

    for (const entry of entries) {
      if (DAYS.includes(entry.dayOfWeek as DayKey)) {
        grouped[entry.dayOfWeek as DayKey].push(entry);
      }
    }

    for (const day of DAYS) {
      grouped[day].sort((a, b) => {
        const startA = parseTime(a.startTime) ?? Number.MAX_SAFE_INTEGER;
        const startB = parseTime(b.startTime) ?? Number.MAX_SAFE_INTEGER;
        return startA - startB;
      });
    }

    return grouped;
  }, [entries]);

  const todayEntries = entriesByDay[todayKey];
  const selectedEntries = entriesByDay[selectedDay];

  const currentEntry =
    todayEntries.find((entry) => {
      const start = parseTime(entry.startTime);
      const end = parseTime(entry.endTime);
      return start !== null && end !== null && nowMinutes >= start && nowMinutes < end;
    }) ?? null;

  const nextEntry = useMemo(() => {
    if (entries.length === 0) return null;

    const todayIndex = DAYS.indexOf(todayKey);
    const currentWeekMinute = todayIndex * 24 * 60 + nowMinutes;
    let best:
      | { entry: TimetableEntry; minutesAway: number; dayOffset: number }
      | null = null;

    for (const entry of entries) {
      const dayIndex = DAYS.indexOf(entry.dayOfWeek as DayKey);
      const start = parseTime(entry.startTime);
      if (dayIndex < 0 || start === null) continue;

      const dayOffset = (dayIndex - todayIndex + DAYS.length) % DAYS.length;
      const absoluteStart = (todayIndex + dayOffset) * 24 * 60 + start;
      let minutesAway = absoluteStart - currentWeekMinute;
      if (minutesAway <= 0) minutesAway += DAYS.length * 24 * 60;

      if (!best || minutesAway < best.minutesAway) {
        best = { entry, minutesAway, dayOffset };
      }
    }

    return best;
  }, [entries, nowMinutes, todayKey]);

  const completedToday = todayEntries.filter((entry) => {
    const end = parseTime(entry.endTime);
    return end !== null && end <= nowMinutes;
  }).length;

  const currentStart = currentEntry ? parseTime(currentEntry.startTime) : null;
  const currentEnd = currentEntry ? parseTime(currentEntry.endTime) : null;
  const currentProgress =
    currentStart !== null && currentEnd !== null && currentEnd > currentStart
      ? Math.min(100, Math.max(0, ((nowMinutes - currentStart) / (currentEnd - currentStart)) * 100))
      : 0;
  const currentMinutesLeft =
    currentEnd !== null ? Math.max(0, Math.ceil(currentEnd - nowMinutes)) : 0;

  const nextOnSelectedDay =
    selectedDay === todayKey
      ? selectedEntries.find((entry) => {
          const start = parseTime(entry.startTime);
          return start !== null && start > nowMinutes;
        })?.id
      : selectedEntries[0]?.id;

  return (
    <div className="space-y-6">
      <section className="relative isolate overflow-hidden rounded-[28px] bg-gradient-to-br from-indigo-700 via-violet-700 to-slate-950 p-5 text-white shadow-xl shadow-indigo-950/10 sm:p-7 lg:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-20 size-72 rounded-full bg-fuchsia-400/20 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 left-1/3 size-72 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="relative grid gap-7 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-50">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-300 opacity-70" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-300" />
              </span>
              Live timetable
            </div>
            <h1 className="mt-4 max-w-2xl text-3xl font-black tracking-tight sm:text-4xl">
              Your school day,
              <span className="block text-indigo-200">in perfect rhythm.</span>
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-indigo-100/90 sm:text-base">
              Know what’s happening now, where to go next, and how your day unfolds.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold">
                <GraduationCap className="size-4 text-cyan-200" />
                {data?.class
                  ? [data.class.name, data.class.level].filter(Boolean).join(" · ")
                  : "Your class timetable"}
              </span>
              {data?.academicYear?.name && (
                <span className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold">
                  <CalendarDays className="size-4 text-violet-200" />
                  {data.academicYear.name}{data.term?.name ? ` · ${data.term.name}` : ""}
                </span>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/15 bg-white/10 p-5 shadow-lg shadow-slate-950/10 backdrop-blur-md sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-100">Local time</span>
              <Clock3 className="size-4 text-cyan-200" />
            </div>
            <time className="mt-2 block font-mono text-3xl font-black tracking-tight tabular-nums sm:text-4xl">
              {formatClock(now)}
            </time>
            <p className="mt-2 text-sm font-semibold text-white">{formatLongDate(now)}</p>
            <div className="mt-5 flex items-center justify-between border-t border-white/15 pt-4 text-xs">
              <span className="text-indigo-100/80">Schedule status</span>
              <span className="inline-flex items-center gap-1.5 font-bold text-emerald-200">
                <span className="size-1.5 rounded-full bg-emerald-300" />
                Updating live
              </span>
            </div>
          </div>
        </div>
      </section>

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-48 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
          <div className="h-48 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
        </div>
      ) : isError ? (
        <RetryMessage
          message="Your timetable could not be loaded."
          onRetry={() => void refetch()}
          isFetching={isFetching}
        />
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center dark:border-slate-700 dark:bg-slate-900">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
            <CalendarDays className="size-6" />
          </div>
          <h2 className="mt-4 text-base font-bold text-slate-900 dark:text-white">
            Your timetable is getting ready
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">
            There are no published periods for your current class yet. Check back later or contact your school office if you expect to see your schedule.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
            Refresh timetable
          </button>
        </div>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <section
              aria-live="polite"
              className={cn(
                "overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-slate-900",
                currentEntry
                  ? "border-emerald-200 dark:border-emerald-900/60"
                  : "border-slate-200/80 dark:border-slate-800",
              )}
            >
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                  <span className={cn(
                    "flex size-8 items-center justify-center rounded-xl",
                    currentEntry
                      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300"
                      : "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300",
                  )}>
                    <Zap className="size-4" />
                  </span>
                  {currentEntry ? "Happening right now" : "Your current status"}
                </div>
                <span className={cn(
                  "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide",
                  currentEntry
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                )}>
                  {currentEntry ? "In session" : "Between periods"}
                </span>
              </div>

              {currentEntry && currentStart !== null && currentEnd !== null ? (
                <div className="p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                        {periodTypeLabel(currentEntry.type)} · {formatTime(currentEntry.startTime)} – {formatTime(currentEntry.endTime)}
                      </p>
                      <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                        {periodTitle(currentEntry)}
                      </h2>
                      {currentEntry.subject?.code && (
                        <p className="mt-1 text-xs font-medium text-slate-500">{currentEntry.subject.code}</p>
                      )}
                    </div>
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300">
                      <Activity className="size-6" />
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600 dark:text-slate-300">
                    {currentEntry.teacher?.name && (
                      <span className="inline-flex items-center gap-2">
                        <UserRound className="size-4 text-indigo-500" />
                        {currentEntry.teacher.name}
                      </span>
                    )}
                    {currentEntry.classroom?.name && (
                      <span className="inline-flex items-center gap-2">
                        <MapPin className="size-4 text-indigo-500" />
                        {currentEntry.classroom.name}
                      </span>
                    )}
                    {!currentEntry.teacher?.name && !currentEntry.classroom?.name && (
                      <span className="text-slate-500">No teacher or room details have been assigned to this period.</span>
                    )}
                  </div>
                  <div className="mt-5">
                    <div className="mb-2 flex items-center justify-between gap-3 text-[11px]">
                      <span className="font-semibold text-slate-600 dark:text-slate-300">Period progress</span>
                      <span className="font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                        {currentMinutesLeft} min remaining
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label="Current period progress"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(currentProgress)}
                      className="h-2 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-950/70"
                    >
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-[width] duration-1000"
                        style={{ width: `${currentProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-40 flex-col justify-center p-5 sm:p-6">
                  <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">
                    You’re between classes.
                  </h2>
                  <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Take a breath, prepare your materials, and check the next period so you know where to be.
                  </p>
                  {nextEntry && (
                    <button
                      type="button"
                      onClick={() => setSelectedDay(nextEntry.entry.dayOfWeek as DayKey)}
                      className="mt-4 inline-flex w-fit items-center gap-2 text-xs font-bold text-indigo-700 transition hover:text-indigo-900 dark:text-indigo-300 dark:hover:text-indigo-200"
                    >
                      View next period <ArrowRight className="size-3.5" />
                    </button>
                  )}
                </div>
              )}
            </section>

            <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                  <span className="flex size-8 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300">
                    <Timer className="size-4" />
                  </span>
                  Up next
                </div>
                {nextEntry && (
                  <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-bold text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
                    {nextEntry.minutesAway < 60
                      ? `In ${Math.max(1, Math.ceil(nextEntry.minutesAway))} min`
                      : nextEntry.dayOffset === 0
                        ? "Later today"
                        : formatDay(nextEntry.entry.dayOfWeek)}
                  </span>
                )}
              </div>
              {nextEntry ? (
                <button
                  type="button"
                  onClick={() => setSelectedDay(nextEntry.entry.dayOfWeek as DayKey)}
                  className="group block w-full p-5 text-left transition hover:bg-slate-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:hover:bg-slate-800/60 sm:p-6"
                >
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {nextEntry.dayOffset === 0 ? "Today" : nextEntry.dayOffset === 1 ? "Tomorrow" : formatDay(nextEntry.entry.dayOfWeek)}
                    {nextEntry.dayOffset === 0 || nextEntry.dayOffset === 1 ? "" : ` · ${formatTime(nextEntry.entry.startTime)}`}
                  </p>
                  <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900 transition group-hover:text-indigo-700 dark:text-white dark:group-hover:text-indigo-300">
                    {periodTitle(nextEntry.entry)}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {formatTime(nextEntry.entry.startTime)} – {formatTime(nextEntry.entry.endTime)}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-300">
                    {nextEntry.entry.teacher?.name && (
                      <span className="inline-flex items-center gap-1.5">
                        <UserRound className="size-3.5 text-violet-500" /> {nextEntry.entry.teacher.name}
                      </span>
                    )}
                    {nextEntry.entry.classroom?.name && (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="size-3.5 text-violet-500" /> {nextEntry.entry.classroom.name}
                      </span>
                    )}
                  </div>
                  <span className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-violet-700 dark:text-violet-300">
                    Open {formatDay(nextEntry.entry.dayOfWeek)} schedule
                    <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
                  </span>
                </button>
              ) : (
                <div className="p-6 text-sm text-slate-500 dark:text-slate-400">
                  Your school has not published any upcoming periods.
                </div>
              )}
            </section>
          </div>

          <section className="space-y-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-indigo-600 dark:text-indigo-300">
                  <CalendarDays className="size-4" />
                  Your weekly plan
                </div>
                <h2 className="mt-1 text-xl font-black tracking-tight text-slate-900 dark:text-white sm:text-2xl">
                  Follow your day
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Your current period updates automatically as the day moves on.
                </p>
              </div>
              <button
                type="button"
                onClick={() => window.print()}
                disabled={entries.length === 0}
                className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50/50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Printer className="size-4" /> Print schedule
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-4">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {DAYS.map((day) => {
                  const isToday = day === todayKey;
                  const selected = day === selectedDay;
                  const count = entriesByDay[day].length;
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={selected}
                      aria-label={`Show ${formatDay(day)} timetable${isToday ? ", today" : ""}`}
                      onClick={() => setSelectedDay(day)}
                      className={cn(
                        "relative flex min-w-[74px] flex-1 flex-col items-center rounded-xl border px-3 py-3 text-center transition sm:min-w-0 sm:px-2",
                        selected
                          ? "border-indigo-600 bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                          : "border-transparent bg-slate-50 text-slate-600 hover:border-slate-200 hover:bg-slate-100 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:border-slate-700",
                      )}
                    >
                      {isToday && (
                        <span className={cn(
                          "mb-1 text-[9px] font-black uppercase tracking-wider",
                          selected ? "text-indigo-100" : "text-emerald-600 dark:text-emerald-300",
                        )}>
                          Today
                        </span>
                      )}
                      <span className="text-sm font-bold">{DAY_SHORT[day]}</span>
                      <span className={cn(
                        "mt-1 text-[10px] font-semibold",
                        selected ? "text-indigo-100" : "text-slate-400",
                      )}>
                        {count} {count === 1 ? "period" : "periods"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-emerald-500" /> Live now
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-violet-500" /> Next period
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-slate-300 dark:bg-slate-600" /> Completed
              </span>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
              <div className="mb-5 flex flex-col justify-between gap-2 border-b border-slate-100 pb-4 dark:border-slate-800 sm:flex-row sm:items-center">
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">{formatDay(selectedDay)}</h3>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {selectedDay === todayKey
                      ? `${completedToday} of ${todayEntries.length} periods completed today`
                      : `${selectedEntries.length} scheduled ${selectedEntries.length === 1 ? "period" : "periods"}`}
                  </p>
                </div>
                {selectedDay === todayKey && (
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" /> Live day view
                  </span>
                )}
              </div>

              {selectedEntries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center dark:border-slate-700">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                    <CalendarDays className="size-5" />
                  </div>
                  <p className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">
                    No periods scheduled for {formatDay(selectedDay)}.
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Choose another day to view your classes.
                  </p>
                </div>
              ) : (
                <ol className="relative space-y-3" aria-label={`${formatDay(selectedDay)} periods`}>
                  <div
                    aria-hidden="true"
                    className="absolute bottom-6 left-[7px] top-3 w-px bg-gradient-to-b from-slate-200 via-indigo-200 to-slate-200 dark:from-slate-700 dark:via-indigo-900 dark:to-slate-700"
                  />
                  {selectedEntries.map((entry) => {
                    const start = parseTime(entry.startTime);
                    const end = parseTime(entry.endTime);
                    const isCurrent =
                      selectedDay === todayKey &&
                      start !== null &&
                      end !== null &&
                      nowMinutes >= start &&
                      nowMinutes < end;
                    const isCompleted = selectedDay === todayKey && end !== null && end <= nowMinutes;
                    const isNext = entry.id === nextOnSelectedDay && !isCurrent;
                    const isFuture = selectedDay !== todayKey || (start !== null && start > nowMinutes);
                    const entryProgress =
                      isCurrent && start !== null && end !== null && end > start
                        ? Math.min(100, Math.max(0, ((nowMinutes - start) / (end - start)) * 100))
                        : 0;

                    return (
                      <li key={entry.id} className="relative pl-8">
                        <span
                          aria-hidden="true"
                          className={cn(
                            "absolute left-0 top-5 z-10 size-4 rounded-full border-[3px] border-white shadow-sm dark:border-slate-900",
                            isCurrent
                              ? "bg-emerald-500 ring-4 ring-emerald-100 dark:ring-emerald-950"
                              : isNext
                                ? "bg-violet-500 ring-4 ring-violet-100 dark:ring-violet-950"
                                : isCompleted
                                  ? "bg-slate-300 dark:bg-slate-600"
                                  : "bg-indigo-200 dark:bg-indigo-900",
                          )}
                        />
                        <article
                          className={cn(
                            "rounded-2xl border p-4 transition-all duration-300 sm:p-5",
                            isCurrent
                              ? "border-emerald-300 bg-gradient-to-br from-emerald-50 to-white shadow-lg shadow-emerald-950/5 ring-1 ring-emerald-100 dark:border-emerald-900 dark:from-emerald-950/40 dark:to-slate-900 dark:ring-emerald-950"
                              : isNext
                                ? "border-violet-200 bg-violet-50/40 shadow-sm dark:border-violet-900/60 dark:bg-violet-950/20"
                                : isCompleted
                                  ? "border-slate-100 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-800/30"
                                  : "border-slate-200/80 bg-white hover:border-indigo-200 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-900",
                          )}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-3">
                              <span className={cn(
                                "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl",
                                isCurrent
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200"
                                  : isNext
                                    ? "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-200"
                                    : "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300",
                              )}>
                                {entry.type === "BREAK" ? <Clock3 className="size-5" /> : entry.type === "ACTIVITY" ? <Sparkles className="size-5" /> : <BookOpen className="size-5" />}
                              </span>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className={cn(
                                    "text-sm font-black sm:text-base",
                                    isCompleted
                                      ? "text-slate-600 dark:text-slate-300"
                                      : "text-slate-900 dark:text-white",
                                  )}>
                                    {periodTitle(entry)}
                                  </h4>
                                  {isCurrent && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">
                                      <span className="size-1.5 animate-pulse rounded-full bg-white" /> Live now
                                    </span>
                                  )}
                                  {isNext && (
                                    <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">
                                      Next up
                                    </span>
                                  )}
                                  {isCompleted && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                                      <Check className="size-3" /> Completed
                                    </span>
                                  )}
                                </div>
                                <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                  {formatTime(entry.startTime)} – {formatTime(entry.endTime)}
                                  <span className="mx-2 text-slate-300 dark:text-slate-600">•</span>
                                  {periodTypeLabel(entry.type)}
                                  {entry.subject?.code ? ` · ${entry.subject.code}` : ""}
                                </p>
                              </div>
                            </div>
                            {isCurrent && (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white/70 px-2.5 py-1 text-[10px] font-bold text-emerald-800 dark:border-emerald-900 dark:bg-slate-900/70 dark:text-emerald-200">
                                <Timer className="size-3.5" /> {currentMinutesLeft} min left
                              </span>
                            )}
                          </div>

                          {(entry.teacher?.name || entry.classroom?.name) && (
                            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-200/70 pt-3 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
                              {entry.teacher?.name && (
                                <span className="inline-flex items-center gap-2">
                                  <span className={cn(
                                    "flex size-7 items-center justify-center rounded-full text-[9px] font-black",
                                    isCurrent
                                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-100"
                                      : "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-200",
                                  )}>
                                    {teacherInitials(entry.teacher.name)}
                                  </span>
                                  <span><span className="block text-[10px] text-slate-400">Teacher</span><span className="font-semibold">{entry.teacher.name}</span></span>
                                </span>
                              )}
                              {entry.classroom?.name && (
                                <span className="inline-flex items-center gap-2">
                                  <span className="flex size-7 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                                    <MapPin className="size-3.5" />
                                  </span>
                                  <span><span className="block text-[10px] text-slate-400">Room</span><span className="font-semibold">{entry.classroom.name}</span></span>
                                </span>
                              )}
                            </div>
                          )}

                          {isCurrent && (
                            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-950/70">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-[width] duration-1000"
                                style={{ width: `${entryProgress}%` }}
                              />
                            </div>
                          )}
                          {!isCurrent && !isCompleted && isFuture && entry.type !== "BREAK" && (
                            <div className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold text-slate-400">
                              <Activity className="size-3.5" /> Get ready for this period
                            </div>
                          )}
                        </article>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
