import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gradeBoundaryProblems, gradeFromBoundaries, suggestBoundaries } from "@schoolhub/shared";
import { Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { FormField, FormInput, FormSelect } from "@/components/forms/form-controls";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormModal } from "@/components/ui/form-modal";
import { apiFetch } from "@/lib/api";
import type { AssessmentSetup, BoundaryInfo, SetupTemplate } from "@/lib/assessment-setup";

const cell = "px-3 py-2 text-xs";

/**
 * Where an administrator sets the mark boundaries of a class-ranked (stanine) assessment.
 *
 * WAEC publishes no fixed BECE boundaries: for each subject, each year, the cut-off marks are
 * set after marking so the grades land close to the stanine shares. This screen does the same.
 * It can suggest cut-offs from how the pupils actually scored, shows how many pupils each
 * grade would get as the marks are edited, and saves the lot for one subject and term.
 */
export function GradeBoundariesDialog({
  template,
  setup,
  onClose,
  onSaved,
}: {
  template: SetupTemplate;
  setup: AssessmentSetup;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const term = setup.term;
  const subjects = useMemo(
    () =>
      template.subjectCode
        ? setup.subjects.filter((subject) => subject.code.toLowerCase() === template.subjectCode!.toLowerCase())
        : setup.subjects,
    [setup.subjects, template.subjectCode],
  );
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [hint, setHint] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const key = ["assessments", "boundaries", template.id, subjectId, term?.id] as const;
  const query = useQuery({
    queryKey: key,
    queryFn: () => apiFetch<BoundaryInfo>(`/assessments/setup/templates/${template.id}/boundaries?subjectId=${subjectId}&termId=${term!.id}`),
    enabled: !!subjectId && !!term,
    retry: false,
  });
  const info = query.data;
  const grades = useMemo(() => info?.bands.map((band) => band.grade) ?? [], [info]);
  const saved = useMemo(() => new Map((info?.boundaries ?? []).map((item) => [item.grade, item.minScore])), [info]);
  const valueOf = (grade: string) => edits[grade] ?? (saved.has(grade) ? String(saved.get(grade)) : "");

  const filled = grades.slice(0, -1).map((grade) => ({ grade, text: valueOf(grade).trim() }));
  const parsed = filled.filter((item) => item.text !== "" && Number.isFinite(Number(item.text))).map((item) => ({ grade: item.grade, minScore: Number(item.text) }));
  const problems = info ? gradeBoundaryProblems(grades, parsed) : [];
  const complete = !!info && problems.length === 0 && parsed.length === grades.length - 1;

  // How many finished pupils each grade would get with the marks as they stand on screen.
  const preview = useMemo(() => {
    if (!info || !complete) return null;
    const minimums = Object.fromEntries(parsed.map((item) => [item.grade, item.minScore]));
    const counts = new Map(grades.map((grade) => [grade, 0]));
    for (const percentage of info.percentages) {
      const band = gradeFromBoundaries(percentage, info.bands, minimums);
      counts.set(band.grade, (counts.get(band.grade) ?? 0) + 1);
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info, complete, JSON.stringify(parsed)]);

  const done = (message: string) => {
    void queryClient.invalidateQueries({ queryKey: ["assessments"] });
    onSaved(message);
  };

  const save = useMutation({
    mutationFn: () =>
      apiFetch<BoundaryInfo>(`/assessments/setup/templates/${template.id}/boundaries`, {
        method: "PUT",
        body: JSON.stringify({ subjectId, termId: term!.id, boundaries: parsed }),
      }),
    onSuccess: (result) =>
      done(`Grade boundaries saved for ${result.subject.name} · ${result.term.name}. ${result.regraded ? `${result.regraded} pupil grade${result.regraded === 1 ? "" : "s"} updated.` : "No grades needed to change."}`),
  });
  const clear = useMutation({
    mutationFn: () =>
      apiFetch<BoundaryInfo>(`/assessments/setup/templates/${template.id}/boundaries?subjectId=${subjectId}&termId=${term!.id}`, { method: "DELETE" }),
    onSuccess: (result) => done(`Boundaries cleared for ${result.subject.name}. Grades follow each pupil's position in their class again.`),
  });

  function suggest() {
    if (!info) return;
    const suggestion = suggestBoundaries(info.percentages, grades, info.bands.map((band) => band.cumulativeShare));
    setEdits(Object.fromEntries(suggestion.map((item) => [item.grade, String(item.minScore)])));
    setHint(`Suggested from ${info.percentages.length} finished result${info.percentages.length === 1 ? "" : "s"}, so each grade lands as close as it can to its share. Adjust any mark, then save.`);
  }

  const total = info?.percentages.length ?? 0;
  // A blank field just keeps Save disabled; only a real mistake (an order or range problem) is spelled out.
  const submitError = (save.error ?? clear.error)?.message ?? problems.find((message) => !message.startsWith("Enter the minimum mark")) ?? null;

  return (
    <>
      <FormModal
        title={`Grade boundaries · ${template.name}`}
        description="WAEC sets new mark boundaries for every subject each year, based on how candidates scored. Set the minimum mark for each grade here."
        size="3xl"
        onClose={onClose}
        onSubmit={() => (complete ? save.mutateAsync() : undefined)}
        submitLabel="Save boundaries"
        submitting={save.isPending}
        submitDisabled={!complete || clear.isPending}
        error={submitError}
      >
        {!term ? (
          <p className="text-xs text-muted-foreground">No academic term is selected, so boundaries can&rsquo;t be set yet.</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Subject" htmlFor="boundary-subject" hint="Boundaries differ for every subject.">
                <FormSelect id="boundary-subject" value={subjectId} onChange={(event) => { setSubjectId(event.target.value); setEdits({}); setHint(null); }}>
                  {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                </FormSelect>
              </FormField>
              <FormField label="Term" htmlFor="boundary-term" hint="Boundaries apply to the current term only.">
                <FormInput id="boundary-term" value={term.name} readOnly disabled />
              </FormField>
            </div>

            {query.isPending && subjectId && <p className="text-xs text-muted-foreground">Loading…</p>}
            {query.error && <p role="alert" className="text-xs text-destructive">{query.error.message}</p>}

            {info && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {total === 0
                      ? "No finished results yet for this subject, so there is nothing to suggest from. You can still enter the marks yourself."
                      : `${total} finished result${total === 1 ? "" : "s"} across every class taking this subject.`}
                    {" "}
                    {info.boundaries ? "Grades currently follow the boundaries below." : "Until you save boundaries, grades follow each pupil's position in their own class."}
                  </p>
                  <button
                    type="button"
                    onClick={suggest}
                    disabled={total === 0}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground/80 hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Wand2 className="size-4" /> Suggest from results
                  </button>
                </div>
                {hint && <p role="status" className="rounded-lg bg-info/10 px-3 py-2 text-xs text-info">{hint}</p>}

                <div className="overflow-x-auto rounded-xl border border-border/80">
                  <table className="w-full text-left">
                    <thead className="bg-muted/50 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                      <tr>
                        <th scope="col" className={cell}>Grade</th>
                        <th scope="col" className={cell}>Share of pupils</th>
                        <th scope="col" className={cell}>Minimum mark (%)</th>
                        <th scope="col" className={`${cell} text-right`}>Pupils with this grade</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {info.bands.map((band, index) => {
                        const last = index === info.bands.length - 1;
                        const count = preview?.get(band.grade);
                        return (
                          <tr key={band.grade}>
                            <th scope="row" className={`${cell} font-bold text-foreground`}>
                              {band.grade} <span className="font-normal text-muted-foreground">{band.description}</span>
                            </th>
                            <td className={`${cell} text-muted-foreground`}>{index === 0 ? "Top" : last ? "Bottom" : "Next"} {band.share}%</td>
                            <td className={cell}>
                              {last ? (
                                <span className="text-muted-foreground">Everything below grade {info.bands[index - 1]?.grade}</span>
                              ) : (
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min={0}
                                  max={100}
                                  step="any"
                                  aria-label={`Minimum mark for grade ${band.grade}`}
                                  value={valueOf(band.grade)}
                                  onChange={(event) => setEdits((current) => ({ ...current, [band.grade]: event.target.value }))}
                                  className="h-9 w-24 rounded-lg border border-border bg-card px-2 text-center text-xs tabular-nums text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                                />
                              )}
                            </td>
                            <td className={`${cell} text-right tabular-nums text-muted-foreground`}>
                              {count === undefined || total === 0 ? "—" : `${count} (${Math.round((count / total) * 1000) / 10}%)`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Changing boundaries re-grades every finished result for this subject straight away. Marks, totals and positions do not change.
                </p>

                {info.boundaries && (
                  <button
                    type="button"
                    disabled={clear.isPending || save.isPending}
                    onClick={() => setConfirmingClear(true)}
                    className="text-xs font-semibold text-destructive underline disabled:opacity-50"
                  >
                    Remove boundaries and grade by class position instead
                  </button>
                )}
              </>
            )}
          </>
        )}
      </FormModal>

      <ConfirmDialog
        open={confirmingClear}
        title="Remove these boundaries?"
        description={`Grades for ${info?.subject.name ?? "this subject"} will go back to following each pupil's position in their own class, and every finished result will be re-graded now.`}
        confirmLabel="Remove boundaries"
        confirmVariant="danger"
        loading={clear.isPending}
        onCancel={() => setConfirmingClear(false)}
        onConfirm={() => clear.mutate(undefined, { onSettled: () => setConfirmingClear(false) })}
      />
    </>
  );
}
