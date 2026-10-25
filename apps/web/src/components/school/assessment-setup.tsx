import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Copy, GraduationCap, Lock, LockOpen, LoaderCircle, Pencil, Plus, Power, Rocket, Trash2 } from "lucide-react";
import { useState } from "react";
import { AssessmentTemplateDialog } from "@/components/school/assessment-template-dialog";
import { GradingSystemDialog } from "@/components/school/grading-system-dialog";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { apiFetch } from "@/lib/api";
import {
  STANDARD_BANDS,
  STANDARD_COMPONENTS,
  setupKey,
  templateToInput,
  type AssessmentSetup,
  type SetupGradingSystem,
  type SetupTemplate,
} from "@/lib/assessment-setup";
import { useCanExportTables } from "@/lib/table-export-policy";

const iconButton =
  "inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40";

/**
 * Where administrators set up how marks are collected and graded: grading
 * scales, and the assessments teachers enter marks against. Until at least one
 * assessment covers a class and subject, teachers cannot enter marks there.
 */
export function AssessmentSetupWorkspace() {
  const queryClient = useQueryClient();
  const canExport = useCanExportTables();
  const [editing, setEditing] = useState<SetupTemplate | "new" | null>(null);
  const [scaleDialog, setScaleDialog] = useState<{ system?: SetupGradingSystem; asCopy?: boolean } | "new" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showAllUncovered, setShowAllUncovered] = useState(false);

  const query = useQuery({
    queryKey: setupKey,
    queryFn: () => apiFetch<AssessmentSetup>("/assessments/setup"),
    retry: false,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: setupKey });

  const createStandardScale = async () => {
    const created = await apiFetch<{ id: string }>("/assessments/setup/grading-systems", {
      method: "POST",
      body: JSON.stringify({ name: "Standard scale", scales: STANDARD_BANDS }),
    });
    await refresh();
    return created.id;
  };

  const quickStart = useMutation({
    mutationFn: async (setup: AssessmentSetup) => {
      const scaleId = setup.gradingSystems[0]?.id ?? (await createStandardScale());
      await apiFetch("/assessments/setup/templates", {
        method: "POST",
        body: JSON.stringify({ name: "Termly assessment", gradingSystemId: scaleId, classIds: [], components: STANDARD_COMPONENTS }),
      });
    },
    onSuccess: async () => {
      await refresh();
      setNotice("Done. Every class and subject now has a Termly assessment (class assessment 30 + exam 70). Teachers can enter marks.");
    },
  });

  const change = useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: "PUT" | "POST" | "DELETE"; body?: unknown; message: string }) =>
      apiFetch(`/assessments/setup/${path}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) }),
    onSuccess: async (_result, variables) => {
      setNotice(variables.message);
      await refresh();
    },
  });

  if (query.isPending) return <p className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading assessment setup…</p>;
  if (query.error) return <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">Assessment setup could not be loaded: {query.error.message}</p>;

  const setup = query.data;
  const classNames = new Map(setup.classes.map((klass) => [klass.id, klass.name]));
  const ownScales = setup.gradingSystems.filter((system) => !system.shared);
  const subjectName = (code: string | null) => (code ? setup.subjects.find((subject) => subject.code.toLowerCase() === code.toLowerCase())?.name ?? code : "All subjects");
  const shownUncovered = showAllUncovered ? setup.uncovered : setup.uncovered.slice(0, 6);

  const columns: DataTableColumn<SetupTemplate>[] = [
    {
      id: "name",
      header: "Assessment",
      value: (template) => template.name,
      cell: (template) => (
        <div>
          <p className="text-sm font-semibold text-foreground">{template.name}</p>
          {template.description && <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">{template.description}</p>}
        </div>
      ),
    },
    {
      id: "components",
      header: "What is marked",
      value: (template) => template.components.map((component) => `${component.name} ${component.weight}%`).join(", "),
      cell: (template) => (
        <ul className="space-y-0.5 text-xs">
          {template.components.map((component) => (
            <li key={component.id}>
              {component.name} <span className="text-muted-foreground">· out of {component.maxMarks} · {component.weight}%</span>
              {component.isRepeatable && <span className="text-muted-foreground"> · ×{component.expectedCount}</span>}
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: "applies",
      header: "Applies to",
      value: (template) =>
        `${template.allClasses ? "All classes" : template.classIds.map((id) => classNames.get(id) ?? "").join(", ")} · ${subjectName(template.subjectCode)} · ${template.termNumber ? `Term ${template.termNumber}` : "Every term"}`,
      cell: (template) => (
        <div className="text-xs">
          <p title={template.allClasses ? undefined : template.classIds.map((id) => classNames.get(id)).join(", ")}>
            {template.allClasses ? "All classes" : `${template.classIds.length} class${template.classIds.length === 1 ? "" : "es"}`}
          </p>
          <p className="text-muted-foreground">{subjectName(template.subjectCode)} · {template.termNumber ? `Term ${template.termNumber}` : "Every term"}</p>
        </div>
      ),
    },
    { id: "scale", header: "Grading scale", value: (template) => template.gradingSystem.name, cell: (template) => template.gradingSystem.name },
    {
      id: "deadline",
      header: "Deadline",
      value: (template) => template.deadline?.slice(0, 10) ?? "None",
      cell: (template) => (template.deadline ? new Date(template.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : <span className="text-muted-foreground">None</span>),
    },
    {
      id: "status",
      header: "Status",
      value: (template) => (template.isLocked ? "Locked" : template.isActive ? "Active" : "Off"),
      cell: (template) => (
        <div className="space-y-1 text-xs">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              template.isLocked
                ? "bg-warning/10 text-warning"
                : template.isActive
                  ? "bg-success/10 text-success"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {template.isLocked ? "Locked" : template.isActive ? "Active" : "Off"}
          </span>
          <p className="text-muted-foreground">{template.marksRecorded ? `${template.marksRecorded} pupil${template.marksRecorded === 1 ? "" : "s"} marked` : "No marks yet"}</p>
        </div>
      ),
    },
    {
      id: "actions",
      header: "",
      className: "text-right",
      cell: (template) => (
        <div className="inline-flex items-center">
          <button type="button" className={iconButton} aria-label={`Edit ${template.name}`} title="Edit" onClick={() => setEditing(template)}><Pencil className="size-4" /></button>
          <button type="button" className={iconButton} aria-label={`Duplicate ${template.name}`} title="Duplicate" disabled={change.isPending} onClick={() => change.mutate({ path: `templates/${template.id}/duplicate`, method: "POST", message: `Copied “${template.name}”. The copy is off until you turn it on.` })}><Copy className="size-4" /></button>
          <button type="button" className={iconButton} aria-label={`${template.isActive ? "Turn off" : "Turn on"} ${template.name}`} title={template.isActive ? "Turn off" : "Turn on"} disabled={change.isPending} onClick={() => change.mutate({ path: `templates/${template.id}`, method: "PUT", body: templateToInput(template, { isActive: !template.isActive }), message: `${template.name} is now ${template.isActive ? "off" : "on"}.` })}><Power className="size-4" /></button>
          <button type="button" className={iconButton} aria-label={`${template.isLocked ? "Unlock" : "Lock"} ${template.name}`} title={template.isLocked ? "Unlock marks" : "Lock marks"} disabled={change.isPending} onClick={() => change.mutate({ path: `templates/${template.id}`, method: "PUT", body: templateToInput(template, { isLocked: !template.isLocked }), message: `${template.name} is now ${template.isLocked ? "unlocked" : "locked"}.` })}>{template.isLocked ? <LockOpen className="size-4" /> : <Lock className="size-4" />}</button>
          <button
            type="button"
            className={`${iconButton} text-destructive hover:text-destructive`}
            aria-label={`Delete ${template.name}`}
            title={template.marksRecorded ? "Has marks, turn it off instead" : "Delete"}
            disabled={change.isPending || template.marksRecorded > 0}
            onClick={() => window.confirm(`Delete “${template.name}”? This cannot be undone.`) && change.mutate({ path: `templates/${template.id}`, method: "DELETE", message: `Deleted “${template.name}”.` })}
          ><Trash2 className="size-4" /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-card via-primary/10 to-info/10 p-5 sm:p-6">
        <h2 className="text-base font-bold text-foreground">How assessments work</h2>
        <ol className="mt-3 grid gap-3 text-xs leading-relaxed text-muted-foreground sm:grid-cols-3">
          <li><span className="font-semibold text-foreground">1. Grading scale.</span> Which scores earn which grade (A to F, for example).</li>
          <li><span className="font-semibold text-foreground">2. Assessment.</span> What teachers mark (class assessment, exam) and how much each counts, for the classes and subjects you choose.</li>
          <li><span className="font-semibold text-foreground">3. Marks entry.</span> Teachers enter marks for their subjects. Totals, grades and positions are worked out for them.</li>
        </ol>
      </div>

      {notice && (
        <p role="status" className="rounded-xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
          {notice}
        </p>
      )}
      {(change.error || quickStart.error) && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" /> {(change.error ?? quickStart.error)?.message}
        </p>
      )}

      {setup.templates.length === 0 && (
        <section aria-labelledby="quick-start-heading" className="rounded-2xl border-2 border-dashed border-primary/20 bg-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-xl">
              <h2 id="quick-start-heading" className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Rocket className="size-4 text-primary" /> Get teachers entering marks in one click
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                No assessment is set up yet, which is why teachers see &ldquo;No assessment applies&rdquo;. This creates {setup.gradingSystems.length === 0 ? "the standard A to F grading scale and " : ""}a <strong>Termly assessment</strong> for every class and subject: class assessment out of 30 plus an end-of-term exam out of 70. You can change anything afterwards.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={quickStart.isPending}
                onClick={() => { setNotice(null); quickStart.mutate(setup); }}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {quickStart.isPending && <LoaderCircle className="size-3.5 animate-spin" />}
                Set up for all classes
              </button>
              <button type="button" onClick={() => setEditing("new")} className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-xs font-semibold text-foreground/80 hover:bg-muted/50">
                Customise first
              </button>
            </div>
          </div>
        </section>
      )}

      {setup.templates.length > 0 && setup.uncovered.length > 0 && (
        <section aria-label="Classes without an assessment" className="rounded-2xl border border-warning/20 bg-warning/10 p-4">
          <p className="flex items-start gap-2 text-sm font-semibold text-warning">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            {setup.uncovered.length} class and subject combination{setup.uncovered.length === 1 ? " has" : "s have"} no assessment, so teachers can&rsquo;t enter marks there.
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {shownUncovered.map((item) => (
              <li key={`${item.classId}-${item.subjectId}`} className="rounded-full bg-card px-2.5 py-1 text-[11px] font-medium text-warning">
                {item.className} · {item.subjectName}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold">
            {setup.uncovered.length > 6 && (
              <button type="button" onClick={() => setShowAllUncovered((value) => !value)} className="text-warning underline">
                {showAllUncovered ? "Show fewer" : `Show all ${setup.uncovered.length}`}
              </button>
            )}
            <button type="button" onClick={() => setEditing("new")} className="text-warning underline">Create an assessment for them</button>
          </div>
        </section>
      )}

      <section aria-labelledby="assessments-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="assessments-heading" className="text-sm font-bold text-foreground">Assessments</h2>
            <p className="text-xs text-muted-foreground">{setup.term ? `Current term: ${setup.term.name}` : "No academic term is selected, so coverage can't be checked."}</p>
          </div>
          <button type="button" onClick={() => setEditing("new")} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
            <Plus className="size-4" /> New assessment
          </button>
        </div>
        {setup.templates.length > 0 && (
          <DataTable
            rows={setup.templates}
            columns={columns}
            getRowId={(template) => template.id}
            exportTitle="Assessments"
            canExport={canExport}
            searchPlaceholder="Search assessments…"
            emptyTitle="No assessments"
            emptyDescription="Create one to let teachers enter marks."
          />
        )}
      </section>

      <section aria-labelledby="scales-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="scales-heading" className="text-sm font-bold text-foreground">Grading scales</h2>
            <p className="text-xs text-muted-foreground">Which scores earn which grade.</p>
          </div>
          <button type="button" onClick={() => setScaleDialog("new")} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-4 text-xs font-semibold text-foreground/80 hover:bg-muted/50">
            <Plus className="size-4" /> New grading scale
          </button>
        </div>
        {setup.gradingSystems.length === 0 ? (
          <p className="rounded-xl border border-dashed border-input px-4 py-6 text-center text-xs text-muted-foreground">No grading scale yet. Create one, or use the quick start above.</p>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {setup.gradingSystems.map((system) => {
              const readOnly = system.shared || system.hasMarks;
              return (
                <li key={system.id} className="rounded-2xl border border-border/80 bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="flex items-center gap-2 text-sm font-bold text-foreground"><GraduationCap className="size-4 text-primary" />{system.name}</h3>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {system.shared ? "Shared by all schools" : system.usedBy ? `Used by ${system.usedBy} assessment${system.usedBy === 1 ? "" : "s"}` : "Not used yet"}
                        {system.hasMarks && " · marks graded with it"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center">
                      {!readOnly && <button type="button" className={iconButton} aria-label={`Edit ${system.name}`} title="Edit" onClick={() => setScaleDialog({ system })}><Pencil className="size-4" /></button>}
                      {readOnly && <button type="button" className={iconButton} aria-label={`Copy ${system.name}`} title="Copy as a new scale" onClick={() => setScaleDialog({ system, asCopy: true })}><Copy className="size-4" /></button>}
                      {!system.shared && (
                        <button
                          type="button"
                          className={`${iconButton} text-destructive hover:text-destructive`}
                          aria-label={`Delete ${system.name}`}
                          title={system.usedBy ? "In use" : "Delete"}
                          disabled={change.isPending || system.usedBy > 0}
                          onClick={() => window.confirm(`Delete the “${system.name}” grading scale?`) && change.mutate({ path: `grading-systems/${system.id}`, method: "DELETE", message: `Deleted “${system.name}”.` })}
                        ><Trash2 className="size-4" /></button>
                      )}
                    </div>
                  </div>
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {system.scales.map((band) => (
                      <li key={band.grade} className="rounded-lg bg-muted px-2.5 py-1 text-[11px] text-foreground/80" title={band.description}>
                        <span className="font-bold">{band.grade}</span> {band.minScore}–{band.maxScore}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
        {ownScales.length === 0 && setup.gradingSystems.length > 0 && (
          <p className="text-[11px] text-muted-foreground">Shared scales can&rsquo;t be edited. Copy one to make your own version.</p>
        )}
      </section>

      {editing && (
        <AssessmentTemplateDialog
          key={editing === "new" ? "new" : editing.id}
          setup={setup}
          template={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={(message) => { setEditing(null); setNotice(message); }}
          onCreateStandardScale={createStandardScale}
        />
      )}
      {scaleDialog && (
        <GradingSystemDialog
          key={scaleDialog === "new" ? "new" : `${scaleDialog.system?.id}-${scaleDialog.asCopy ? "copy" : "edit"}`}
          system={scaleDialog === "new" ? undefined : scaleDialog.system}
          asCopy={scaleDialog === "new" ? false : scaleDialog.asCopy}
          onClose={() => setScaleDialog(null)}
          onSaved={() => { setScaleDialog(null); setNotice("Grading scale saved."); }}
        />
      )}
    </div>
  );
}

