import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, Lock, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTeachingOverview } from "@/lib/teaching";

interface Component {
  id: string;
  name: string;
  maxMarks: number;
  weight: number;
  isRequired: boolean;
  slots: number;
}
interface SheetStudent {
  studentId: string;
  admissionNumber: string | null;
  name: string;
  marks: { componentId: string; occurrenceIndex: number; marks: number }[];
  totalScore: number;
  percentage: number;
  grade: string | null;
  complete: boolean;
  position: number | null;
}
interface Sheet {
  class: { id: string; name: string };
  subject: { id: string; name: string };
  term: { id: string; name: string };
  templates: { id: string; name: string }[];
  template: { id: string; name: string; deadline: string | null; components: Component[]; grades: { grade: string; description: string; minScore: number; maxScore: number }[] } | null;
  students: SheetStudent[];
  canEdit: boolean;
  readOnlyReason: string | null;
}
interface SubjectRow {
  id: string;
  name: string;
  isActive: boolean;
  classes: { classId: string; className: string }[];
}

const cellKey = (studentId: string, componentId: string, slot: number) => `${studentId}|${componentId}|${slot}`;
const field =
  "h-9 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground/80 outline-none focus:border-primary/50";

/**
 * Marks entry. Teachers pick one of their own class and subject pairs;
 * managers can pick any. Enter marks per assessment component, save, and the
 * school's grading scale gives each pupil their total, grade and position.
 */
