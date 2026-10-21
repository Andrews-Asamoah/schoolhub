import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { batchAttendanceSchema } from "@schoolhub/shared";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

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
 * A class's daily register. The class teacher (or a school manager) can mark
 * it; everyone else who can open it sees the recorded statuses.
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

  return (
    <section aria-label={`Register for ${className}`} className="rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{className} register</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {canMark ? "Mark each pupil, then save." : "Only the class teacher can mark this register."}
          </p>
        </div>
        <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Date
          <input
            type="date"
            value={date}
            max={todayIso()}
            onChange={(event) => event.target.value && setDate(event.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium normal-case tracking-normal text-slate-700 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />
        </label>
      </div>

      {query.isPending && (
        <p className="flex items-center gap-2 p-5 text-xs text-slate-500">
          <LoaderCircle className="size-4 animate-spin" /> Loading register…
        </p>
      )}
      {query.error && (
        <p role="alert" className="m-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          The register could not be loaded: {query.error.message}
        </p>
      )}

      {rows && rows.length === 0 && (
        <p className="p-5 text-xs text-slate-500">No pupils are enrolled in this class this term.</p>
      )}

      {rows && rows.length > 0 && (
        <>
          {weekend && (
            <p className="mx-4 mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-400/10 dark:text-amber-200">
              This date is a weekend.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 px-4 pt-4 text-[11px]" aria-live="polite">
            <Chip tone="emerald">{counts.PRESENT} present</Chip>
            <Chip tone="rose">{counts.ABSENT} absent</Chip>
            <Chip tone="amber">{counts.LATE} late</Chip>
            {counts.other > 0 && <Chip tone="slate">{counts.other} excused / sick / permission</Chip>}
            <Chip tone="slate">{counts.unmarked} not marked</Chip>
            {canMark && (
              <button
                type="button"
                onClick={markAllPresent}
                className="ml-auto rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Mark unmarked as present
              </button>
            )}
          </div>

          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((row) => {
              const entry = draft[row.studentId] ?? { status: "", remarks: "" };
              return (
                <li key={row.studentId} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <div className="min-w-44 flex-1">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">{row.name}</p>
                    <p className="text-[10px] text-slate-400">{row.admissionNumber ?? "No admission number"}</p>
                  </div>
                  {canMark ? (
                    <>
                      <select
                        aria-label={`Attendance for ${row.name}`}
                        value={entry.status}
                        onChange={(event) => setStatus(row.studentId, event.target.value as Status | "")}
                        className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      >
                        <option value="">Not marked</option>
                        {STATUSES.map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                      {entry.status && entry.status !== "PRESENT" && (
                        <input
                          aria-label={`Note for ${row.name}`}
                          value={entry.remarks}
                          maxLength={200}
                          placeholder="Note (optional)"
                          onChange={(event) => setRemarks(row.studentId, event.target.value)}
                          className="h-9 w-48 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        />
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-slate-600 dark:text-slate-300">
                      {row.attendance ? LABEL[row.attendance.status] : "Not recorded"}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          {canMark && (
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 p-4 dark:border-slate-800">
              <button
                type="button"
                disabled={!dirty || !parsed.success || save.isPending}
                onClick={() => parsed.success && save.mutate(parsed.data)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {save.isPending && <LoaderCircle className="size-3.5 animate-spin" />}
                Save register
              </button>
              {dirty && !notice && <span className="text-[11px] text-slate-500">You have unsaved changes.</span>}
              {notice && (
                <p role="status" className="flex items-center gap-1.5 text-xs text-emerald-700">
                  <CircleCheck className="size-3.5" /> {notice}
                </p>
              )}
              {save.error && (
                <p role="alert" className="flex items-center gap-1.5 text-xs text-rose-700">
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

function Chip({ tone, children }: { tone: "emerald" | "rose" | "amber" | "slate"; children: React.ReactNode }) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
    rose: "bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300",
    amber: "bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300",
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  };
  return <span className={`rounded-full px-2.5 py-1 font-semibold ${tones[tone]}`}>{children}</span>;
}
