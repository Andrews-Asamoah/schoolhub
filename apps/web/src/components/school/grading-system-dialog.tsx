import { useMutation, useQueryClient } from "@tanstack/react-query";
import { gradeScaleProblems, saveGradingSystemSchema } from "@schoolhub/shared";
import { CircleAlert, LoaderCircle, Plus, Trash2, Wand2, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import { STANDARD_BANDS, setupKey, type SetupBand, type SetupGradingSystem } from "@/lib/assessment-setup";

interface Row {
  key: number;
  grade: string;
  description: string;
  minScore: string;
  maxScore: string;
  gradePoint: string;
}

const input =
  "h-9 w-full rounded-lg border border-border bg-card px-2.5 text-xs text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 disabled:bg-muted/50 disabled:text-muted-foreground";

let rowKey = 0;
const toRows = (bands: SetupBand[]): Row[] =>
  bands.map((band) => ({
    key: ++rowKey,
    grade: band.grade,
    description: band.description,
    minScore: String(band.minScore),
    maxScore: String(band.maxScore),
    gradePoint: String(band.gradePoint),
  }));

/** Create or edit a school's grading scale: which score range earns which grade. */
export function GradingSystemDialog({
  system,
  asCopy,
  onClose,
  onSaved,
}: {
  system?: SetupGradingSystem;
  /** Start a new scale from an existing one (a shared scale, or one already used for marks). */
  asCopy?: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const editing = !!system && !asCopy;
  const [name, setName] = useState(system ? (asCopy ? `${system.name} (copy)` : system.name) : "");
  const [description, setDescription] = useState(system?.description ?? "");
  const [rows, setRows] = useState<Row[]>(() => toRows(system?.scales ?? STANDARD_BANDS));
  const [attempted, setAttempted] = useState(false);
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

  const payload = {
    name,
    description,
    scales: rows.map((row) => ({
      grade: row.grade,
      description: row.description,
      minScore: row.minScore.trim() === "" ? undefined : Number(row.minScore),
      maxScore: row.maxScore.trim() === "" ? undefined : Number(row.maxScore),
      gradePoint: row.gradePoint.trim() === "" ? undefined : Number(row.gradePoint),
    })),
  };
  const parsed = saveGradingSystemSchema.safeParse(payload);
  const liveProblems = gradeScaleProblems(
    rows
      .filter((row) => row.grade.trim() && row.minScore.trim() !== "" && row.maxScore.trim() !== "")
      .map((row) => ({ grade: row.grade, minScore: Number(row.minScore), maxScore: Number(row.maxScore) })),
  );
  const problems = parsed.success ? [] : [...new Set(parsed.error.issues.map((issue) => issue.message))];

  const save = useMutation({
    mutationFn: (body: unknown) =>
      apiFetch<{ id: string }>(editing ? `/assessments/setup/grading-systems/${system!.id}` : "/assessments/setup/grading-systems", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: setupKey });
      onSaved(result.id);
    },
  });

  function update(key: number, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (parsed.success) save.mutate(parsed.data);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4"
      onMouseDown={(event) => event.target === event.currentTarget && !save.isPending && onClose()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="grading-title"
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="grading-title" className="text-sm font-bold text-foreground">
              {editing ? "Edit grading scale" : asCopy ? "Copy grading scale" : "New grading scale"}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Choose which scores earn which grade. Assessments use this to grade pupils.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={submit} noValidate className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
              Name
              <input className={input} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Standard scale" />
            </label>
            <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
              Description (optional)
              <input className={input} value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Grades</h3>
              <button
                type="button"
                onClick={() => setRows(toRows(STANDARD_BANDS))}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold text-foreground/80 hover:bg-muted/50"
              >
                <Wand2 className="size-3.5" /> Use the standard A to F scale
              </button>
            </div>
            <div className="grid grid-cols-[4rem_1fr_5rem_5rem_5rem_2rem] gap-2 px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70" aria-hidden="true">
              <span>Grade</span><span>Meaning</span><span>From</span><span>To</span><span>Point</span><span />
            </div>
            <ul className="space-y-2">
              {rows.map((row, index) => (
                <li key={row.key} className="grid grid-cols-[4rem_1fr_5rem_5rem_5rem_2rem] items-center gap-2">
                  <input className={input} aria-label={`Grade ${index + 1}`} value={row.grade} maxLength={4} onChange={(event) => update(row.key, { grade: event.target.value })} />
                  <input className={input} aria-label={`Meaning of grade ${index + 1}`} value={row.description} onChange={(event) => update(row.key, { description: event.target.value })} />
                  <input className={input} aria-label={`Lowest score for grade ${index + 1}`} type="number" inputMode="decimal" min={0} max={100} step="any" value={row.minScore} onChange={(event) => update(row.key, { minScore: event.target.value })} />
                  <input className={input} aria-label={`Highest score for grade ${index + 1}`} type="number" inputMode="decimal" min={0} max={100} step="any" value={row.maxScore} onChange={(event) => update(row.key, { maxScore: event.target.value })} />
                  <input className={input} aria-label={`Grade point for grade ${index + 1}`} type="number" inputMode="decimal" min={0} max={10} step="any" value={row.gradePoint} onChange={(event) => update(row.key, { gradePoint: event.target.value })} />
                  <button
                    type="button"
                    aria-label={`Remove grade ${row.grade || index + 1}`}
                    disabled={rows.length <= 2}
                    onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
                    className="rounded-md p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-30"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setRows((current) => [...current, { key: ++rowKey, grade: "", description: "", minScore: "", maxScore: "", gradePoint: "" }])}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/10"
            >
              <Plus className="size-3.5" /> Add a grade
            </button>
          </div>

          {liveProblems.length > 0 && (
            <ul className="space-y-1 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning" aria-live="polite">
              {liveProblems.map((problem) => <li key={problem}>{problem}</li>)}
            </ul>
          )}
          {attempted && problems.length > 0 && liveProblems.length === 0 && (
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
              {editing ? "Save changes" : "Create grading scale"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