export function AssessmentEntryWorkspace({
  mode,
  initial,
  onOpenSetup,
}: {
  mode: "teacher" | "manager";
  initial?: { classId: string; subjectId: string } | null;
  /** For managers: jump to where assessments are set up. */
  onOpenSetup?: () => void;
}) {
  const queryClient = useQueryClient();
  const teaching = useTeachingOverview(mode === "teacher");
  const subjects = useQuery({
    queryKey: ["subjects", "for-marks"],
    queryFn: () => apiFetch<SubjectRow[]>("/subjects?includeInactive=false"),
    enabled: mode === "manager",
    retry: false,
  });

  // class -> subjects the person can enter marks for
  const catalogue = useMemo(() => {
    const classes = new Map<string, { id: string; name: string; subjects: { id: string; name: string }[] }>();
    if (mode === "teacher") {
      for (const klass of teaching.data?.classes ?? []) {
        if (klass.subjects.length) classes.set(klass.id, { id: klass.id, name: klass.name, subjects: klass.subjects });
      }
    } else {
      for (const subject of subjects.data ?? []) {
        for (const link of subject.classes) {
          const entry = classes.get(link.classId) ?? { id: link.classId, name: link.className, subjects: [] };
          entry.subjects.push({ id: subject.id, name: subject.name });
          classes.set(link.classId, entry);
        }
      }
    }
    return [...classes.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [mode, teaching.data, subjects.data]);

  const [classId, setClassId] = useState(initial?.classId ?? "");
  const [subjectId, setSubjectId] = useState(initial?.subjectId ?? "");
  const [templateId, setTemplateId] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (initial) {
      setClassId(initial.classId);
      setSubjectId(initial.subjectId);
      setTemplateId("");
    }
  }, [initial]);

  const activeClass = catalogue.find((entry) => entry.id === classId) ?? catalogue[0];
  const activeSubject = activeClass?.subjects.find((entry) => entry.id === subjectId) ?? activeClass?.subjects[0];
  const effectiveClassId = activeClass?.id ?? "";
  const effectiveSubjectId = activeSubject?.id ?? "";

  const sheetKey = ["assessments", "entry", effectiveClassId, effectiveSubjectId, templateId];
  const sheetQuery = useQuery({
    queryKey: sheetKey,
    queryFn: () =>
      apiFetch<Sheet>(
        `/assessments/entry?classId=${effectiveClassId}&subjectId=${effectiveSubjectId}${templateId ? `&templateId=${templateId}` : ""}`,
      ),
    enabled: !!effectiveClassId && !!effectiveSubjectId,
    retry: false,
  });
  const sheet = sheetQuery.data;

  // Server values by cell, used to tell which cells the teacher has changed.
  const saved = useMemo(() => {
    const map = new Map<string, string>();
    for (const student of sheet?.students ?? []) {
      for (const mark of student.marks) map.set(cellKey(student.studentId, mark.componentId, mark.occurrenceIndex), String(mark.marks));
    }
    return map;
  }, [sheet]);

  useEffect(() => {
    setDraft({});
  }, [sheet]);

  const maxByComponent = useMemo(
    () => new Map((sheet?.template?.components ?? []).map((component) => [component.id, component.maxMarks])),
    [sheet],
  );

  const changes = useMemo(() => {
    const result: { studentId: string; componentId: string; occurrenceIndex: number; marks: number | null; valid: boolean }[] = [];
    for (const [key, raw] of Object.entries(draft)) {
      const [studentId = "", componentId = "", slot = "0"] = key.split("|");
      const before = saved.get(key) ?? "";
      const value = raw.trim();
      if (value === before) continue;
      const marks = value === "" ? null : Number(value);
      const max = maxByComponent.get(componentId) ?? 0;
      const valid = marks === null || (Number.isFinite(marks) && marks >= 0 && marks <= max);
      result.push({ studentId, componentId, occurrenceIndex: Number(slot), marks, valid });
    }
    return result;
  }, [draft, saved, maxByComponent]);
  const invalid = changes.filter((change) => !change.valid).length;

  const save = useMutation({
    mutationFn: (body: unknown) => apiFetch<Sheet>("/assessments/entry", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: (result) => {
      queryClient.setQueryData(sheetKey, result);
      setNotice("Marks saved.");
    },
  });

  function guard(action: () => void) {
    if (changes.length && !window.confirm("You have unsaved marks. Discard them?")) return;
    setNotice(null);
    action();
  }

  if ((mode === "teacher" && teaching.isPending) || (mode === "manager" && subjects.isPending)) {
    return <p className="text-xs text-muted-foreground">Loading classes…</p>;
  }
  const loadError = (mode === "teacher" ? teaching.error : subjects.error)?.message;
  if (loadError) return <p role="alert" className="text-xs text-destructive">Could not load your classes: {loadError}</p>;
  if (catalogue.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-input p-8 text-center">
        <h2 className="text-sm font-semibold text-foreground">No classes to enter marks for yet</h2>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          {mode === "teacher"
            ? "Marks are entered by the teacher assigned to a subject in a class. Ask an administrator to assign you in Subjects."
            : "Add subjects to classes first, then marks can be entered here."}
        </p>
      </div>
    );
  }

  const components = sheet?.template?.components ?? [];
  const editable = !!sheet?.canEdit;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border/80 bg-card p-4">
        <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
          Class
          <Select value={effectiveClassId} onValueChange={(value) => guard(() => { setClassId(value); setSubjectId(""); setTemplateId(""); })}>
            <SelectTrigger aria-label="Class" className={`${field} min-w-40`}><SelectValue /></SelectTrigger>
            <SelectContent>{catalogue.map((entry) => <SelectItem key={entry.id} value={entry.id}>{entry.name}</SelectItem>)}</SelectContent>
          </Select>
        </label>
        <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
          Subject
          <Select value={effectiveSubjectId || "__none__"} onValueChange={(value) => guard(() => { setSubjectId(value === "__none__" ? "" : value); setTemplateId(""); })}>
            <SelectTrigger aria-label="Subject" className={`${field} min-w-44`}><SelectValue placeholder="No subjects" /></SelectTrigger>
            <SelectContent>
              {!activeClass?.subjects.length && <SelectItem value="__none__" disabled>No subjects</SelectItem>}
              {activeClass?.subjects.map((entry) => <SelectItem key={entry.id} value={entry.id}>{entry.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        {sheet && sheet.templates.length > 1 && (
          <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
            Assessment
            <Select value={templateId || sheet.template?.id || sheet.templates[0]?.id || "__none__"} onValueChange={(value) => guard(() => setTemplateId(value))}>
              <SelectTrigger aria-label="Assessment template" className={`${field} min-w-44`}><SelectValue /></SelectTrigger>
              <SelectContent>{sheet.templates.map((entry) => <SelectItem key={entry.id} value={entry.id}>{entry.name}</SelectItem>)}</SelectContent>
            </Select>
          </label>
        )}
        {sheet && <p className="ml-auto text-xs text-muted-foreground">{sheet.term.name}</p>}
      </div>

      {sheetQuery.isPending && <p className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading marks…</p>}
      {sheetQuery.error && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">{sheetQuery.error.message}</p>}

      {sheet && !sheet.template && (
        <p className="rounded-xl border border-warning/20 bg-warning/10 px-4 py-3 text-xs text-warning">
          {sheet.readOnlyReason}
          {onOpenSetup && (
            <button type="button" onClick={onOpenSetup} className="ml-2 font-semibold underline">
              Set up an assessment
            </button>
          )}
        </p>
      )}

      {sheet?.template && (
        <section className="rounded-2xl border border-border/80 bg-card shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 p-4">
            <div>
              <h3 className="text-sm font-bold text-foreground">{sheet.subject.name} · {sheet.class.name}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {sheet.template.name}
                {sheet.template.deadline && ` · due ${new Date(sheet.template.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}
              </p>
            </div>
            {sheet.readOnlyReason && (
              <p className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-[11px] text-muted-foreground">
                <Lock className="size-3.5" /> {sheet.readOnlyReason}
              </p>
            )}
          </div>

          {sheet.students.length === 0 ? (
            <p className="p-5 text-xs text-muted-foreground">No pupils are enrolled in this class this term.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">Pupil</th>
                    {components.map((component) => (
                      <th key={component.id} scope="col" colSpan={component.slots} className="px-2 py-3 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                        {component.name}
                        <span className="block font-normal normal-case tracking-normal">out of {component.maxMarks} · {component.weight}%</span>
                      </th>
                    ))}
                    <th scope="col" className="px-3 py-3 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">Total</th>
                    <th scope="col" className="px-3 py-3 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">%</th>
                    <th scope="col" className="px-3 py-3 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">Grade</th>
                    <th scope="col" className="px-3 py-3 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">Pos.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {sheet.students.map((student) => (
                    <tr key={student.studentId}>
                      <th scope="row" className="px-4 py-2 text-left font-semibold text-foreground">
                        {student.name}
                        <span className="block text-[10px] font-normal text-muted-foreground/70">{student.admissionNumber ?? ""}</span>
                      </th>
                      {components.flatMap((component) =>
                        Array.from({ length: component.slots }, (_, slot) => {
                          const key = cellKey(student.studentId, component.id, slot);
                          const value = draft[key] ?? saved.get(key) ?? "";
                          const number = value.trim() === "" ? null : Number(value);
                          const bad = number !== null && (!Number.isFinite(number) || number < 0 || number > component.maxMarks);
                          return (
                            <td key={key} className="px-1.5 py-1.5 text-center">
                              <input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                max={component.maxMarks}
                                step="any"
                                value={value}
                                disabled={!editable}
                                aria-invalid={bad || undefined}
                                aria-label={`${student.name}, ${component.name}${component.slots > 1 ? ` ${slot + 1}` : ""}, out of ${component.maxMarks}`}
                                onChange={(event) => { setNotice(null); setDraft((current) => ({ ...current, [key]: event.target.value })); }}
                                className={`h-9 w-16 rounded-lg border px-2 text-center text-xs tabular-nums outline-none focus:ring-2 disabled:bg-muted/50 disabled:text-muted-foreground ${
                                  bad
                                    ? "border-destructive/50 bg-destructive/10 text-destructive focus:ring-destructive/20"
                                    : "border-border bg-card text-foreground focus:border-primary/50 focus:ring-primary/20"
                                }`}
                              />
                            </td>
                          );
                        }),
                      )}
                      <td className="px-3 py-2 text-center font-semibold tabular-nums text-foreground">{student.marks.length ? student.totalScore : "—"}</td>
                      <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">{student.marks.length ? `${student.percentage}%` : "—"}</td>
                      <td className="px-3 py-2 text-center">
                        {student.grade ? (
                          <span className="rounded-md bg-primary/10 px-2 py-0.5 font-bold text-primary">{student.grade}</span>
                        ) : (
                          <span className="text-muted-foreground/70" title={student.marks.length ? "Waiting for the remaining marks" : undefined}>{student.marks.length ? "Incomplete" : "—"}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">{student.position ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-border/60 p-4">
            {editable && (
              <button
                type="button"
                disabled={changes.length === 0 || invalid > 0 || save.isPending}
                onClick={() =>
                  save.mutate({
                    classId: effectiveClassId,
                    subjectId: effectiveSubjectId,
                    templateId: sheet.template!.id,
                    entries: changes.map(({ studentId, componentId, occurrenceIndex, marks }) => ({ studentId, componentId, occurrenceIndex, marks })),
                  })
                }
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {save.isPending && <LoaderCircle className="size-3.5 animate-spin" />}
                Save marks{changes.length ? ` (${changes.length})` : ""}
              </button>
            )}
            {invalid > 0 && <p role="alert" className="flex items-center gap-1.5 text-xs text-destructive"><CircleAlert className="size-3.5" /> {invalid} mark{invalid === 1 ? " is" : "s are"} outside the allowed range.</p>}
            {notice && <p role="status" className="flex items-center gap-1.5 text-xs text-success"><CircleCheck className="size-3.5" /> {notice}</p>}
            {save.error && <p role="alert" className="flex items-center gap-1.5 text-xs text-destructive"><CircleAlert className="size-3.5" /> {save.error.message}</p>}
            <p className="ml-auto text-[11px] text-muted-foreground">
              Grades appear once every required column has a mark.
              {sheet.template.grades.length > 0 && (
                <> {[...sheet.template.grades].sort((a, b) => b.minScore - a.minScore).map((band) => `${band.grade} ${band.minScore}+`).join(" · ")}</>
              )}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
