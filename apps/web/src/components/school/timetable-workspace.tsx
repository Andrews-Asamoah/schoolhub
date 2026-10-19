import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CircleAlert, Copy, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  TIMETABLE_DAYS,
  copyPeriodsSchema,
  saveClassroomSchema,
  savePeriodSchema,
  saveTimetableEntrySchema,
  type SaveTimetableEntryInput,
  type TimetableDay,
} from "@schoolhub/shared";
import { FormField, FormInput } from "@/components/forms/form-controls";
import { TableExportMenu } from "@/components/ui/data-table";
import { useCanExportTables } from "@/lib/table-export-policy";
import type { ExportTable } from "@/lib/table-export";
import { useSchoolRole } from "@/components/school/school-role-switcher";
import { apiFetch } from "@/lib/api";

interface Period { id: string; name: string; startTime: string; endTime: string; sortOrder: number; departmentId: string | null }
interface Department { id: string; name: string; code: string }
interface Room { id: string; name: string; capacity: number | null }
interface Setup {
  academicYear: { id: string; name: string; isCurrent: boolean } | null;
  academicYears: { id: string; name: string; isCurrent: boolean }[];
  periods: Period[];
  classrooms: Room[];
  classes: { id: string; name: string; level: string; departmentId: string | null }[];
  departments: Department[];
  subjects: { id: string; name: string; code: string; periodsPerWeek: number }[];
  teachers: { id: string; name: string }[];
  classSubjects: { classId: string; subjectId: string; teacherId: string | null }[];
}
interface Entry {
  id: string;
  type: "LESSON" | "BREAK" | "ACTIVITY";
  label: string | null;
  dayOfWeek: TimetableDay;
  startTime: string;
  endTime: string;
  class: { id: string; name: string } | null;
  subject: { id: string; name: string; code: string } | null;
  teacher: { id: string; name: string } | null;
  classroom: { id: string; name: string } | null;
}
type View = "class" | "teacher" | "room";
type Editor = { entry?: Entry; day: TimetableDay; period: Period } | null;

const DAY_LABEL: Record<TimetableDay, string> = {
  MONDAY: "Mon", TUESDAY: "Tue", WEDNESDAY: "Wed", THURSDAY: "Thu", FRIDAY: "Fri", SATURDAY: "Sat", SUNDAY: "Sun",
};
const typeStyle: Record<Entry["type"], string> = {
  LESSON: "border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-300/20 dark:bg-indigo-400/10 dark:text-indigo-100",
  BREAK: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-300/20 dark:bg-amber-400/10 dark:text-amber-100",
  ACTIVITY: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-300/20 dark:bg-emerald-400/10 dark:text-emerald-100",
};
const primary = "inline-flex h-9 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60";
const outline = "inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5";
const selectClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-slate-950";

