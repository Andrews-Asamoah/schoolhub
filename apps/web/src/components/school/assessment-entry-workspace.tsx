import { useMarkDraft } from "@/hooks/use-mark-draft";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, Lock, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { BulkImportButton } from "@/components/bulk-import/bulk-import-button";
import { AssessmentMarksBulkImport } from "@/components/school/assessment-marks-bulk-import";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTeachingOverview } from "@/lib/teaching";
import { bandRangeLabel, type GradingMethod } from "@/lib/assessment-setup";

interface Component {
  id: string;
  name: string;
  maxMarks: number;
  weight: number;
  isRequired: boolean;
  slots: number;
  subjectStrandId: string | null;
  subjectStrandName: string | null;
  canEdit: boolean;
  canCorrect: boolean;
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
  excused: boolean;
  position: number | null;
}
interface Sheet {
  class: { id: string; name: string };
  subject: { id: string; name: string };
  term: { id: string; name: string };
  templates: { id: string; name: string }[];
  template: { id: string; name: string; deadline: string | null; components: Component[]; grades: { grade: string; description: string; minScore: number; maxScore: number }[]; gradingMethod?: GradingMethod; boundaries?: { grade: string; minScore: number }[] | null } | null;
  students: SheetStudent[];
  stats: { count: number; mean: number | null; median: number | null; highest: number | null; lowest: number | null; passRate: number | null };
  canEdit: boolean;
  readOnlyReason: string | null;
  lock: "TEMPLATE_LOCKED" | "SUBMITTED" | "DEADLINE_PASSED" | "NO_TEACHING_AREA" | null;
  submission: { submittedAt: string; note: string | null; excusedCount: number } | null;
  canSubmit: boolean;
  canRequestCorrection: boolean;
  pendingCorrection: { id: string; requestedAt: string } | null;
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
  const [notice, setNotice] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [reason, setReason] = useState("");
  const [uploading, setUploading] = useState(false);
  // The one app-styled confirmation this screen can show, in place of the browser's native confirm().
  const [confirming, setConfirming] = useState<
    { kind: "submit" } | { kind: "absent"; student: SheetStudent } | { kind: "switch"; run: () => void } | { kind: "discard" } | null
  >(null);
  const closeConfirm = useCallback(() => setConfirming(null), []);

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
  const [draft, setDraft] = useMarkDraft<{value:string;expectedMarks:number|null}>(JSON.stringify(["sba", effectiveClassId, effectiveSubjectId, sheet?.term.id, sheet?.template?.id]), (value): value is {value:string;expectedMarks:number|null} => { const row=value as {value?:unknown;expectedMarks?:unknown}|null; return !!row && typeof row.value === "string" && (row.expectedMarks === null || typeof row.expectedMarks === "number"); });

  // Keep absence choices in the same principal/role/term/sheet-scoped tab storage as marks.
  // Uploads and background refetches must not discard an unsubmitted choice.
  const [excuseDraft, setExcuseDraft] = useMarkDraft<boolean>(
    JSON.stringify(["sba-excuses", effectiveClassId, effectiveSubjectId, sheet?.term.id, sheet?.template?.id]),
    (value): value is boolean => typeof value === "boolean",
  );
  const excusedIds = new Set((sheet?.students ?? [])
    .filter((student) => excuseDraft[student.studentId] ?? student.excused)
    .map((student) => student.studentId));
  const excuseConflicts = (sheet?.students ?? []).filter((student) => excusedIds.has(student.studentId) && student.marks.length > 0 && !student.excused).length;
  const hasExcuseChanges = (sheet?.students ?? []).some((student) =>
    excuseDraft[student.studentId] !== undefined && excuseDraft[student.studentId] !== student.excused,
  );

  // Server values by cell, used to tell which cells the teacher has changed.
  const saved = useMemo(() => {
    const map = new Map<string, string>();
    for (const student of sheet?.students ?? []) {
      for (const mark of student.marks) map.set(cellKey(student.studentId, mark.componentId, mark.occurrenceIndex), String(mark.marks));
    }
    return map;
  }, [sheet]);


  useEffect(() => {
    setCorrecting(false);
    setReason("");
  }, [sheet]);

  const maxByComponent = useMemo(
    () => new Map((sheet?.template?.components ?? []).map((component) => [component.id, component.maxMarks])),
    [sheet],
  );

