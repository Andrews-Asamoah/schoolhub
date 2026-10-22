import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, Lock, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
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
  "h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";

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
    return <p className="text-xs text-slate-500">Loading classes…</p>;
  }
  const loadError = (mode === "teacher" ? teaching.error : subjects.error)?.message;
  if (loadError) return <p role="alert" className="text-xs text-rose-700">Could not load your classes: {loadError}</p>;
  if (catalogue.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">No classes to enter marks for yet</h2>
        <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
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
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Class
          <select
            className={`${field} min-w-40`}
            value={effectiveClassId}
            onChange={(event) => guard(() => { setClassId(event.target.value); setSubjectId(""); setTemplateId(""); })}
          >
            {catalogue.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Subject
          <select
            className={`${field} min-w-44`}
            value={effectiveSubjectId}
            onChange={(event) => guard(() => { setSubjectId(event.target.value); setTemplateId(""); })}
          >
            {activeClass?.subjects.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>
        </label>
        {sheet && sheet.templates.length > 1 && (
          <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Assessment
            <select
              className={`${field} min-w-44`}
              value={sheet.template?.id ?? ""}
              onChange={(event) => guard(() => setTemplateId(event.target.value))}
            >
              {sheet.templates.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </select>
          </label>
        )}
        {sheet && <p className="ml-auto text-xs text-slate-500">{sheet.term.name}</p>}
      </div>

      {sheetQuery.isPending && <p className="flex items-center gap-2 text-xs text-slate-500"><LoaderCircle className="size-4 animate-spin" /> Loading marks…</p>}
      {sheetQuery.error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{sheetQuery.error.message}</p>}

      {sheet && !sheet.template && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
          {sheet.readOnlyReason}
          {onOpenSetup && (
            <button type="button" onClick={onOpenSetup} className="ml-2 font-semibold underline">
              Set up an assessment
            </button>
          )}
        </p>
      )}

      {sheet?.template && (
        <section className="rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{sheet.subject.name} · {sheet.class.name}</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                {sheet.template.name}
                {sheet.template.deadline && ` · due ${new Date(sheet.template.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}
              </p>
            </div>
            {sheet.readOnlyReason && (
              <p className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <Lock className="size-3.5" /> {sheet.readOnlyReason}
              </p>
            )}
          </div>

          {sheet.students.length === 0 ? (
            <p className="p-5 text-xs text-slate-500">No pupils are enrolled in this class this term.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/50">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Pupil</th>
                    {components.map((component) => (
                      <th key={component.id} scope="col" colSpan={component.slots} className="px-2 py-3 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {component.name}
                        <span className="block font-normal normal-case tracking-normal">out of {component.maxMarks} · {component.weight}%</span>
                      </th>
                    ))}
                    <th scope="col" className="px-3 py-3 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">Total</th>
                    <th scope="col" className="px-3 py-3 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">%</th>
                    <th scope="col" className="px-3 py-3 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">Grade</th>
                    <th scope="col" className="px-3 py-3 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">Pos.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sheet.students.map((student) => (
                    <tr key={student.studentId}>
                      <th scope="row" className="px-4 py-2 text-left font-semibold text-slate-900 dark:text-white">
                        {student.name}
                        <span className="block text-[10px] font-normal text-slate-400">{student.admissionNumber ?? ""}</span>
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
                                className={`h-9 w-16 rounded-lg border px-2 text-center text-xs tabular-nums outline-none focus:ring-2 disabled:bg-slate-50 disabled:text-slate-500 dark:disabled:bg-slate-800/50 ${
                                  bad
                                    ? "border-rose-400 bg-rose-50 text-rose-800 focus:ring-rose-200"
                                    : "border-slate-200 bg-white text-slate-800 focus:border-indigo-400 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                }`}
                              />
                            </td>
                          );
                        }),
                      )}
                      <td className="px-3 py-2 text-center font-semibold tabular-nums text-slate-900 dark:text-white">{student.marks.length ? student.totalScore : "—"}</td>
                      <td className="px-3 py-2 text-center tabular-nums text-slate-600 dark:text-slate-300">{student.marks.length ? `${student.percentage}%` : "—"}</td>
                      <td className="px-3 py-2 text-center">
                        {student.grade ? (
                          <span className="rounded-md bg-indigo-50 px-2 py-0.5 font-bold text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-300">{student.grade}</span>
                        ) : (
                          <span className="text-slate-400" title={student.marks.length ? "Waiting for the remaining marks" : undefined}>{student.marks.length ? "Incomplete" : "—"}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums text-slate-600 dark:text-slate-300">{student.position ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 p-4 dark:border-slate-800">
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
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {save.isPending && <LoaderCircle className="size-3.5 animate-spin" />}
                Save marks{changes.length ? ` (${changes.length})` : ""}
              </button>
            )}
            {invalid > 0 && <p role="alert" className="flex items-center gap-1.5 text-xs text-rose-700"><CircleAlert className="size-3.5" /> {invalid} mark{invalid === 1 ? " is" : "s are"} outside the allowed range.</p>}
            {notice && <p role="status" className="flex items-center gap-1.5 text-xs text-emerald-700"><CircleCheck className="size-3.5" /> {notice}</p>}
            {save.error && <p role="alert" className="flex items-center gap-1.5 text-xs text-rose-700"><CircleAlert className="size-3.5" /> {save.error.message}</p>}
            <p className="ml-auto text-[11px] text-slate-500">
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
