import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ASSESSMENT_TYPES, ASSESSMENT_TYPE_LABELS, saveAssessmentTemplateSchema, type AssessmentTypeName } from "@schoolhub/shared";
import { ArrowDown, ArrowUp, CircleAlert, CircleCheck, Lock, LoaderCircle, Plus, Trash2, Wand2, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import {
  STANDARD_COMPONENTS,
  setupKey,
  type AssessmentSetup,
  type SetupTemplate,
} from "@/lib/assessment-setup";

interface Row {
  key: number;
  id?: string;
  name: string;
  componentType: AssessmentTypeName;
  maxMarks: string;
  weight: string;
  isRequired: boolean;
  isRepeatable: boolean;
  expectedCount: string;
}

const box =
  "h-9 w-full rounded-lg border border-border bg-card px-2.5 text-xs text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 disabled:bg-muted/50 disabled:text-muted-foreground";
const label = "grid gap-1 text-[11px] font-medium text-muted-foreground";
const heading = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70";

let rowKey = 0;
const rowFrom = (component: { id?: string; name: string; componentType: AssessmentTypeName; maxMarks: number; weight: number; isRequired: boolean; isRepeatable: boolean; expectedCount: number }): Row => ({
  key: ++rowKey,
  id: component.id,
  name: component.name,
  componentType: component.componentType,
  maxMarks: String(component.maxMarks),
  weight: String(component.weight),
  isRequired: component.isRequired,
  isRepeatable: component.isRepeatable,
  expectedCount: String(component.expectedCount),
});

/**
 * Create or edit an assessment: what is marked (components and their weights),
 * which classes, subject and term it covers, the grading scale and the deadline.
 */
export function AssessmentTemplateDialog({
  setup,
  template,
  onClose,
  onSaved,
  onCreateStandardScale,
}: {
  setup: AssessmentSetup;
  template?: SetupTemplate;
  onClose: () => void;
  onSaved: (message: string) => void;
  /** Creates the standard grading scale and returns its id (used when the school has none yet). */
  onCreateStandardScale: () => Promise<string>;
}) {
  const queryClient = useQueryClient();
  const hasMarks = (template?.marksRecorded ?? 0) > 0;
  const firstScale = setup.gradingSystems.find((system) => !system.shared) ?? setup.gradingSystems[0];

  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [gradingSystemId, setGradingSystemId] = useState(template?.gradingSystem.id ?? firstScale?.id ?? "");
  const [allClasses, setAllClasses] = useState(template ? template.allClasses : true);
  const [classIds, setClassIds] = useState<string[]>(template?.allClasses ? [] : template?.classIds ?? []);
  const [subjectCode, setSubjectCode] = useState(template?.subjectCode ?? "");
  const [termNumber, setTermNumber] = useState(template?.termNumber ? String(template.termNumber) : "");
  const [deadline, setDeadline] = useState(template?.deadline?.slice(0, 10) ?? "");
  const [isActive, setIsActive] = useState(template?.isActive ?? true);
  const [isLocked, setIsLocked] = useState(template?.isLocked ?? false);
  const [rows, setRows] = useState<Row[]>(() => (template?.components ?? STANDARD_COMPONENTS).map(rowFrom));
  const [attempted, setAttempted] = useState(false);
  const [creatingScale, setCreatingScale] = useState(false);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("input")?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);

  const totalWeight = Math.round(rows.reduce((sum, row) => sum + (Number(row.weight) || 0), 0) * 100) / 100;
  const weightOk = Math.abs(totalWeight - 100) <= 0.01;

  const candidate = {
    name,
    description,
    gradingSystemId,
    classIds: allClasses ? [] : classIds,
    subjectCode,
    termNumber: termNumber ? Number(termNumber) : null,
    deadline,
    isActive,
    isLocked,
    components: rows.map((row) => ({
      ...(row.id ? { id: row.id } : {}),
      name: row.name,
      componentType: row.componentType,
      maxMarks: row.maxMarks.trim() === "" ? undefined : Number(row.maxMarks),
      weight: row.weight.trim() === "" ? undefined : Number(row.weight),
      isRequired: row.isRequired,
      isRepeatable: row.isRepeatable,
      expectedCount: row.isRepeatable ? Number(row.expectedCount) || 1 : 1,
    })),
  };
  const parsed = saveAssessmentTemplateSchema.safeParse(candidate);
  const problems = parsed.success ? [] : [...new Set(parsed.error.issues.map((issue) => issue.message))];
  if (!allClasses && classIds.length === 0) problems.push("Choose at least one class, or switch to all classes.");

  const save = useMutation({
    mutationFn: (body: unknown) =>
      apiFetch<{ id: string }>(template ? `/assessments/setup/templates/${template.id}` : "/assessments/setup/templates", {
        method: template ? "PUT" : "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: setupKey });
      onSaved(template ? `Saved “${name}”.` : `“${name}” is ready. Teachers can now enter marks for the classes it covers.`);
    },
  });

  function update(key: number, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }
  function move(index: number, by: -1 | 1) {
    setRows((current) => {
      const next = [...current];
      const target = index + by;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }
  async function createScale() {
    setCreatingScale(true);
    try {
      setGradingSystemId(await onCreateStandardScale());
    } finally {
      setCreatingScale(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (parsed.success && problems.length === 0) save.mutate(parsed.data);
  }

  const levels = [...new Set(setup.classes.map((klass) => klass.level))];
  const structureLocked = hasMarks;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4"
      onMouseDown={(event) => event.target === event.currentTarget && !save.isPending && onClose()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="assessment-title"
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="assessment-title" className="text-sm font-bold text-foreground">
              {template ? "Edit assessment" : "New assessment"}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Set what teachers mark and how it adds up to a pupil&rsquo;s grade.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        {structureLocked && (
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-foreground/80">
            <Lock className="mt-0.5 size-3.5 shrink-0" />
            Marks have already been entered ({template!.marksRecorded} pupil{template!.marksRecorded === 1 ? "" : "s"}). You can rename components, change the deadline, add classes or lock it, but marks, weights and the grading scale are fixed. Duplicate it to start a different version.
          </p>
        )}

        <form onSubmit={submit} noValidate className="mt-4 space-y-6">
          <section className="space-y-3" aria-label="Details">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label}>
                Name
                <input className={box} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Termly assessment" />
              </label>
              {setup.gradingSystems.length > 0 ? (
                <label className={label}>
                  Grading scale
                  <select className={box} value={gradingSystemId} disabled={structureLocked} onChange={(event) => setGradingSystemId(event.target.value)}>
                    {setup.gradingSystems.map((system) => (
                      <option key={system.id} value={system.id}>
                        {system.name}{system.shared ? " (shared)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className={label}>
                  <span>Grading scale</span>
                  <button
                    type="button"
                    onClick={() => void createScale()}
                    disabled={creatingScale}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary/30 px-3 text-xs font-semibold text-primary hover:bg-primary/10"
                  >
                    {creatingScale ? <LoaderCircle className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
                    Create the standard A to F scale
                  </button>
                </div>
              )}
            </div>
            <label className={label}>
              Description (optional)
              <input className={box} value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>
          </section>

          <section className="space-y-3" aria-label="Where it applies">
            <h3 className={heading}>Where it applies</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label}>
                Subject
                <select className={box} value={subjectCode} onChange={(event) => setSubjectCode(event.target.value)}>
                  <option value="">All subjects</option>
                  {setup.subjects.map((subject) => (
                    <option key={subject.id} value={subject.code}>{subject.name}</option>
                  ))}
                </select>
              </label>
              <label className={label}>
                Term
                <select className={box} value={termNumber} onChange={(event) => setTermNumber(event.target.value)}>
                  <option value="">Every term</option>
                  {[1, 2, 3].map((number) => <option key={number} value={number}>Term {number} only</option>)}
                </select>
              </label>
            </div>
            <fieldset className="space-y-2">
              <legend className={label}>Classes</legend>
              <div className="flex gap-4 text-xs text-foreground/80">
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="class-scope" checked={allClasses} onChange={() => setAllClasses(true)} className="accent-primary" />
                  All classes
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="class-scope" checked={!allClasses} onChange={() => setAllClasses(false)} className="accent-primary" />
                  Only some classes
                </label>
              </div>
              {!allClasses && (
                <div className="space-y-3 rounded-xl border border-border p-3">
                  {levels.map((level) => {
                    const inLevel = setup.classes.filter((klass) => klass.level === level);
                    const all = inLevel.every((klass) => classIds.includes(klass.id));
                    return (
                      <div key={level}>
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-muted-foreground">{level}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setClassIds((current) =>
                                all ? current.filter((id) => !inLevel.some((klass) => klass.id === id)) : [...new Set([...current, ...inLevel.map((klass) => klass.id)])],
                              )
                            }
                            className="text-[11px] font-semibold text-primary hover:underline"
                          >
                            {all ? `Clear ${level}` : `Select all ${level}`}
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {inLevel.map((klass) => (
                            <label key={klass.id} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-foreground/80 hover:bg-muted/50">
                              <input
                                type="checkbox"
                                checked={classIds.includes(klass.id)}
                                onChange={(event) => setClassIds((current) => (event.target.checked ? [...current, klass.id] : current.filter((id) => id !== klass.id)))}
                                className="accent-primary"
                              />
                              {klass.name}
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {setup.classes.length === 0 && <p className="text-xs text-muted-foreground">No classes have been created yet.</p>}
                </div>
              )}
            </fieldset>
          </section>

          <section className="space-y-3" aria-label="Components">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className={heading}>What is marked</h3>
              <p
                role="status"
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${weightOk ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}
              >
                {weightOk ? <CircleCheck className="size-3.5" /> : <CircleAlert className="size-3.5" />}
                Weights total {totalWeight}%{weightOk ? "" : ", needs to be 100%"}
              </p>
            </div>
            <div className="hidden grid-cols-[1fr_8rem_4.5rem_4.5rem_auto] gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 sm:grid" aria-hidden="true">
              <span>Component</span><span>Type</span><span>Out of</span><span>Weight %</span><span />
            </div>
            <ul className="space-y-3">
              {rows.map((row, index) => (
                <li key={row.key} className="rounded-xl border border-border p-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_8rem_4.5rem_4.5rem_auto] sm:items-center">
                    <input className={box} aria-label={`Component ${index + 1} name`} value={row.name} onChange={(event) => update(row.key, { name: event.target.value })} placeholder="e.g. Class assessment" />
                    <select className={box} aria-label={`Component ${index + 1} type`} value={row.componentType} disabled={structureLocked} onChange={(event) => update(row.key, { componentType: event.target.value as AssessmentTypeName })}>
                      {ASSESSMENT_TYPES.map((type) => <option key={type} value={type}>{ASSESSMENT_TYPE_LABELS[type]}</option>)}
                    </select>
                    <input className={box} aria-label={`Component ${index + 1} maximum marks`} type="number" inputMode="decimal" min={1} step="any" value={row.maxMarks} disabled={structureLocked} onChange={(event) => update(row.key, { maxMarks: event.target.value })} />
                    <input className={box} aria-label={`Component ${index + 1} weight`} type="number" inputMode="decimal" min={0} max={100} step="any" value={row.weight} disabled={structureLocked} onChange={(event) => update(row.key, { weight: event.target.value })} />
                    <div className="flex items-center justify-end gap-0.5">
                      <button type="button" aria-label={`Move ${row.name || `component ${index + 1}`} up`} disabled={index === 0} onClick={() => move(index, -1)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowUp className="size-3.5" /></button>
                      <button type="button" aria-label={`Move ${row.name || `component ${index + 1}`} down`} disabled={index === rows.length - 1} onClick={() => move(index, 1)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowDown className="size-3.5" /></button>
                      <button type="button" aria-label={`Remove ${row.name || `component ${index + 1}`}`} disabled={structureLocked || rows.length <= 1} onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))} className="rounded-md p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-30"><Trash2 className="size-3.5" /></button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
                    <label className="inline-flex items-center gap-1.5">
                      <input type="checkbox" checked={row.isRequired} disabled={structureLocked} onChange={(event) => update(row.key, { isRequired: event.target.checked })} className="accent-primary" />
                      Needed for a grade
                    </label>
                    <label className="inline-flex items-center gap-1.5">
                      <input type="checkbox" checked={row.isRepeatable} disabled={structureLocked} onChange={(event) => update(row.key, { isRepeatable: event.target.checked })} className="accent-primary" />
                      Happens more than once (averaged)
                    </label>
                    {row.isRepeatable && (
                      <label className="inline-flex items-center gap-1.5">
                        How many times
                        <input type="number" min={1} max={10} aria-label={`Component ${index + 1} times`} value={row.expectedCount} disabled={structureLocked} onChange={(event) => update(row.key, { expectedCount: event.target.value })} className={`${box} w-16`} />
                      </label>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {!structureLocked && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={rows.length >= 12}
                  onClick={() => setRows((current) => [...current, rowFrom({ name: "", componentType: "CLASS_TEST", maxMarks: 100, weight: 0, isRequired: true, isRepeatable: false, expectedCount: 1 })])}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/10"
                >
                  <Plus className="size-3.5" /> Add a component
                </button>
                <button type="button" onClick={() => setRows(STANDARD_COMPONENTS.map(rowFrom))} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-muted">
                  <Wand2 className="size-3.5" /> Class assessment 30 + exam 70
                </button>
              </div>
            )}
          </section>

          <section className="space-y-3" aria-label="Deadline and status">
            <h3 className={heading}>Deadline and status</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className={label}>
                Deadline for entering marks (optional)
                <input type="date" className={box} value={deadline} onChange={(event) => setDeadline(event.target.value)} />
              </label>
              <label className="flex items-start gap-2 text-xs text-foreground/80">
                <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} className="mt-0.5 accent-primary" />
                <span><span className="font-semibold">Active</span><span className="block text-[11px] text-muted-foreground">Teachers can use it for the classes above.</span></span>
              </label>
              <label className="flex items-start gap-2 text-xs text-foreground/80">
                <input type="checkbox" checked={isLocked} onChange={(event) => setIsLocked(event.target.checked)} className="mt-0.5 accent-primary" />
                <span><span className="font-semibold">Lock marks</span><span className="block text-[11px] text-muted-foreground">Stops teachers changing marks, for example after moderation.</span></span>
              </label>
            </div>
          </section>

          {attempted && problems.length > 0 && (
            <ul role="alert" className="space-y-1 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {problems.map((problem) => <li key={problem}>{problem}</li>)}
            </ul>
          )}
          {save.error && (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" /> {save.error.message}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={save.isPending} className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-xs font-semibold text-foreground/80 hover:bg-muted/50">
              Cancel
            </button>
            <button type="submit" disabled={save.isPending} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {save.isPending && <LoaderCircle className="size-3.5 animate-spin" />}
              {template ? "Save changes" : "Create assessment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