  const changes = useMemo(() => {
    const result: { studentId: string; componentId: string; occurrenceIndex: number; marks: number | null; expectedMarks: number|null; valid: boolean }[] = [];
    for (const [key, raw] of Object.entries(draft)) {
      const [studentId = "", componentId = "", slot = "0"] = key.split("|");
      const before = saved.get(key) ?? "";
      const value = raw.value.trim();
      if (value === before) continue;
      const marks = value === "" ? null : Number(value);
      const max = maxByComponent.get(componentId) ?? 0;
      const valid = marks === null || (Number.isFinite(marks) && marks >= 0 && marks <= max);
      result.push({ studentId, componentId, occurrenceIndex: Number(slot), marks, expectedMarks: raw.expectedMarks, valid });
    }
    return result;
  }, [draft, saved, maxByComponent]);
  const invalid = changes.filter((change) => !change.valid).length;
  const unsaved = changes.length > 0;
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  const save = useMutation({
    mutationFn: (body: unknown) => apiFetch<Sheet>("/assessments/entry", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: (result) => {
      setDraft({});
      queryClient.setQueryData(sheetKey, result);
      setNotice("Marks saved.");
    },
  });

  const clearForExcuse = useMutation({
    mutationFn: (student: SheetStudent) => apiFetch<Sheet>("/assessments/entry", {
      method: "PUT",
      body: JSON.stringify({
        classId: effectiveClassId,
        subjectId: effectiveSubjectId,
        templateId: sheet?.template?.id,
        termId: sheet?.term.id,
        entries: student.marks.map((mark) => ({
          studentId: student.studentId,
          componentId: mark.componentId,
          occurrenceIndex: mark.occurrenceIndex,
          marks: null,
          expectedMarks: mark.marks,
        })),
      }),
    }),
    onSuccess: (result, student) => {
      queryClient.setQueryData(sheetKey, result);
      setExcuseDraft((current) => ({ ...current, [student.studentId]: true }));
      void queryClient.invalidateQueries({ queryKey: ["assessments", "tracking"] });
      setNotice(`Recorded marks cleared for ${student.name}. Submit marks to save the absent / excused selection.`);
    },
  });

  function clearMarksForAbsence(student: SheetStudent) {
    setConfirming({ kind: "absent", student });
  }

  const submit = useMutation({
    mutationFn: () =>
      apiFetch<Sheet>("/assessments/entry/submit", {
        method: "POST",
        body: JSON.stringify({ classId: effectiveClassId, subjectId: effectiveSubjectId, templateId: sheet?.template?.id, excusedStudentIds: [...excusedIds] }),
      }),
    onSuccess: (result) => {
      setExcuseDraft({});
      queryClient.setQueryData(sheetKey, result);
      void queryClient.invalidateQueries({ queryKey: ["assessments", "tracking"] });
      setNotice("Marks submitted.");
    },
  });
  const [applyNow, setApplyNow] = useState(false);
  // The server enforces this; the active role only decides whether the option is offered.
  const canApplyNow = typeof window !== "undefined" && ["owner", "admin"].includes(window.localStorage.getItem("schoolhub-active-role") ?? "");
  const requestCorrection = useMutation({
    mutationFn: () =>
      apiFetch<{ id: string; applied: boolean; publishedReports: { id: string; name: string }[] }>("/assessments/corrections", {
        method: "POST",
        body: JSON.stringify({
          classId: effectiveClassId,
          subjectId: effectiveSubjectId,
          templateId: sheet?.template?.id,
          reason: reason.trim(),
          applyNow: canApplyNow && applyNow,
          items: changes.map(({ studentId, componentId, occurrenceIndex, marks }) => ({ studentId, componentId, occurrenceIndex, marks })),
        }),
      }),
    onSuccess: (result) => {
      setDraft({});
      setCorrecting(false);
      setReason("");
      setApplyNow(false);
      void sheetQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: ["assessments", "corrections"] });
      void queryClient.invalidateQueries({ queryKey: ["mock-analytics"] });
      if (!result.applied) setNotice("Correction sent for approval. The marks will change once it is approved.");
      else if (result.publishedReports.length) setNotice(`Marks corrected. Published reports still show the old marks: reopen ${result.publishedReports.map((r) => `"${r.name}"`).join(", ")} under Reports, then regenerate and publish again.`);
      else setNotice("Marks corrected and recorded in the audit trail.");
    },
  });

  function guard(action: () => void) {
    if (clearForExcuse.isPending || save.isPending || submit.isPending) return;
    if (changes.length || hasExcuseChanges) {
      setConfirming({ kind: "switch", run: action });
      return;
    }
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
  const editableComponentIds = new Set(components.filter((component) => component.canEdit).map((component) => component.id));

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

          {sheet.submission && (
            <p className="border-b border-border/60 bg-success/10 px-4 py-2 text-xs text-success">
              Submitted on {new Date(sheet.submission.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              {sheet.submission.excusedCount > 0 && ` · ${sheet.submission.excusedCount} pupil${sheet.submission.excusedCount === 1 ? "" : "s"} excused`}.
            </p>
          )}
          {sheet.pendingCorrection && (
            <p className="border-b border-border/60 bg-warning/10 px-4 py-2 text-xs text-warning">A correction for this sheet is waiting for approval. Marks will change once it is approved.</p>
          )}
          {correcting && (
            <p className="border-b border-border/60 bg-info/10 px-4 py-2 text-xs text-info">Correction mode: change the marks that are wrong, explain why, then send for approval. Nothing changes until it is approved.</p>
          )}

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
                        {component.subjectStrandName && <span className="block font-semibold normal-case tracking-normal">{component.subjectStrandName}</span>}
                        <span className="block font-normal normal-case tracking-normal">out of {component.maxMarks} · {component.weight}%</span>
                        {!component.canEdit && mode === "teacher" && <span className="block font-normal normal-case tracking-normal">Read only</span>}
                      </th>
                    ))}
                    <th scope="col" className="px-3 py-3 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">Total (%)</th>
                    <th scope="col" className="px-3 py-3 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">Grade</th>
                    <th scope="col" className="px-3 py-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">Description</th>
                    <th scope="col" className="px-3 py-3 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">Pos.</th>
                    <th scope="col" className="px-3 py-3 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">Absent / excused</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {sheet.students.map((student, rowIndex) => {
                    const hasRestrictedMarks = student.marks.some((mark) => !editableComponentIds.has(mark.componentId));
                    return (
                    <tr key={student.studentId}>
                      <th scope="row" className="px-4 py-2 text-left font-semibold text-foreground">
                        {student.name}
                        <span className="block text-[10px] font-normal text-muted-foreground/70">{student.admissionNumber ?? ""}</span>
                      </th>
                      {components.flatMap((component) =>
                        Array.from({ length: component.slots }, (_, slot) => {
                          const key = cellKey(student.studentId, component.id, slot);
                          const value = draft[key]?.value ?? saved.get(key) ?? "";
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
                                disabled={clearForExcuse.isPending || (correcting ? !component.canCorrect : !editable || !component.canEdit)}
                                data-col={`${component.id}|${slot}`}
                                data-row={rowIndex}
                                onKeyDown={(event) => {
                                  // Enter moves down the column like a spreadsheet.
                                  if (event.key !== "Enter") return;
                                  event.preventDefault();
                                  const next = document.querySelector<HTMLInputElement>(`input[data-col="${component.id}|${slot}"][data-row="${rowIndex + (event.shiftKey ? -1 : 1)}"]:not(:disabled)`);
                                  next?.focus();
                                  next?.select();
                                }}
                                aria-invalid={bad || undefined}
                                aria-label={`${student.name}, ${component.name}${component.slots > 1 ? ` ${slot + 1}` : ""}, out of ${component.maxMarks}`}
                                onChange={(event) => { setNotice(null); setDraft((current) => ({ ...current, [key]: {value:event.target.value, expectedMarks:current[key]?.expectedMarks !== undefined ? current[key]!.expectedMarks : saved.has(key) ? Number(saved.get(key)) : null} })); }}
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
                      <td className="px-3 py-2 text-center font-semibold tabular-nums text-foreground">{student.marks.length ? `${student.percentage}%` : "—"}</td>
                      <td className="px-3 py-2 text-center">
                        {student.grade ? (
                          <span className="rounded-md bg-primary/10 px-2 py-0.5 font-bold text-primary">{student.grade}</span>
                        ) : (
                          <span className="text-muted-foreground/70" title={student.marks.length ? "Waiting for the remaining marks" : undefined}>{student.marks.length ? "Incomplete" : "—"}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {student.grade ? sheet.template?.grades.find((band) => band.grade === student.grade)?.description || "—" : "—"}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">{student.position ?? "—"}</td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          aria-label={`${student.name} is absent or excused`}
                          aria-describedby="assessment-excuse-help"
                          disabled={!sheet.canSubmit || correcting || unsaved || submit.isPending || save.isPending || clearForExcuse.isPending || (!excusedIds.has(student.studentId) && hasRestrictedMarks)}
                          title={!sheet.canSubmit ? "This sheet is read only." : unsaved ? "Save or discard your typed marks first." : hasRestrictedMarks && !excusedIds.has(student.studentId) ? "Only a teacher who can edit all recorded components, or a school manager, can clear these marks for an absence." : student.marks.length ? "Selecting absent / excused asks before clearing this pupil’s recorded marks." : undefined}
                          checked={student.excused || excusedIds.has(student.studentId)}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            if (checked && student.marks.length > 0) {
                              clearMarksForAbsence(student);
                              return;
                            }
                            setExcuseDraft((current) => {
                              const next = { ...current };
                              if (checked === student.excused) delete next[student.studentId];
                              else next[student.studentId] = checked;
                              return next;
                            });
                          }}
                          className="size-4 accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                        />
                        {sheet.canSubmit && excusedIds.has(student.studentId) && student.marks.length > 0 && (
                          <button type="button"
                            aria-label={`Clear recorded marks for absent pupil ${student.name}`}
                            disabled={unsaved || submit.isPending || save.isPending || clearForExcuse.isPending || hasRestrictedMarks}
                            onClick={() => clearMarksForAbsence(student)}
                            className="mt-1 block text-[11px] font-semibold text-warning underline disabled:opacity-50">
                            Clear recorded marks
                          </button>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p id="assessment-excuse-help" className="border-t border-border/60 px-4 py-3 text-xs leading-5 text-muted-foreground">
            {sheet.submission
              ? "Absent / excused selections shown here were saved with this submission."
              : "Select absent or excused pupils, then Submit marks to save those selections. Choices stay selected through uploads and refreshes in this tab. If a pupil has recorded marks, you will be asked before those marks are cleared. In uploads, leave absent pupils’ marks empty; zero is a recorded mark."}
          </p>

          {excuseConflicts > 0 && sheet.canSubmit && (
            <p role="alert" className="border-t border-border/60 px-4 py-3 text-xs text-warning">
              {excuseConflicts} selected pupil{excuseConflicts === 1 ? " has" : "s have"} recorded marks. Use Clear recorded marks in their absence column, or uncheck the absence, before submitting.
            </p>
          )}

          {sheet.stats.count > 0 && (
            <dl className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border/60 px-4 py-3 text-[11px] text-muted-foreground">
              {([["Class mean", sheet.stats.mean, "%"], ["Median", sheet.stats.median, "%"], ["Highest", sheet.stats.highest, "%"], ["Lowest", sheet.stats.lowest, "%"], ["Pass rate (50%+)", sheet.stats.passRate, "%"]] as const).map(([name, value, unit]) => (
                <div key={name} className="flex gap-1.5"><dt>{name}</dt><dd className="font-semibold tabular-nums text-foreground">{value}{unit}</dd></div>
              ))}
              <div className="flex gap-1.5"><dt>Complete</dt><dd className="font-semibold tabular-nums text-foreground">{sheet.stats.count}/{sheet.students.length}</dd></div>
            </dl>
          )}
          <div className="flex flex-wrap items-center gap-3 border-t border-border/60 p-4">
            {editable && !correcting && (
              <button
                type="button"
                disabled={changes.length === 0 || invalid > 0 || save.isPending || clearForExcuse.isPending}
                onClick={() =>
                  save.mutate({
                    classId: effectiveClassId,
                    subjectId: effectiveSubjectId,
                    templateId: sheet.template!.id,
                    termId: sheet.term.id,
                    entries: changes.map(({ studentId, componentId, occurrenceIndex, marks, expectedMarks }) => ({ studentId, componentId, occurrenceIndex, marks, expectedMarks })),
                  })
                }
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {save.isPending && <LoaderCircle className="size-3.5 animate-spin" />}
                Save marks{changes.length ? ` (${changes.length})` : ""}
              </button>
            )}
            {editable && !correcting && sheet.students.length > 0 && components.some((component) => component.canEdit) && (
              <BulkImportButton
                className="h-9 text-xs"
                disabled={unsaved || clearForExcuse.isPending}
                title={unsaved ? "Save or discard the marks you have typed first" : undefined}
                onClick={() => { setNotice(null); setUploading(true); }}
              />
            )}
            {sheet.canSubmit && !correcting && (() => {
              const waiting = sheet.students.filter((student) => !student.complete && !excusedIds.has(student.studentId)).length;
              return (
                <button
                  type="button"
                  disabled={unsaved || waiting > 0 || excuseConflicts > 0 || submit.isPending || clearForExcuse.isPending}
                  title={unsaved ? "Save your marks first" : excuseConflicts > 0 ? "Clear recorded marks for the selected absent pupils, or uncheck their absence." : waiting > 0 ? `${waiting} pupil${waiting === 1 ? "" : "s"} still need marks or an excuse` : undefined}
                  onClick={() => setConfirming({ kind: "submit" })}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-4 text-xs font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submit.isPending && <LoaderCircle className="size-3.5 animate-spin" />}
                  Submit marks{waiting > 0 ? ` (${waiting} to finish)` : ""}
                </button>
              );
            })()}
            {sheet.canRequestCorrection && !correcting && (
              <button type="button" onClick={() => setCorrecting(true)} className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-xs font-semibold hover:bg-muted">Request correction</button>
            )}
            {correcting && (
              <div className="flex w-full flex-wrap items-end gap-3">
                <label className="grid min-w-64 flex-1 gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                  Reason for the correction
                  <textarea rows={2} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)}
                    className="rounded-lg border border-border bg-card px-3 py-2 text-xs normal-case tracking-normal text-foreground outline-none focus:border-primary/50" />
                </label>
                {canApplyNow && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" checked={applyNow} onChange={(event) => setApplyNow(event.target.checked)} />
                    Apply now (admin): change the marks without a second approver
                  </label>
                )}
                <button type="button" disabled={changes.length === 0 || invalid > 0 || reason.trim().length < 10 || requestCorrection.isPending} onClick={() => requestCorrection.mutate()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
                  {requestCorrection.isPending && <LoaderCircle className="size-3.5 animate-spin" />}
                  {canApplyNow && applyNow ? "Apply correction" : "Send for approval"}{changes.length ? ` (${changes.length})` : ""}
                </button>
                <button type="button" onClick={() => { setCorrecting(false); setDraft({}); setReason(""); }} className="h-9 rounded-lg px-3 text-xs font-semibold text-muted-foreground hover:bg-muted">Cancel</button>
              </div>
            )}
            {clearForExcuse.error && <p role="alert" className="text-xs text-destructive">Could not mark the pupil absent / excused: {clearForExcuse.error.message} No absence selection was applied. Reload the latest marks before retrying.</p>}
            {(submit.error || requestCorrection.error) && <p role="alert" className="flex items-center gap-1.5 text-xs text-destructive"><CircleAlert className="size-3.5" /> {(submit.error ?? requestCorrection.error)?.message}</p>}
            {invalid > 0 && <p role="alert" className="flex items-center gap-1.5 text-xs text-destructive"><CircleAlert className="size-3.5" /> {invalid} mark{invalid === 1 ? " is" : "s are"} outside the allowed range.</p>}
            {notice && <p role="status" className="flex items-center gap-1.5 text-xs text-success"><CircleCheck className="size-3.5" /> {notice}</p>}
            {save.error && <button type="button" className="text-xs underline" onClick={() => setConfirming({ kind: "discard" })}>Discard draft and load latest marks</button>}
            {save.error && <p role="alert" className="flex items-center gap-1.5 text-xs text-destructive"><CircleAlert className="size-3.5" /> {save.error.message}</p>}
            <p className="ml-auto text-[11px] text-muted-foreground">
              Grades appear once every required column has a mark.
              {sheet.template.gradingMethod === "CLASS_RANK" && (sheet.template.boundaries?.length
                ? " Grades follow the mark boundaries set for this subject, so one pupil's marks never change another's grade."
                : " They compare each pupil with the rest of this class, so they can change as marks are entered.")}
              {sheet.template.grades.length > 0 && (
                sheet.template.gradingMethod === "CLASS_RANK"
                  ? sheet.template.boundaries?.length
                    ? <> {[
                        ...sheet.template.boundaries.map((boundary) => `${boundary.grade} ${boundary.minScore}+`),
                        `${sheet.template.grades[sheet.template.grades.length - 1]!.grade} below ${sheet.template.boundaries[sheet.template.boundaries.length - 1]!.minScore}`,
                      ].join(" · ")}</>
                    : <> {sheet.template.grades.map((band, index) => `${band.grade} ${bandRangeLabel("CLASS_RANK", band, index, sheet.template!.grades.length)}`).join(" · ")}</>
                  : <> {[...sheet.template.grades].sort((a, b) => b.minScore - a.minScore).map((band) => `${band.grade} ${band.minScore}+`).join(" · ")}</>
              )}
            </p>
          </div>
        </section>
      )}

      {confirming && (() => {
        const excusedCount = sheet ? sheet.students.filter((student) => excusedIds.has(student.studentId)).length : 0;
        const dialog =
          confirming.kind === "submit"
            ? {
                title: "Submit these marks?",
                description: `${sheet?.subject.name ?? "This subject"} for ${sheet?.class.name ?? "this class"} will be sent for reporting${excusedCount ? `, with ${excusedCount} pupil${excusedCount === 1 ? "" : "s"} marked absent / excused` : ""}. You will not be able to edit the marks directly afterwards; changes will need approval.`,
                confirmLabel: "Submit marks",
                variant: "primary" as const,
                loading: submit.isPending,
                run: () => submit.mutate(undefined, { onSettled: closeConfirm }),
              }
            : confirming.kind === "absent"
              ? {
                  title: `Mark ${confirming.student.name} absent / excused?`,
                  description: "This clears all their saved marks for this assessment, including zeros, and recalculates grades and positions. Submit marks afterwards to save the absence selection.",
                  confirmLabel: "Clear marks and mark absent",
                  variant: "danger" as const,
                  loading: clearForExcuse.isPending,
                  run: () => clearForExcuse.mutate(confirming.student, { onSettled: closeConfirm }),
                }
              : confirming.kind === "switch"
                ? {
                    title: "Switch sheets?",
                    description: "You have unsaved marks or absence selections. Your draft will remain available in this tab if you come back.",
                    confirmLabel: "Switch sheets",
                    variant: "primary" as const,
                    loading: false,
                    run: () => { setNotice(null); confirming.run(); closeConfirm(); },
                  }
                : {
                    title: "Discard your draft?",
                    description: "The marks you typed on this sheet will be removed and the latest saved marks reloaded.",
                    confirmLabel: "Discard draft",
                    variant: "danger" as const,
                    loading: false,
                    run: () => { setDraft({}); void sheetQuery.refetch(); closeConfirm(); },
                  };
        return (
          <ConfirmDialog
            open
            title={dialog.title}
            description={dialog.description}
            confirmLabel={dialog.confirmLabel}
            confirmVariant={dialog.variant}
            loading={dialog.loading}
            onCancel={closeConfirm}
            onConfirm={dialog.run}
          />
        );
      })()}

      {uploading && sheet?.template && (
        <AssessmentMarksBulkImport
          sheet={{
            classId: sheet.class.id,
            className: sheet.class.name,
            subjectId: sheet.subject.id,
            subjectName: sheet.subject.name,
            templateId: sheet.template.id,
            templateName: sheet.template.name,
            termId: sheet.term.id,
            termName: sheet.term.name,
            components: components
              .filter((component) => component.canEdit)
              .map((component) => ({
                id: component.id,
                name: component.name,
                maxMarks: component.maxMarks,
                slots: component.slots,
                subjectStrandName: component.subjectStrandName,
              })),
            students: sheet.students,
          }}
          onClose={() => setUploading(false)}
          onComplete={() => {
            setNotice("Marks uploaded. The table now shows the saved marks.");
            void sheetQuery.refetch();
            void queryClient.invalidateQueries({ queryKey: ["assessments", "tracking"] });
          }}
        />
      )}
    </div>
  );
}
