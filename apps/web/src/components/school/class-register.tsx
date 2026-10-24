import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { batchAttendanceSchema } from "@schoolhub/shared";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";

const STATUSES = [
  ["PRESENT", "Present"],
  ["ABSENT", "Absent"],
  ["LATE", "Late"],
  ["EXCUSED", "Excused"],
  ["SICK", "Sick"],
  ["PERMISSION", "Permission"],
] as const;
type Status = (typeof STATUSES)[number][0];
const LABEL = Object.fromEntries(STATUSES) as Record<Status, string>;

interface RegisterRow {
  studentId: string;
  admissionNumber: string | null;
  name: string;
  attendance: { status: Status; remarks?: string | null } | null;
}
type Draft = Record<string, { status: Status | ""; remarks: string }>;

const todayIso = () => new Date().toISOString().slice(0, 10);
const fromServer = (rows: RegisterRow[]): Draft =>
  Object.fromEntries(
    rows.map((row) => [row.studentId, { status: row.attendance?.status ?? "", remarks: row.attendance?.remarks ?? "" }]),
  );

/**
 * A class's daily register. Only the assigned class teacher can mark it;
 * school managers and other permitted roles can review recorded statuses.
 */
export function ClassRegister({ classId, className, canMark }: { classId: string; className: string; canMark: boolean }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayIso);
  const [draft, setDraft] = useState<Draft>({});
  const [notice, setNotice] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["attendance", "class", classId, date],
    queryFn: () => apiFetch<RegisterRow[]>(`/attendance/class/${classId}?date=${date}`),
    retry: false,
  });
  const rows = query.data;

  // Start from what is already recorded whenever the class, date or data changes.
  useEffect(() => {
    if (rows) setDraft(fromServer(rows));
    setNotice(null);
  }, [rows]);

  const save = useMutation({
    mutationFn: (body: unknown) => apiFetch("/attendance/batch", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: async () => {
      setNotice(`Register saved for ${new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}.`);
      await queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
  });

  const counts = useMemo(() => {
    const result = { PRESENT: 0, ABSENT: 0, LATE: 0, other: 0, unmarked: 0 };
    for (const entry of Object.values(draft)) {
      if (!entry.status) result.unmarked += 1;
      else if (entry.status === "PRESENT" || entry.status === "ABSENT" || entry.status === "LATE") result[entry.status] += 1;
      else result.other += 1;
    }
    return result;
  }, [draft]);

  const dirty = useMemo(
    () =>
      (rows ?? []).some((row) => {
        const entry = draft[row.studentId];
        const saved = row.attendance;
        return (entry?.status ?? "") !== (saved?.status ?? "") || (entry?.remarks ?? "") !== (saved?.remarks ?? "");
      }),
    [rows, draft],
  );

  function setStatus(studentId: string, status: Status | "") {
    setNotice(null);
    setDraft((current) => ({ ...current, [studentId]: { status, remarks: current[studentId]?.remarks ?? "" } }));
  }
  function setRemarks(studentId: string, remarks: string) {
    setNotice(null);
    setDraft((current) => ({ ...current, [studentId]: { status: current[studentId]?.status ?? "", remarks } }));
  }
  function markAllPresent() {
    setNotice(null);
    setDraft((current) =>
      Object.fromEntries(
        Object.entries(current).map(([id, entry]) => [id, { ...entry, status: entry.status || "PRESENT" }]),
      ),
    );
  }

  const parsed = batchAttendanceSchema.safeParse({
    date,
    records: Object.entries(draft)
      .filter(([, entry]) => entry.status)
      .map(([studentId, entry]) => ({
        studentId,
        status: entry.status,
        ...(entry.remarks.trim() ? { remarks: entry.remarks.trim() } : {}),
      })),
  });
  const weekend = [0, 6].includes(new Date(`${date}T00:00:00`).getDay());
  const marked = (rows?.length ?? 0) - counts.unmarked;

  return (
    <section aria-label={`Register for ${className}`} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-foreground">{className} register</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {canMark ? "Mark each pupil, then save." : "Only the class teacher can mark this register."}
          </p>
        </div>
        <div className="grid w-full gap-1.5 text-xs font-semibold text-foreground sm:w-56">
          <label>Date</label>
          <DatePicker
            value={date}
            maxDate={todayIso()}
            onChange={setDate}
            ariaLabel="Select attendance date"
          />
        </div>
      </div>

      {query.isPending && (
        <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" /> Loading register…
        </p>
      )}
      {query.error && (
        <p role="alert" className="m-4 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          The register could not be loaded: {query.error.message}
        </p>
      )}

      {rows && rows.length === 0 && (
        <p className="p-6 text-sm text-muted-foreground">No pupils are enrolled in this class this term.</p>
      )}

      {rows && rows.length > 0 && (
        <>
          {weekend && (
            <p className="mx-4 mt-4 flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm font-medium text-warning">
              <CircleAlert className="size-4 shrink-0" />
              This date falls on a weekend. Attendance is usually recorded on school days.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 sm:p-5" aria-live="polite">
            <SummaryCard tone="present" label="Present" value={counts.PRESENT} detail="Marked present" />
            <SummaryCard tone="absent" label="Absent" value={counts.ABSENT} detail="Marked absent" />
            <SummaryCard tone="late" label="Late" value={counts.LATE} detail="Arrived late" />
            <SummaryCard tone="progress" label="Register progress" value={marked} detail={`of ${rows.length} pupils marked`} />
          </div>
          {canMark && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border bg-muted/30 px-4 py-3 sm:px-5">
              <p className="text-sm text-muted-foreground">
                {counts.unmarked} pupil{counts.unmarked === 1 ? "" : "s"} still unmarked
              </p>
              <button
                type="button"
                onClick={markAllPresent}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Mark unmarked as present
              </button>
            </div>
          )}

          <ul className="mt-3 divide-y divide-border">
            {rows.map((row) => {
              const entry = draft[row.studentId] ?? { status: "", remarks: "" };
              return (
                <li key={row.studentId} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-44 flex-1">
                    <p className="text-sm font-semibold text-foreground">{row.name}</p>
                    <p className="text-xs text-muted-foreground">{row.admissionNumber ?? "No admission number"}</p>
                  </div>
                  {canMark ? (
                    <>
                      <Select
                        value={entry.status || "UNMARKED"}
                        onValueChange={(value) => setStatus(row.studentId, value === "UNMARKED" ? "" : value as Status)}
                      >
                        <SelectTrigger aria-label={`Attendance for ${row.name}`} className="w-full sm:w-44">
                          <SelectValue placeholder="Choose status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="UNMARKED">Not marked</SelectItem>
                          {STATUSES.map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {entry.status && entry.status !== "PRESENT" && (
                        <input
                          aria-label={`Note for ${row.name}`}
                          value={entry.remarks}
                          maxLength={200}
                          placeholder="Note (optional)"
                          onChange={(event) => setRemarks(row.studentId, event.target.value)}
                          className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring sm:w-48"
                        />
                      )}
                    </>
                  ) : (
                    <StatusPill status={row.attendance?.status ?? null} />
                  )}
                </li>
              );
            })}
          </ul>

          {canMark && (
            <div className="flex flex-col gap-3 border-t border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:p-5">
              <button
                type="button"
                disabled={!dirty || !parsed.success || save.isPending}
                onClick={() => parsed.success && save.mutate(parsed.data)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {save.isPending && <LoaderCircle className="size-3.5 animate-spin" />}
                Save register
              </button>
              {dirty && !notice && <span className="text-sm text-muted-foreground">You have unsaved changes.</span>}
              {notice && (
                <p role="status" className="flex items-center gap-2 text-sm text-foreground">
                  <CircleCheck className="size-3.5" /> {notice}
                </p>
              )}
              {save.error && (
                <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
                  <CircleAlert className="size-3.5" /> {save.error.message}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function SummaryCard({
  tone,
  label,
  value,
  detail,
}: {
  tone: "present" | "absent" | "late" | "progress";
  label: string;
  value: number;
  detail: string;
}) {
  const tones = {
    present: {
      border: "border-success/30",
      icon: "bg-success/10 text-success",
      value: "text-success",
      dot: "bg-success",
    },
    absent: {
      border: "border-destructive/30",
      icon: "bg-destructive/10 text-destructive",
      value: "text-destructive",
      dot: "bg-destructive",
    },
    late: {
      border: "border-warning/30",
      icon: "bg-warning/10 text-warning",
      value: "text-warning",
      dot: "bg-warning",
    },
    progress: {
      border: "border-info/30",
      icon: "bg-info/10 text-info",
      value: "text-info",
      dot: "bg-info",
    },
  }[tone];

  return (
    <article className={`rounded-xl border ${tones.border} bg-background p-3 shadow-sm transition-colors sm:p-4`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <span className={`size-2 rounded-full ${tones.dot}`} aria-hidden="true" />
      </div>
      <p className={`mt-2 text-3xl font-bold tracking-tight tabular-nums ${tones.value}`}>{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </article>
  );
}

function StatusPill({ status }: { status: Status | null }) {
  if (!status) {
    return (
      <span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
        Not recorded
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${
      status === "PRESENT" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
        : status === "ABSENT" ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
          : status === "LATE" ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
            : "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
    }`}>
      {LABEL[status]}
    </span>
  );
}
