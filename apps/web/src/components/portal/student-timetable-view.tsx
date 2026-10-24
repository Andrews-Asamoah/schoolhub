import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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
    <div className="rounded-2xl border border-border bg-card px-5 py-9 text-center shadow-sm  ">
      <div className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-destructive/10 text-destructive  ">
        <RefreshCw className={cn("size-5", isFetching && "animate-spin")} />
      </div>
      <p className="mt-3 text-sm font-semibold text-foreground ">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={isFetching}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground transition hover:bg-primary disabled:cursor-wait disabled:opacity-60"
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
  const [isPrinting, setIsPrinting] = useState(false);

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

  const printSlots = useMemo(() => {
    const slots = new Map<string, { key: string; startTime: string; endTime: string; startMinutes: number; endMinutes: number }>();

    for (const entry of entries) {
      const startMinutes = parseTime(entry.startTime);
      const endMinutes = parseTime(entry.endTime);
      if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) continue;

      const key = `${entry.startTime}|${entry.endTime}`;
      if (!slots.has(key)) {
        slots.set(key, { key, startTime: entry.startTime, endTime: entry.endTime, startMinutes, endMinutes });
      }
    }

    return [...slots.values()].sort((a, b) =>
      a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes,
    );
  }, [entries]);

  useEffect(() => {
    if (!isPrinting) return;

    document.body.classList.add("printing-student-timetable");
    const finishPrinting = () => setIsPrinting(false);
    window.addEventListener("afterprint", finishPrinting);
    const printTimeout = window.setTimeout(() => window.print(), 100);

    return () => {
      window.clearTimeout(printTimeout);
      window.removeEventListener("afterprint", finishPrinting);
      document.body.classList.remove("printing-student-timetable");
    };
  }, [isPrinting]);

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
      const occurrenceDayOffset = Math.floor((nowMinutes + minutesAway) / (24 * 60));

      if (!best || minutesAway < best.minutesAway) {
        best = { entry, minutesAway, dayOffset: occurrenceDayOffset };
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
      <section className="relative isolate overflow-hidden rounded-[28px] bg-gradient-to-br from-brand via-brand-mid to-brand p-5 text-brand-foreground shadow-xl shadow-foreground/10 sm:p-7 lg:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-20 size-72 rounded-full bg-brand-glow/20 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 left-1/3 size-72 rounded-full bg-brand-accent/15 blur-3xl" />
        <div className="relative grid gap-7 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-foreground/15 bg-brand-foreground/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-brand-foreground/95">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-70" />
                <span className="relative inline-flex size-2 rounded-full bg-success" />
              </span>
              Live timetable
            </div>
            <h1 className="mt-4 max-w-2xl text-3xl font-black tracking-tight sm:text-4xl">
              Your school day,
              <span className="block text-brand-accent">in perfect rhythm.</span>
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-brand-foreground/85 sm:text-base">
              Know what’s happening now, where to go next, and how your day unfolds.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-xl border border-brand-foreground/15 bg-brand-foreground/10 px-3 py-2 text-xs font-semibold">
                <GraduationCap className="size-4 text-brand-accent" />
                {data?.class
                  ? [data.class.name, data.class.level].filter(Boolean).join(" · ")
                  : "Your class timetable"}
              </span>
              {data?.academicYear?.name && (
                <span className="inline-flex items-center gap-2 rounded-xl border border-brand-foreground/15 bg-brand-foreground/10 px-3 py-2 text-xs font-semibold">
                  <CalendarDays className="size-4 text-brand-accent" />
                  {data.academicYear.name}{data.term?.name ? ` · ${data.term.name}` : ""}
                </span>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-brand-foreground/15 bg-brand-foreground/10 p-5 shadow-lg shadow-foreground/10 backdrop-blur-md sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-foreground/80">Local time</span>
              <Clock3 className="size-4 text-info" />
            </div>
            <time className="mt-2 block font-mono text-3xl font-black tracking-tight tabular-nums sm:text-4xl">
              {formatClock(now)}
            </time>
            <p className="mt-2 text-sm font-semibold text-primary-foreground">{formatLongDate(now)}</p>
            <div className="mt-5 flex items-center justify-between border-t border-brand-foreground/15 pt-4 text-xs">
              <span className="text-brand-foreground/80">Schedule status</span>
              <span className="inline-flex items-center gap-1.5 font-bold text-success">
                <span className="size-1.5 rounded-full bg-success" />
                Updating live
              </span>
            </div>
          </div>
        </div>
      </section>

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-48 animate-pulse rounded-2xl bg-muted " />
          <div className="h-48 animate-pulse rounded-2xl bg-muted " />
        </div>
      ) : isError ? (
        <RetryMessage
          message="Your timetable could not be loaded."
          onRetry={() => void refetch()}
          isFetching={isFetching}
        />
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-10 text-center  ">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary  ">
            <CalendarDays className="size-6" />
          </div>
          <h2 className="mt-4 text-base font-bold text-foreground ">
            Your timetable is getting ready
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">
            {!data?.class ? "There is no current class enrollment linked to your student account." : "There are no published periods for your current class yet."} Check back later or contact your school office if you expect to see your schedule.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground transition hover:bg-primary disabled:opacity-50"
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
                "overflow-hidden rounded-2xl border bg-card shadow-sm ",
                currentEntry
                  ? "border-success/25 "
                  : "border-border ",
              )}
            >
              <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 ">
                <div className="flex items-center gap-2 text-sm font-bold text-foreground ">
                  <span className={cn(
                    "flex size-8 items-center justify-center rounded-xl",
                    currentEntry
                      ? "bg-success/10 text-success  "
                      : "bg-primary/10 text-primary  ",
                  )}>
                    <Zap className="size-4" />
                  </span>
                  {currentEntry ? "Happening right now" : "Your current status"}
                </div>
                <span className={cn(
                  "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide",
                  currentEntry
                    ? "bg-success/10 text-success  "
                    : "bg-muted text-muted-foreground  ",
                )}>
                  {currentEntry ? "In session" : "Between periods"}
                </span>
              </div>

              {currentEntry && currentStart !== null && currentEnd !== null ? (
                <div className="p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-success ">
                        {periodTypeLabel(currentEntry.type)} · {formatTime(currentEntry.startTime)} – {formatTime(currentEntry.endTime)}
                      </p>
                      <h2 className="mt-2 text-2xl font-black tracking-tight text-foreground  sm:text-3xl">
                        {periodTitle(currentEntry)}
                      </h2>
                      {currentEntry.subject?.code && (
                        <p className="mt-1 text-xs font-medium text-muted-foreground">{currentEntry.subject.code}</p>
                      )}
                    </div>
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-success/10 text-success  ">
                      <Activity className="size-6" />
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground ">
                    {currentEntry.teacher?.name && (
                      <span className="inline-flex items-center gap-2">
                        <UserRound className="size-4 text-primary" />
                        {currentEntry.teacher.name}
                      </span>
                    )}
                    {currentEntry.classroom?.name && (
                      <span className="inline-flex items-center gap-2">
                        <MapPin className="size-4 text-primary" />
                        {currentEntry.classroom.name}
                      </span>
                    )}
                    {!currentEntry.teacher?.name && !currentEntry.classroom?.name && (
                      <span className="text-muted-foreground">No teacher or room details have been assigned to this period.</span>
                    )}
                  </div>
                  <div className="mt-5">
                    <div className="mb-2 flex items-center justify-between gap-3 text-[11px]">
                      <span className="font-semibold text-muted-foreground ">Period progress</span>
                      <span className="font-bold tabular-nums text-success ">
                        {currentMinutesLeft} min remaining
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label="Current period progress"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(currentProgress)}
                      className="h-2 overflow-hidden rounded-full bg-success/10 "
                    >
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-success to-info transition-[width] duration-1000"
                        style={{ width: `${currentProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-40 flex-col justify-center p-5 sm:p-6">
                  <h2 className="text-xl font-black tracking-tight text-foreground ">
                    You’re between classes.
                  </h2>
                  <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground ">
                    Take a breath, prepare your materials, and check the next period so you know where to be.
                  </p>
                  {nextEntry && (
                    <button
                      type="button"
                      onClick={() => setSelectedDay(nextEntry.entry.dayOfWeek as DayKey)}
                      className="mt-4 inline-flex w-fit items-center gap-2 text-xs font-bold text-primary transition hover:text-primary  "
                    >
                      View next period <ArrowRight className="size-3.5" />
                    </button>
                  )}
                </div>
              )}
            </section>

            <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm  ">
              <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 ">
                <div className="flex items-center gap-2 text-sm font-bold text-foreground ">
                  <span className="flex size-8 items-center justify-center rounded-xl bg-highlight/10 text-highlight  ">
                    <Timer className="size-4" />
                  </span>
                  Up next
                </div>
                {nextEntry && (
                  <span className="rounded-full bg-highlight/10 px-2.5 py-1 text-[10px] font-bold text-highlight  ">
                    {nextEntry.minutesAway < 60
                      ? `In ${Math.max(1, Math.ceil(nextEntry.minutesAway))} min`
                      : nextEntry.dayOffset === 0
                        ? "Later today"
                        : nextEntry.dayOffset === 7
                          ? `Next ${formatDay(nextEntry.entry.dayOfWeek)}`
                          : formatDay(nextEntry.entry.dayOfWeek)}
                  </span>
                )}
              </div>
              {nextEntry ? (
                <button
                  type="button"
                  onClick={() => setSelectedDay(nextEntry.entry.dayOfWeek as DayKey)}
                  className="group block w-full p-5 text-left transition hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/15  sm:p-6"
                >
                  <p className="text-xs font-semibold text-muted-foreground ">
                    {nextEntry.dayOffset === 0
                      ? "Today"
                      : nextEntry.dayOffset === 1
                        ? "Tomorrow"
                        : nextEntry.dayOffset === 7
                          ? `Next ${formatDay(nextEntry.entry.dayOfWeek)}`
                          : formatDay(nextEntry.entry.dayOfWeek)}
                    {nextEntry.dayOffset <= 1 ? "" : ` · ${formatTime(nextEntry.entry.startTime)}`}
                  </p>
                  <h2 className="mt-2 text-xl font-black tracking-tight text-foreground transition group-hover:text-primary  ">
                    {periodTitle(nextEntry.entry)}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground ">
                    {formatTime(nextEntry.entry.startTime)} – {formatTime(nextEntry.entry.endTime)}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground ">
                    {nextEntry.entry.teacher?.name && (
                      <span className="inline-flex items-center gap-1.5">
                        <UserRound className="size-3.5 text-highlight" /> {nextEntry.entry.teacher.name}
                      </span>
                    )}
                    {nextEntry.entry.classroom?.name && (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="size-3.5 text-highlight" /> {nextEntry.entry.classroom.name}
                      </span>
                    )}
                  </div>
                  <span className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-highlight ">
                    Open {formatDay(nextEntry.entry.dayOfWeek)} schedule
                    <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
                  </span>
                </button>
              ) : (
                <div className="p-6 text-sm text-muted-foreground ">
                  Your school has not published any upcoming periods.
                </div>
              )}
            </section>
          </div>

          <section className="space-y-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-primary ">
                  <CalendarDays className="size-4" />
                  Your weekly plan
                </div>
                <h2 className="mt-1 text-xl font-black tracking-tight text-foreground  sm:text-2xl">
                  Follow your day
                </h2>
                <p className="mt-1 text-sm text-muted-foreground ">
                  Your current period updates automatically as the day moves on.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPrinting(true)}
                disabled={entries.length === 0}
                className="inline-flex w-fit items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs font-bold text-foreground shadow-sm transition hover:border-primary/20 hover:bg-primary/10 disabled:opacity-50    "
              >
                <Printer className="size-4" /> Print schedule
              </button>
            </div>

            <div className="rounded-2xl border border-border bg-card p-3 shadow-sm   sm:p-4">
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
                          ? "border-primary/20 bg-primary text-primary-foreground shadow-md shadow-primary/10"
                          : "border-transparent bg-muted/50 text-muted-foreground hover:border-border hover:bg-muted   ",
                      )}
                    >
                      {isToday && (
                        <span className={cn(
                          "mb-1 text-[9px] font-black uppercase tracking-wider",
                          selected ? "text-primary" : "text-success ",
                        )}>
                          Today
                        </span>
                      )}
                      <span className="text-sm font-bold">{DAY_SHORT[day]}</span>
                      <span className={cn(
                        "mt-1 text-[10px] font-semibold",
                        selected ? "text-primary" : "text-muted-foreground",
                      )}>
                        {count} {count === 1 ? "period" : "periods"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-medium text-muted-foreground ">
              <span className="inline-flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-success/20" /> Live now
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-highlight/20" /> Next period
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-muted " /> Completed
              </span>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm   sm:p-6">
              <div className="mb-5 flex flex-col justify-between gap-2 border-b border-border pb-4  sm:flex-row sm:items-center">
                <div>
                  <h3 className="text-lg font-black text-foreground ">{formatDay(selectedDay)}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground ">
                    {selectedDay === todayKey
                      ? `${completedToday} of ${todayEntries.length} periods completed today`
                      : `${selectedEntries.length} scheduled ${selectedEntries.length === 1 ? "period" : "periods"}`}
                  </p>
                </div>
                {selectedDay === todayKey && (
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-success/10 px-3 py-1.5 text-[10px] font-bold text-success  ">
                    <span className="size-1.5 animate-pulse rounded-full bg-success/20" /> Live day view
                  </span>
                )}
              </div>

              {selectedEntries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center ">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground  ">
                    <CalendarDays className="size-5" />
                  </div>
                  <p className="mt-3 text-sm font-bold text-foreground ">
                    No periods scheduled for {formatDay(selectedDay)}.
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground ">
                    Choose another day to view your classes.
                  </p>
                </div>
              ) : (
                <div className="relative">
                  <div
                    aria-hidden="true"
                    className="absolute bottom-6 left-[7px] top-3 w-px bg-gradient-to-b from-muted via-primary/15 to-muted   "
                  />
                  <ol className="relative space-y-3" aria-label={`${formatDay(selectedDay)} periods`}>
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
                            "absolute left-0 top-5 z-10 size-4 rounded-full border-[3px] border-card shadow-sm ",
                            isCurrent
                              ? "bg-success/20 ring-4 ring-success/20 "
                              : isNext
                                ? "bg-highlight/20 ring-4 ring-highlight/15 "
                                : isCompleted
                                  ? "bg-muted "
                                  : "bg-primary/10 ",
                          )}
                        />
                        <article
                          className={cn(
                            "rounded-2xl border p-4 transition-all duration-300 sm:p-5",
                            isCurrent
                              ? "border-success/25 bg-gradient-to-br from-success/10 to-card shadow-lg shadow-success/10 ring-1 ring-success/20    "
                              : isNext
                                ? "border-highlight/20 bg-highlight/10 shadow-sm  "
                                : isCompleted
                                  ? "border-border bg-muted/50  "
                                  : "border-border bg-card hover:border-primary/20 hover:shadow-sm   ",
                          )}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-3">
                              <span className={cn(
                                "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl",
                                isCurrent
                                  ? "bg-success/10 text-success  "
                                  : isNext
                                    ? "bg-highlight/10 text-highlight  "
                                    : "bg-primary/10 text-primary  ",
                              )}>
                                {entry.type === "BREAK" ? <Clock3 className="size-5" /> : entry.type === "ACTIVITY" ? <Sparkles className="size-5" /> : <BookOpen className="size-5" />}
                              </span>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className={cn(
                                    "text-sm font-black sm:text-base",
                                    isCompleted
                                      ? "text-muted-foreground "
                                      : "text-foreground ",
                                  )}>
                                    {periodTitle(entry)}
                                  </h4>
                                  {isCurrent && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-success px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-success-foreground">
                                      <span className="size-1.5 animate-pulse rounded-full bg-success-foreground" /> Live now
                                    </span>
                                  )}
                                  {isNext && (
                                    <span className="rounded-full bg-highlight px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-highlight-foreground">
                                      Next up
                                    </span>
                                  )}
                                  {isCompleted && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[9px] font-bold uppercase text-muted-foreground  ">
                                      <Check className="size-3" /> Completed
                                    </span>
                                  )}
                                </div>
                                <p className="mt-1 text-xs font-semibold text-muted-foreground ">
                                  {formatTime(entry.startTime)} – {formatTime(entry.endTime)}
                                  <span className="mx-2 text-muted-foreground ">•</span>
                                  {periodTypeLabel(entry.type)}
                                  {entry.subject?.code ? ` · ${entry.subject.code}` : ""}
                                </p>
                              </div>
                            </div>
                            {isCurrent && (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-card/70 px-2.5 py-1 text-[10px] font-bold text-success   ">
                                <Timer className="size-3.5" /> {currentMinutesLeft} min left
                              </span>
                            )}
                          </div>

                          {(entry.teacher?.name || entry.classroom?.name) && (
                            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-3 text-xs text-muted-foreground  ">
                              {entry.teacher?.name && (
                                <span className="inline-flex items-center gap-2">
                                  <span className={cn(
                                    "flex size-7 items-center justify-center rounded-full text-[9px] font-black",
                                    isCurrent
                                      ? "bg-success/10 text-success  "
                                      : "bg-primary/10 text-primary  ",
                                  )}>
                                    {teacherInitials(entry.teacher.name)}
                                  </span>
                                  <span><span className="block text-[10px] text-muted-foreground">Teacher</span><span className="font-semibold">{entry.teacher.name}</span></span>
                                </span>
                              )}
                              {entry.classroom?.name && (
                                <span className="inline-flex items-center gap-2">
                                  <span className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground  ">
                                    <MapPin className="size-3.5" />
                                  </span>
                                  <span><span className="block text-[10px] text-muted-foreground">Room</span><span className="font-semibold">{entry.classroom.name}</span></span>
                                </span>
                              )}
                            </div>
                          )}

                          {isCurrent && (
                            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-success/10 ">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-success to-info transition-[width] duration-1000"
                                style={{ width: `${entryProgress}%` }}
                              />
                            </div>
                          )}
                          {!isCurrent && !isCompleted && isFuture && entry.type !== "BREAK" && (
                            <div className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
                              <Activity className="size-3.5" /> Get ready for this period
                            </div>
                          )}
                        </article>
                      </li>
                    );
                  })}
                  </ol>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
    {createPortal(
      <section
        className="student-timetable-print"
        aria-hidden={!isPrinting}
        data-density={printSlots.length > 14 ? "tight" : printSlots.length > 10 ? "compact" : "standard"}
      >
        <header className="student-timetable-print-header">
          <div>
            <p className="student-timetable-print-eyebrow">SchoolHub · Weekly schedule</p>
            <h1>Class Timetable{data?.class?.name ? ` — ${data.class.name}` : ""}</h1>
            <p className="student-timetable-print-subtitle">
              {[data?.class?.level, data?.academicYear?.name, data?.term?.name].filter(Boolean).join(" · ") || "Current academic schedule"}
            </p>
          </div>
          <div className="student-timetable-print-datestamp">
            <span>Printed on</span>
            <strong>{formatLongDate(now)}</strong>
            <span>{formatClock(now)}</span>
          </div>
        </header>

        {printSlots.length === 0 ? (
          <p className="student-timetable-print-empty">No valid timetable periods are available to print.</p>
        ) : (
          <table className="student-timetable-print-table">
            <colgroup>
              <col className="student-timetable-print-time-column" />
              {DAYS.map((day) => <col key={day} />)}
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Time</th>
                {DAYS.map((day) => (
                  <th key={day} scope="col">
                    {formatDay(day)}
                    {day === todayKey && <span className="student-timetable-print-today">Today</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {printSlots.map((slot) => (
                <tr key={slot.key}>
                  <th scope="row">
                    <span>{formatTime(slot.startTime)}</span>
                    <span className="student-timetable-print-time-end">{formatTime(slot.endTime)}</span>
                  </th>
                  {DAYS.map((day) => {
                    const slotEntries = entriesByDay[day].filter(
                      (entry) => entry.startTime === slot.startTime && entry.endTime === slot.endTime,
                    );
                    return (
                      <td
                        key={day}
                        className={cn(
                          "student-timetable-print-cell",
                          slotEntries.some((entry) =>
                            day === todayKey &&
                            nowMinutes >= slot.startMinutes &&
                            nowMinutes < slot.endMinutes,
                          ) && "student-timetable-print-current",
                        )}
                      >
                        {slotEntries.map((entry) => {
                          const isCurrent = day === todayKey &&
                            nowMinutes >= slot.startMinutes &&
                            nowMinutes < slot.endMinutes;
                          const details = [
                            entry.teacher?.name,
                            entry.classroom?.name,
                          ].filter(Boolean);

                          return (
                            <div className="student-timetable-print-period" key={entry.id}>
                              <strong className="student-timetable-print-period-title">
                                {periodTitle(entry)}
                              </strong>
                              {entry.subject?.code && (
                                <span className="student-timetable-print-meta">{entry.subject.code}</span>
                              )}
                              {details.length > 0 && (
                                <span className="student-timetable-print-meta">{details.join(" · ")}</span>
                              )}
                              {isCurrent && (
                                <span className="student-timetable-print-current-label">NOW</span>
                              )}
                            </div>
                          );
                        })}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <footer className="student-timetable-print-footer">
          <span>Times and allocations follow the school's published timetable.</span>
          <span>{printSlots.length} time slots · Monday–Sunday</span>
        </footer>
      </section>,
      document.body,
    )}
  );
}