export function TimetableWorkspace() {
  const queryClient = useQueryClient();
  const { activeRole } = useSchoolRole();
  const canEdit = ["owner", "admin", "headmistress"].includes(activeRole ?? "");
  const isTeacher = activeRole === "teacher";
  const canExport = useCanExportTables();

  const [view, setView] = useState<View>(isTeacher ? "teacher" : "class");
  const [targetId, setTargetId] = useState("");
  const [yearId, setYearId] = useState("");
  const [editor, setEditor] = useState<Editor>(null);
  const [manage, setManage] = useState<"periods" | "rooms" | null>(null);

  const setupQuery = useQuery({
    queryKey: ["timetable", "setup", yearId],
    queryFn: () => apiFetch<Setup>(`/timetable/setup${yearId ? `?academicYearId=${yearId}` : ""}`),
  });
  const setup = setupQuery.data;

  // A teacher's own record is resolved by the API; others pick from the lists.
  const mineQuery = useQuery({
    queryKey: ["timetable", "mine", yearId],
    queryFn: () => apiFetch<{ teacherId: string }>(`/timetable/mine${yearId ? `?academicYearId=${yearId}` : ""}`),
    enabled: isTeacher,
    retry: false,
  });

  const options = useMemo(() => {
    if (!setup) return [];
    if (view === "class") return setup.classes.map((c) => ({ id: c.id, label: c.name }));
    if (view === "teacher") return setup.teachers.map((t) => ({ id: t.id, label: t.name }));
    return setup.classrooms.map((r) => ({ id: r.id, label: r.name }));
  }, [setup, view]);

  useEffect(() => {
    if (view === "teacher" && isTeacher && mineQuery.data && !targetId) {
      setTargetId(mineQuery.data.teacherId);
      return;
    }
    if (!options.some((option) => option.id === targetId)) setTargetId(options[0]?.id ?? "");
  }, [options, targetId, view, isTeacher, mineQuery.data]);

  const entriesQuery = useQuery({
    queryKey: ["timetable", "entries", view, targetId, setup?.academicYear?.id],
    queryFn: () =>
      apiFetch<{ entries: Entry[] }>(
        `/timetable?view=${view}&id=${targetId}${setup?.academicYear ? `&academicYearId=${setup.academicYear.id}` : ""}`,
      ),
    enabled: Boolean(targetId && setup?.academicYear),
  });
  const entries = entriesQuery.data?.entries ?? [];

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["timetable"] });

  const days = useMemo(() => {
    const extra = new Set(entries.map((e) => e.dayOfWeek));
    return TIMETABLE_DAYS.filter(
      (day, index) => index < 5 || extra.has(day),
    );
  }, [entries]);

  const cellMap = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const entry of entries) {
      const key = `${entry.dayOfWeek}|${entry.startTime}|${entry.endTime}`;
      map.set(key, [...(map.get(key) ?? []), entry]);
    }
    return map;
  }, [entries]);

  // Periods belong to a department. A class shows its own department's periods;
  // teacher and room views merge every department's periods by clock time.
  const classDeptId = view === "class" ? setup?.classes.find((c) => c.id === targetId)?.departmentId ?? null : null;
  const visiblePeriods = useMemo(() => {
    if (!setup) return [];
    if (view === "class") return setup.periods.filter((p) => (p.departmentId ?? null) === classDeptId);
    const merged = new Map<string, Period>();
    for (const period of setup.periods) {
      const key = `${period.startTime}|${period.endTime}`;
      if (!merged.has(key)) merged.set(key, period);
    }
    return [...merged.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [setup, view, classDeptId]);

  if (setupQuery.isPending) return <Status>Loading timetable…</Status>;
  if (setupQuery.error) return <Status tone="error">{setupQuery.error.message}</Status>;
  if (!setup?.academicYear) {
    return <Status tone="error">Set up a current academic year before building the timetable.</Status>;
  }
  const editableHere = canEdit && view === "class";
  const departmentName = classDeptId
    ? setup.departments.find((d) => d.id === classDeptId)?.name ?? "this department"
    : "the default (no department) schedule";
  const targetLabel = options.find((option) => option.id === targetId)?.label ?? "";

  function buildGridExport(): ExportTable {
    const text = (entry: Entry) =>
      [
        entry.type === "LESSON" ? entry.subject?.name ?? "Lesson" : entry.label ?? entry.type,
        view === "class" ? entry.teacher?.name : entry.class?.name,
        entry.classroom?.name,
      ].filter(Boolean).join(" · ");
    return {
      title: `Timetable - ${targetLabel}`,
      headers: ["Period", ...days.map((day) => DAY_LABEL[day])],
      rows: visiblePeriods.map((period) => [
        `${period.name} (${period.startTime}-${period.endTime})`,
        ...days.map((day) => (cellMap.get(`${day}|${period.startTime}|${period.endTime}`) ?? []).map(text).join("; ")),
      ]),
    };
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/70">
        <div className="flex flex-wrap items-end gap-3">
          <div role="tablist" aria-label="Timetable view" className="flex rounded-lg border border-slate-200 p-0.5 dark:border-white/10">
            {(["class", "teacher", "room"] as View[]).map((option) => (
              <button
                key={option}
                role="tab"
                type="button"
                aria-selected={view === option}
                onClick={() => { setView(option); setTargetId(""); setEditor(null); }}
                className={`h-8 rounded-md px-3 text-xs font-semibold capitalize ${view === option ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300"}`}
              >
                {option === "room" ? "Room" : option}
              </button>
            ))}
          </div>
          <div className="min-w-[180px]">
            <label htmlFor="tt-target" className="mb-1 block text-[11px] font-medium text-slate-500">
              {view === "class" ? "Class" : view === "teacher" ? "Teacher" : "Room"}
            </label>
            <select id="tt-target" className={selectClass} value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              {options.length === 0 && <option value="">None available</option>}
              {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </div>
          {setup.academicYears.length > 1 && (
            <div className="min-w-[150px]">
              <label htmlFor="tt-year" className="mb-1 block text-[11px] font-medium text-slate-500">Academic year</label>
              <select id="tt-year" className={selectClass} value={setup.academicYear.id} onChange={(e) => setYearId(e.target.value)}>
                {setup.academicYears.map((year) => <option key={year.id} value={year.id}>{year.name}{year.isCurrent ? " (current)" : ""}</option>)}
              </select>
            </div>
          )}
          {(canEdit || canExport) && (
            <div className="ml-auto flex gap-2">
              {canExport && visiblePeriods.length > 0 && targetId && <TableExportMenu build={buildGridExport} />}
              {canEdit && (<>
              <button type="button" className={outline} onClick={() => setManage(manage === "periods" ? null : "periods")}>
                <CalendarClock className="size-4" /> Periods
              </button>
              <button type="button" className={outline} onClick={() => setManage(manage === "rooms" ? null : "rooms")}>
                Rooms
              </button>
              </>)}
            </div>
          )}
        </div>
        {canEdit && view !== "class" && (
          <p className="mt-3 text-[11px] text-slate-500">Switch to the Class view to add or change lessons.</p>
        )}
      </section>

      {canEdit && manage === "periods" && (
        <PeriodManager
          periods={setup.periods}
          departments={setup.departments}
          hasUnassignedClasses={setup.classes.some((c) => !c.departmentId)}
          initialDepartmentId={view === "class" ? classDeptId : undefined}
          onClose={() => setManage(null)}
          onChanged={refresh}
        />
      )}
      {canEdit && manage === "rooms" && (
        <RoomManager rooms={setup.classrooms} onClose={() => setManage(null)} onChanged={refresh} />
      )}

      {visiblePeriods.length === 0 ? (
        <Status>
          {view !== "class"
            ? "No periods have been set up yet."
            : canEdit
              ? `Define the school day for ${departmentName}: open “Periods” and add the lesson and break times, or copy them from another department.`
              : "The school day has not been set up for this class's department yet."}
        </Status>
      ) : entriesQuery.error ? (
        <Status tone="error">{entriesQuery.error.message}</Status>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/70">
          {view === "class" && (
            <p className="border-b border-slate-100 px-4 py-2 text-[11px] text-slate-500 dark:border-white/10">
              Periods for <span className="font-semibold text-slate-700 dark:text-slate-200">{classDeptId ? departmentName : "classes without a department"}</span>
            </p>
          )}
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 dark:border-white/10 dark:bg-white/[0.03]">
                <th className="w-32 px-3 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Period</th>
                {days.map((day) => (
                  <th key={day} className="px-3 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{DAY_LABEL[day]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visiblePeriods.map((period) => (
                <tr key={period.id} className="border-b border-slate-100 last:border-0 dark:border-white/10">
                  <th scope="row" className="px-3 py-2 align-top text-left">
                    <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">{period.name}</span>
                    <span className="text-[10px] text-slate-500">{period.startTime}–{period.endTime}</span>
                  </th>
                  {days.map((day) => {
                    const cell = cellMap.get(`${day}|${period.startTime}|${period.endTime}`) ?? [];
                    return (
                      <td key={day} className="h-[74px] min-w-[120px] px-1.5 py-1.5 align-top">
                        {cell.map((entry) => (
                          <EntryCard
                            key={entry.id}
                            entry={entry}
                            view={view}
                            onClick={editableHere ? () => setEditor({ entry, day, period }) : undefined}
                          />
                        ))}
                        {cell.length === 0 && editableHere && (
                          <button
                            type="button"
                            aria-label={`Add lesson on ${DAY_LABEL[day]} during ${period.name}`}
                            onClick={() => setEditor({ day, period })}
                            className="flex h-full min-h-[58px] w-full items-center justify-center rounded-lg border border-dashed border-slate-200 text-slate-300 transition hover:border-indigo-300 hover:text-indigo-500 dark:border-white/10"
                          >
                            <Plus className="size-4" />
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {entriesQuery.isFetching && (
            <p className="px-4 py-2 text-[11px] text-slate-400" role="status">Updating…</p>
          )}
        </div>
      )}

      {editor && editableHere && targetId && (
        <EntryEditor
          key={`${editor.entry?.id ?? "new"}-${editor.day}-${editor.period.id}`}
          editor={editor}
          classId={targetId}
          setup={setup}
          onClose={() => setEditor(null)}
          onSaved={async () => { setEditor(null); await refresh(); }}
        />
      )}
    </div>
  );
}

function Status({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "error" }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={tone === "error"
        ? "flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800"
        : "rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-500"}
    >
      {tone === "error" && <CircleAlert className="mt-0.5 size-4 shrink-0" />}
      {children}
    </p>
  );
}

function EntryCard({ entry, view, onClick }: { entry: Entry; view: View; onClick?: () => void }) {
  const title = entry.type === "LESSON" ? entry.subject?.name ?? "Lesson" : entry.label ?? entry.type;
  const second =
    view === "class" ? entry.teacher?.name : view === "teacher" ? entry.class?.name : entry.class?.name;
  const content = (
    <>
      <span className="block truncate text-xs font-semibold">{title}</span>
      {second && <span className="block truncate text-[10px] opacity-80">{second}</span>}
      {view !== "room" && entry.classroom && <span className="block truncate text-[10px] opacity-70">{entry.classroom.name}</span>}
      {view === "room" && entry.teacher && <span className="block truncate text-[10px] opacity-70">{entry.teacher.name}</span>}
    </>
  );
  const className = `mb-1 block w-full rounded-lg border px-2 py-1.5 text-left ${typeStyle[entry.type]}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={`${className} transition hover:shadow-sm`} aria-label={`Edit ${title}`}>
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}

function EntryEditor({
  editor,
  classId,
  setup,
  onClose,
  onSaved,
}: {
  editor: NonNullable<Editor>;
  classId: string;
  setup: Setup;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { entry, day, period } = editor;
  const [type, setType] = useState<Entry["type"]>(entry?.type ?? "LESSON");
  const [subjectId, setSubjectId] = useState(entry?.subject?.id ?? "");
  const [teacherId, setTeacherId] = useState(entry?.teacher?.id ?? "");
  const [classroomId, setClassroomId] = useState(entry?.classroom?.id ?? "");
  const [label, setLabel] = useState(entry?.label ?? "");
  const [problem, setProblem] = useState<string | null>(null);

  // Prefer this class's own subjects when the school has assigned any.
  const classSubjectIds = setup.classSubjects.filter((row) => row.classId === classId);
  const subjectChoices = classSubjectIds.length
    ? setup.subjects.filter((subject) => classSubjectIds.some((row) => row.subjectId === subject.id))
    : setup.subjects;
  const suggestedTeacher = classSubjectIds.find((row) => row.subjectId === subjectId)?.teacherId ?? "";

  const mutation = useMutation({
    mutationFn: (input: SaveTimetableEntryInput) =>
      apiFetch(
        entry ? `/timetable/entries/${entry.id}?academicYearId=${setup.academicYear!.id}` : `/timetable/entries?academicYearId=${setup.academicYear!.id}`,
        { method: entry ? "PUT" : "POST", body: JSON.stringify(input) },
      ),
    onSuccess: onSaved,
  });
  const remove = useMutation({
    mutationFn: () => apiFetch(`/timetable/entries/${entry!.id}`, { method: "DELETE" }),
    onSuccess: onSaved,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = saveTimetableEntrySchema.safeParse({
      classId,
      dayOfWeek: day,
      periodId: period.id,
      type,
      subjectId: subjectId || undefined,
      teacherId: type === "LESSON" ? teacherId || undefined : undefined,
      classroomId: type === "BREAK" ? undefined : classroomId || undefined,
      label: label || undefined,
    });
    if (!parsed.success) {
      setProblem(parsed.error.issues[0]?.message ?? "Check the lesson details.");
      return;
    }
    setProblem(null);
    mutation.mutate(parsed.data);
  }

  const error = problem ?? mutation.error?.message ?? remove.error?.message;
  return (
    <section className="rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm dark:border-indigo-300/20 dark:bg-slate-900/70">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{entry ? "Edit lesson" : "Add to timetable"}</h3>
          <p className="text-xs text-slate-500">{DAY_LABEL[day]} · {period.name} ({period.startTime}–{period.endTime})</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="size-4" /></button>
      </div>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Type" htmlFor="entry-type">
            <select id="entry-type" className={selectClass} value={type} onChange={(e) => setType(e.target.value as Entry["type"])}>
              <option value="LESSON">Lesson</option>
              <option value="BREAK">Break</option>
              <option value="ACTIVITY">Activity</option>
            </select>
          </FormField>
          {type !== "BREAK" && (
            <FormField label={type === "LESSON" ? "Subject" : "Subject (optional)"} htmlFor="entry-subject">
              <select
                id="entry-subject"
                className={selectClass}
                value={subjectId}
                onChange={(e) => {
                  setSubjectId(e.target.value);
                  const suggestion = classSubjectIds.find((row) => row.subjectId === e.target.value)?.teacherId;
                  if (suggestion && !teacherId) setTeacherId(suggestion);
                }}
              >
                <option value="">Choose…</option>
                {subjectChoices.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
              </select>
            </FormField>
          )}
          {type === "LESSON" && (
            <FormField label="Teacher" htmlFor="entry-teacher" hint={suggestedTeacher ? "Assigned teacher pre-selected" : "Leave blank to use the assigned teacher"}>
              <select id="entry-teacher" className={selectClass} value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                <option value="">Automatic</option>
                {setup.teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
              </select>
            </FormField>
          )}
          {type !== "BREAK" && (
            <FormField label="Room" htmlFor="entry-room">
              <select id="entry-room" className={selectClass} value={classroomId} onChange={(e) => setClassroomId(e.target.value)}>
                <option value="">No room</option>
                {setup.classrooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
              </select>
            </FormField>
          )}
          {type !== "LESSON" && (
            <FormField label="Label" htmlFor="entry-label" hint="e.g. Lunch, Assembly, P.E.">
              <FormInput id="entry-label" value={label} onChange={(e) => setLabel(e.target.value)} />
            </FormField>
          )}
        </div>
        {error && <Status tone="error">{error}</Status>}
        <div className="flex items-center justify-between gap-2">
          {entry ? (
            <button type="button" className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60" disabled={remove.isPending} onClick={() => remove.mutate()}>
              <Trash2 className="size-4" /> Remove
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" className={outline} onClick={onClose}>Cancel</button>
            <button type="submit" className={primary} disabled={mutation.isPending}>
              {mutation.isPending && <LoaderCircle className="size-3.5 animate-spin" />}
              {entry ? "Save changes" : "Add"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}

function ManagerShell({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm dark:border-indigo-300/20 dark:bg-slate-900/70">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="size-4" /></button>
      </div>
      {children}
    </section>
  );
}

interface CopyResult {
  results: {
    departmentId: string;
    departmentName: string;
    created: number;
    skipped: { name: string; startTime: string; endTime: string; reason: "exists" | "overlap" }[];
  }[];
}

function PeriodManager({
  periods: allPeriods,
  departments,
  hasUnassignedClasses,
  initialDepartmentId,
  onClose,
  onChanged,
}: {
  periods: Period[];
  departments: Department[];
  hasUnassignedClasses: boolean;
  initialDepartmentId?: string | null;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const showDefault = hasUnassignedClasses || allPeriods.some((p) => !p.departmentId) || departments.length === 0;
  // "" stands for the default (no department) schedule.
  const [departmentId, setDepartmentId] = useState<string>(
    initialDepartmentId !== undefined ? initialDepartmentId ?? "" : departments[0]?.id ?? "",
  );
  const periods = useMemo(
    () => allPeriods.filter((p) => (p.departmentId ?? "") === departmentId),
    [allPeriods, departmentId],
  );
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [name, setName] = useState("");
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("08:40");
  const [problem, setProblem] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [targets, setTargets] = useState<string[]>([]);
  const [copyProblem, setCopyProblem] = useState<string | null>(null);
  const [copyResult, setCopyResult] = useState<CopyResult | null>(null);

  const save = useMutation({
    mutationFn: (input: { name: string; startTime: string; endTime: string; departmentId: string | null }) =>
      apiFetch(editingId && editingId !== "new" ? `/timetable/periods/${editingId}` : "/timetable/periods", {
        method: editingId && editingId !== "new" ? "PATCH" : "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => { setEditingId(null); await onChanged(); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/timetable/periods/${id}`, { method: "DELETE" }),
    onSuccess: onChanged,
  });
  const copy = useMutation({
    mutationFn: (input: { fromDepartmentId: string | null; toDepartmentIds: string[] }) =>
      apiFetch<CopyResult>("/timetable/periods/copy", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: async (result) => { setCopyResult(result); setTargets([]); await onChanged(); },
  });

  function chooseDepartment(id: string) {
    setDepartmentId(id);
    setEditingId(null);
    setCopying(false);
    setCopyResult(null);
    setTargets([]);
    save.reset();
    remove.reset();
  }
  function open(period?: Period) {
    save.reset();
    setProblem(null);
    setEditingId(period?.id ?? "new");
    setName(period?.name ?? `Period ${periods.length + 1}`);
    setStart(period?.startTime ?? periods.at(-1)?.endTime ?? "08:00");
    setEnd(period?.endTime ?? "");
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = savePeriodSchema.safeParse({ name, startTime: start, endTime: end, departmentId: departmentId || null });
    if (!parsed.success) return setProblem(parsed.error.issues[0]?.message ?? "Check the times.");
    setProblem(null);
    save.mutate({ ...parsed.data, departmentId: parsed.data.departmentId ?? null });
  }
  function submitCopy() {
    const parsed = copyPeriodsSchema.safeParse({ fromDepartmentId: departmentId || null, toDepartmentIds: targets });
    if (!parsed.success) return setCopyProblem(parsed.error.issues[0]?.message ?? "Choose where to copy.");
    setCopyProblem(null);
    setCopyResult(null);
    copy.mutate(parsed.data);
  }
  const error = problem ?? save.error?.message ?? remove.error?.message;
  const currentName = departmentId ? departments.find((d) => d.id === departmentId)?.name ?? "Department" : "Default (no department)";
  const copyTargets = departments.filter((d) => d.id !== departmentId);

  return (
    <ManagerShell
      title="School day periods"
      description="Each department has its own periods; every class in a department shares them. Periods in a department cannot overlap."
      onClose={onClose}
    >
      <div className="mb-4 max-w-xs">
        <label htmlFor="period-department" className="mb-1 block text-[11px] font-medium text-slate-500">Department</label>
        <select id="period-department" className={selectClass} value={departmentId} onChange={(e) => chooseDepartment(e.target.value)}>
          {showDefault && <option value="">Default (no department)</option>}
          {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
        </select>
      </div>
      <ul className="mb-4 divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-white/10 dark:border-white/10">
        {periods.map((period) => (
          <li key={period.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
            <span><span className="font-semibold text-slate-800 dark:text-slate-100">{period.name}</span> <span className="text-slate-500">{period.startTime}–{period.endTime}</span></span>
            <span className="flex gap-1">
              <button type="button" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10" aria-label={`Edit ${period.name}`} onClick={() => open(period)}><Pencil className="size-3.5" /></button>
              <button
                type="button"
                className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-400/10"
                aria-label={`Delete ${period.name}`}
                disabled={remove.isPending}
                onClick={() => { if (window.confirm(`Delete ${period.name}?`)) remove.mutate(period.id); }}
              ><Trash2 className="size-3.5" /></button>
            </span>
          </li>
        ))}
        {periods.length === 0 && <li className="px-3 py-3 text-xs text-slate-500">No periods for {currentName} yet.{copyTargets.length > 0 || departmentId ? " Add one below, or copy another department's periods from that department." : ""}</li>}
      </ul>
      {editingId ? (
        <form onSubmit={submit} className="space-y-3" noValidate>
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label="Name" htmlFor="period-name"><FormInput id="period-name" value={name} onChange={(e) => setName(e.target.value)} /></FormField>
            <FormField label="Starts" htmlFor="period-start"><FormInput id="period-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} /></FormField>
            <FormField label="Ends" htmlFor="period-end"><FormInput id="period-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></FormField>
          </div>
          {error && <Status tone="error">{error}</Status>}
          <div className="flex gap-2">
            <button type="submit" className={primary} disabled={save.isPending}>{editingId === "new" ? "Add period" : "Save period"}</button>
            <button type="button" className={outline} onClick={() => setEditingId(null)}>Cancel</button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={outline} onClick={() => open()}><Plus className="size-4" /> Add period</button>
            {periods.length > 0 && departments.length > (departmentId ? 1 : 0) && (
              <button type="button" className={outline} aria-expanded={copying} onClick={() => { setCopying(!copying); setCopyResult(null); setCopyProblem(null); }}>
                <Copy className="size-4" /> Copy to other departments
              </button>
            )}
          </div>
          {error && <div className="mt-3"><Status tone="error">{error}</Status></div>}
          {copying && (
            <div className="mt-4 space-y-3 rounded-xl border border-slate-200 p-4 dark:border-white/10">
              <div>
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">Copy {periods.length} period{periods.length === 1 ? "" : "s"} from {currentName} to:</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Existing periods in the target are kept. Periods with the same times are skipped, and ones that would overlap are skipped and reported. Lessons are not copied because teachers differ.</p>
              </div>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {copyTargets.map((department) => {
                  const existing = allPeriods.filter((p) => p.departmentId === department.id).length;
                  return (
                    <li key={department.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5">
                        <input
                          type="checkbox"
                          className="size-3.5 accent-indigo-600"
                          checked={targets.includes(department.id)}
                          onChange={(e) => setTargets((current) => e.target.checked ? [...current, department.id] : current.filter((id) => id !== department.id))}
                        />
                        <span className="font-medium text-slate-800 dark:text-slate-100">{department.name}</span>
                        <span className="ml-auto text-[10px] text-slate-500">{existing} existing</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              {(copyProblem ?? copy.error?.message) && <Status tone="error">{copyProblem ?? copy.error?.message}</Status>}
              {copyResult && (
                <ul className="space-y-1 text-xs" role="status">
                  {copyResult.results.map((result) => (
                    <li key={result.departmentId} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-white/5">
                      <span className="font-semibold text-slate-800 dark:text-slate-100">{result.departmentName}:</span>{" "}
                      copied {result.created}
                      {result.skipped.length > 0 && (
                        <span className="text-slate-500">
                          , skipped {result.skipped.length} ({result.skipped.map((p) => `${p.name} ${p.startTime}–${p.endTime} ${p.reason === "exists" ? "already exists" : "overlaps"}`).join("; ")})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <button type="button" className={primary} disabled={copy.isPending || targets.length === 0} onClick={submitCopy}>
                  {copy.isPending && <LoaderCircle className="size-3.5 animate-spin" />}
                  Copy periods
                </button>
                <button type="button" className={outline} onClick={() => setCopying(false)}>Close</button>
              </div>
            </div>
          )}
        </>
      )}
    </ManagerShell>
  );
}

function RoomManager({ rooms, onClose, onChanged }: { rooms: Room[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (input: { name: string; capacity?: number }) =>
      apiFetch(editingId && editingId !== "new" ? `/timetable/classrooms/${editingId}` : "/timetable/classrooms", {
        method: editingId && editingId !== "new" ? "PATCH" : "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => { setEditingId(null); await onChanged(); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/timetable/classrooms/${id}`, { method: "DELETE" }),
    onSuccess: onChanged,
  });

  function open(room?: Room) {
    save.reset();
    setProblem(null);
    setEditingId(room?.id ?? "new");
    setName(room?.name ?? "");
    setCapacity(room?.capacity ? String(room.capacity) : "");
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = saveClassroomSchema.safeParse({ name, capacity: capacity ? Number(capacity) : undefined });
    if (!parsed.success) return setProblem(parsed.error.issues[0]?.message ?? "Check the room details.");
    setProblem(null);
    save.mutate(parsed.data);
  }
  const error = problem ?? save.error?.message ?? remove.error?.message;

  return (
    <ManagerShell title="Rooms" description="Rooms can be picked for lessons; a room cannot host two classes in the same period." onClose={onClose}>
      <ul className="mb-4 divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-white/10 dark:border-white/10">
        {rooms.map((room) => (
          <li key={room.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
            <span><span className="font-semibold text-slate-800 dark:text-slate-100">{room.name}</span>{room.capacity ? <span className="ml-2 text-slate-500">Seats {room.capacity}</span> : null}</span>
            <span className="flex gap-1">
              <button type="button" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label={`Edit ${room.name}`} onClick={() => open(room)}><Pencil className="size-3.5" /></button>
              <button
                type="button"
                className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50"
                aria-label={`Delete ${room.name}`}
                disabled={remove.isPending}
                onClick={() => { if (window.confirm(`Delete ${room.name}? Lessons keep running without a room.`)) remove.mutate(room.id); }}
              ><Trash2 className="size-3.5" /></button>
            </span>
          </li>
        ))}
        {rooms.length === 0 && <li className="px-3 py-3 text-xs text-slate-500">No rooms yet. Rooms are optional.</li>}
      </ul>
      {editingId ? (
        <form onSubmit={submit} className="space-y-3" noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Room name" htmlFor="room-name"><FormInput id="room-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Science lab" /></FormField>
            <FormField label="Capacity (optional)" htmlFor="room-capacity"><FormInput id="room-capacity" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} /></FormField>
          </div>
          {error && <Status tone="error">{error}</Status>}
          <div className="flex gap-2">
            <button type="submit" className={primary} disabled={save.isPending}>{editingId === "new" ? "Add room" : "Save room"}</button>
            <button type="button" className={outline} onClick={() => setEditingId(null)}>Cancel</button>
          </div>
        </form>
      ) : (
        <>
          <button type="button" className={outline} onClick={() => open()}><Plus className="size-4" /> Add room</button>
          {error && <div className="mt-3"><Status tone="error">{error}</Status></div>}
        </>
      )}
    </ManagerShell>
  );
}
