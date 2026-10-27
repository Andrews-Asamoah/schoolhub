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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  LESSON: "border-primary/20 bg-primary/10 text-primary",
  BREAK: "border-warning/20 bg-warning/10 text-warning",
  ACTIVITY: "border-success/20 bg-success/10 text-success",
};
const primary = "inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60";
const outline = "inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold text-foreground/80 hover:bg-muted/50 disabled:opacity-60";
const selectClass = "h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20";

export function TimetableWorkspace() {
  const queryClient = useQueryClient();
  const { activeRole } = useSchoolRole();
  const canEdit = ["owner", "admin", "headteacher"].includes(activeRole ?? "");
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
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div role="tablist" aria-label="Timetable view" className="flex rounded-lg border border-border p-0.5">
            {(["class", "teacher", "room"] as View[]).map((option) => (
              <button
                key={option}
                role="tab"
                type="button"
                aria-selected={view === option}
                onClick={() => { setView(option); setTargetId(""); setEditor(null); }}
                className={`h-8 rounded-md px-3 text-xs font-semibold capitalize ${view === option ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"}`}
              >
                {option === "room" ? "Room" : option}
              </button>
            ))}
          </div>
          <div className="min-w-[180px]">
            <label htmlFor="tt-target" className="mb-1 block text-[11px] font-medium text-muted-foreground">
              {view === "class" ? "Class" : view === "teacher" ? "Teacher" : "Room"}
            </label>
            <Select value={targetId || "__none__"} onValueChange={(value) => setTargetId(value === "__none__" ? "" : value)}>
              <SelectTrigger id="tt-target" className={selectClass}><SelectValue placeholder="Choose a target" /></SelectTrigger>
              <SelectContent>
                {options.length === 0 ? <SelectItem value="__none__" disabled>None available</SelectItem> : options.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {setup.academicYears.length > 1 && (
            <div className="min-w-[150px]">
              <label htmlFor="tt-year" className="mb-1 block text-[11px] font-medium text-muted-foreground">Academic year</label>
              <Select value={setup.academicYear.id} onValueChange={setYearId}>
                <SelectTrigger id="tt-year" className={selectClass}><SelectValue /></SelectTrigger>
                <SelectContent>{setup.academicYears.map((year) => <SelectItem key={year.id} value={year.id}>{year.name}{year.isCurrent ? " (current)" : ""}</SelectItem>)}</SelectContent>
              </Select>
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
          <p className="mt-3 text-[11px] text-muted-foreground">Switch to the Class view to add or change lessons.</p>
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
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
          {view === "class" && (
            <p className="border-b border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
              Periods for <span className="font-semibold text-foreground/80">{classDeptId ? departmentName : "classes without a department"}</span>
            </p>
          )}
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border/60 bg-muted/70">
                <th className="w-32 px-3 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Period</th>
                {days.map((day) => (
                  <th key={day} className="px-3 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{DAY_LABEL[day]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visiblePeriods.map((period) => (
                <tr key={period.id} className="border-b border-border/60 last:border-0">
                  <th scope="row" className="px-3 py-2 align-top text-left">
                    <span className="block text-xs font-semibold text-foreground">{period.name}</span>
                    <span className="text-[10px] text-muted-foreground">{period.startTime}–{period.endTime}</span>
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
                            className="flex h-full min-h-[58px] w-full items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground/50 transition hover:border-primary/30 hover:text-primary"
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
            <p className="px-4 py-2 text-[11px] text-muted-foreground/70" role="status">Updating…</p>
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
        ? "flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-xs text-destructive"
        : "rounded-xl border border-border bg-card px-4 py-6 text-center text-xs text-muted-foreground"}
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
    <section className="rounded-2xl border border-primary/20 bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-foreground">{entry ? "Edit lesson" : "Add to timetable"}</h3>
          <p className="text-xs text-muted-foreground">{DAY_LABEL[day]} · {period.name} ({period.startTime}–{period.endTime})</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted-foreground/70 hover:bg-muted"><X className="size-4" /></button>
      </div>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Type" htmlFor="entry-type">
            <Select value={type} onValueChange={(value) => setType(value as Entry["type"])}>
              <SelectTrigger id="entry-type" className={selectClass}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="LESSON">Lesson</SelectItem>
                <SelectItem value="BREAK">Break</SelectItem>
                <SelectItem value="ACTIVITY">Activity</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          {type !== "BREAK" && (
            <FormField label={type === "LESSON" ? "Subject" : "Subject (optional)"} htmlFor="entry-subject">
              <Select value={subjectId || "__none__"} onValueChange={(value) => {
                const nextSubjectId = value === "__none__" ? "" : value;
                setSubjectId(nextSubjectId);
                const suggestion = classSubjectIds.find((row) => row.subjectId === nextSubjectId)?.teacherId;
                if (suggestion && !teacherId) setTeacherId(suggestion);
              }}>
                <SelectTrigger id="entry-subject" className={selectClass}><SelectValue placeholder="Choose…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Choose…</SelectItem>
                  {subjectChoices.map((subject) => <SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
          )}
          {type === "LESSON" && (
            <FormField label="Teacher" htmlFor="entry-teacher" hint={suggestedTeacher ? "Assigned teacher pre-selected" : "Leave blank to use the assigned teacher"}>
              <Select value={teacherId || "__automatic__"} onValueChange={(value) => setTeacherId(value === "__automatic__" ? "" : value)}>
                <SelectTrigger id="entry-teacher" className={selectClass}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__automatic__">Automatic</SelectItem>
                  {setup.teachers.map((teacher) => <SelectItem key={teacher.id} value={teacher.id}>{teacher.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
          )}
          {type !== "BREAK" && (
            <FormField label="Room" htmlFor="entry-room">
              <Select value={classroomId || "__no_room__"} onValueChange={(value) => setClassroomId(value === "__no_room__" ? "" : value)}>
                <SelectTrigger id="entry-room" className={selectClass}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__no_room__">No room</SelectItem>
                  {setup.classrooms.map((room) => <SelectItem key={room.id} value={room.id}>{room.name}</SelectItem>)}
                </SelectContent>
              </Select>
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
            <button type="button" className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-60" disabled={remove.isPending} onClick={() => remove.mutate()}>
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
    <section className="rounded-2xl border border-primary/20 bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted-foreground/70 hover:bg-muted"><X className="size-4" /></button>
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
        <label htmlFor="period-department" className="mb-1 block text-[11px] font-medium text-muted-foreground">Department</label>
        <Select value={departmentId || "__default__"} onValueChange={(value) => chooseDepartment(value === "__default__" ? "" : value)}>
          <SelectTrigger id="period-department" className={selectClass}><SelectValue /></SelectTrigger>
          <SelectContent>
            {showDefault && <SelectItem value="__default__">Default (no department)</SelectItem>}
            {departments.map((department) => <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <ul className="mb-4 divide-y divide-border/60 rounded-xl border border-border">
        {periods.map((period) => (
          <li key={period.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
            <span><span className="font-semibold text-foreground">{period.name}</span> <span className="text-muted-foreground">{period.startTime}–{period.endTime}</span></span>
            <span className="flex gap-1">
              <button type="button" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label={`Edit ${period.name}`} onClick={() => open(period)}><Pencil className="size-3.5" /></button>
              <button
                type="button"
                className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
                aria-label={`Delete ${period.name}`}
                disabled={remove.isPending}
                onClick={() => { if (window.confirm(`Delete ${period.name}?`)) remove.mutate(period.id); }}
              ><Trash2 className="size-3.5" /></button>
            </span>
          </li>
        ))}
        {periods.length === 0 && <li className="px-3 py-3 text-xs text-muted-foreground">No periods for {currentName} yet.{copyTargets.length > 0 || departmentId ? " Add one below, or copy another department's periods from that department." : ""}</li>}
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
            <div className="mt-4 space-y-3 rounded-xl border border-border p-4">
              <div>
                <p className="text-xs font-semibold text-foreground">Copy {periods.length} period{periods.length === 1 ? "" : "s"} from {currentName} to:</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Existing periods in the target are kept. Periods with the same times are skipped, and ones that would overlap are skipped and reported. Lessons are not copied because teachers differ.</p>
              </div>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {copyTargets.map((department) => {
                  const existing = allPeriods.filter((p) => p.departmentId === department.id).length;
                  return (
                    <li key={department.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted/50">
                        <input
                          type="checkbox"
                          className="size-3.5 accent-primary"
                          checked={targets.includes(department.id)}
                          onChange={(e) => setTargets((current) => e.target.checked ? [...current, department.id] : current.filter((id) => id !== department.id))}
                        />
                        <span className="font-medium text-foreground">{department.name}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground">{existing} existing</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              {(copyProblem ?? copy.error?.message) && <Status tone="error">{copyProblem ?? copy.error?.message}</Status>}
              {copyResult && (
                <ul className="space-y-1 text-xs" role="status">
                  {copyResult.results.map((result) => (
                    <li key={result.departmentId} className="rounded-lg bg-muted/50 px-3 py-2">
                      <span className="font-semibold text-foreground">{result.departmentName}:</span>{" "}
                      copied {result.created}
                      {result.skipped.length > 0 && (
                        <span className="text-muted-foreground">
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
      <ul className="mb-4 divide-y divide-border/60 rounded-xl border border-border">
        {rooms.map((room) => (
          <li key={room.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
            <span><span className="font-semibold text-foreground">{room.name}</span>{room.capacity ? <span className="ml-2 text-muted-foreground">Seats {room.capacity}</span> : null}</span>
            <span className="flex gap-1">
              <button type="button" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label={`Edit ${room.name}`} onClick={() => open(room)}><Pencil className="size-3.5" /></button>
              <button
                type="button"
                className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
                aria-label={`Delete ${room.name}`}
                disabled={remove.isPending}
                onClick={() => { if (window.confirm(`Delete ${room.name}? Lessons keep running without a room.`)) remove.mutate(room.id); }}
              ><Trash2 className="size-3.5" /></button>
            </span>
          </li>
        ))}
        {rooms.length === 0 && <li className="px-3 py-3 text-xs text-muted-foreground">No rooms yet. Rooms are optional.</li>}
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
