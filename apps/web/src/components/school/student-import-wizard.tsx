import { STUDENT_IMPORT_LIMITS, type NormalizedStudentRow } from "@schoolhub/shared";
import { useQueryClient } from "@tanstack/react-query";
import {
  CircleAlert,
  CircleCheck,
  Download,
  FileSpreadsheet,
  FileText,
  LoaderCircle,
  Printer,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { apiFetch } from "@/lib/api";
import {
  chunk,
  credentialsTable,
  displayDate,
  downloadCsvTemplate,
  downloadFailedRows,
  downloadXlsxTemplate,
  problemsTable,
  type BatchResponse,
  type ImportRowResult,
  type PreviewResponse,
  type PreviewRow,
  type RowStatus,
} from "@/lib/student-import";
import { exportPdf, exportXlsx, printTable } from "@/lib/table-export";

type Phase = "upload" | "review" | "importing" | "done";
type Filter = "all" | "attention" | "ready" | "duplicate";

const STATUS: Record<RowStatus, { label: string; className: string }> = {
  ready: { label: "Ready", className: "bg-success/10 text-success" },
  warning: { label: "Check", className: "bg-warning/10 text-warning" },
  duplicate: { label: "Already added", className: "bg-muted text-muted-foreground" },
  error: { label: "Problem", className: "bg-destructive/10 text-destructive" },
};
const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);

/**
 * Add many existing students from a spreadsheet. The file is checked first and
 * nothing is created until the person reviews it and confirms. Students are then
 * added in small batches with progress, and students already in the school are
 * skipped, so the same file can safely be uploaded again.
 */
export function StudentImportWizard({
  classNames,
  houseNames,
  onClose,
}: {
  classNames: string[];
  houseNames: string[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>("upload");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [createGuardianLogins, setCreateGuardianLogins] = useState(false);
  const [results, setResults] = useState<ImportRowResult[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [paused, setPaused] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false);
  const [credentialsSaved, setCredentialsSaved] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);

  const batches = useRef<NormalizedStudentRow[][]>([]);
  const next = useRef(0);
  const stopRequested = useRef(false);
  const batchId = useRef(crypto.randomUUID());
  const sourceRows = useRef(new Map<number, NormalizedStudentRow>());
  const panel = useRef<HTMLDivElement>(null);

  const created = results.filter((result) => result.status === "created");
  const unsavedLogins = phase === "done" && created.length > 0 && !credentialsSaved;
  const guarded = phase === "importing" || unsavedLogins;

  // Leaving mid-import, or before saving the one-time passwords, loses work, so ask first.
  useEffect(() => {
    if (!guarded) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [guarded]);

  const closeRef = useRef<() => void>(() => undefined);
  closeRef.current = () => {
    if (phase === "importing" && !window.confirm("The import is still running. Stop and close?")) return;
    if (unsavedLogins && !window.confirm("You haven't saved the login details yet. They can't be shown again. Close anyway?")) return;
    stopRequested.current = true;
    if (results.some((result) => result.status === "created")) {
      void queryClient.invalidateQueries({ queryKey: ["students"] });
      void queryClient.invalidateQueries({ queryKey: ["academics"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
    onClose();
  };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);

  async function readFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!/\.(csv|xlsx)$/i.test(file.name)) return setError("Choose a .csv or .xlsx file. Old .xls files need to be saved as .xlsx first.");
    if (file.size > STUDENT_IMPORT_LIMITS.maxFileBytes) return setError(`That file is larger than ${mb(STUDENT_IMPORT_LIMITS.maxFileBytes)} MB.`);
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await apiFetch<PreviewResponse>("/students/import/preview", { method: "POST", body: form });
      sourceRows.current = new Map(response.rows.flatMap((row) => (row.row ? [[row.rowNumber, row.row] as const] : [])));
      setPreview(response);
      setFilter(response.summary.error + response.summary.warning > 0 ? "attention" : "all");
      setPhase("review");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The file couldn't be read.");
    } finally {
      setBusy(false);
    }
  }

  async function runBatches() {
    setPhase("importing");
    setPaused(null);
    stopRequested.current = false;
    while (next.current < batches.current.length) {
      if (stopRequested.current) {
        setStopped(true);
        break;
      }
      const rows = batches.current[next.current]!;
      try {
        const response = await apiFetch<BatchResponse>("/students/import", {
          method: "POST",
          body: JSON.stringify({ batchId: batchId.current, createGuardianLogins, rows }),
        });
        setResults((current) => [...current, ...response.results]);
        setProgress((current) => ({ ...current, done: current.done + rows.length }));
        next.current += 1;
      } catch (failure) {
        setPaused(failure instanceof Error ? failure.message : "The connection was lost.");
        return;
      }
    }
    setPhase("done");
  }

  function startImport() {
    if (!preview) return;
    const rows = preview.rows.filter((row) => (row.status === "ready" || row.status === "warning") && row.row).map((row) => row.row!);
    batches.current = chunk(rows, STUDENT_IMPORT_LIMITS.batchSize);
    next.current = 0;
    batchId.current = crypto.randomUUID();
    setResults([]);
    setStopped(false);
    setCredentialsSaved(false);
    setProgress({ done: 0, total: rows.length });
    void runBatches();
  }

  function startOver() {
    setPreview(null);
    setResults([]);
    setError(null);
    setPhase("upload");
  }

  async function template(kind: "csv" | "xlsx") {
    if (kind === "csv") return downloadCsvTemplate();
    setTemplateBusy(true);
    try {
      await downloadXlsxTemplate(classNames, houseNames);
    } finally {
      setTemplateBusy(false);
    }
  }

  const saveLogins = (how: "excel" | "print" | "pdf") => {
    const table = credentialsTable(results);
    setCredentialsSaved(true);
    if (how === "excel") void exportXlsx(table);
    else if (how === "print") printTable(table);
    else void exportPdf(table);
  };

  const shown = useMemo(() => {
    const rows = preview?.rows ?? [];
    if (filter === "attention") return rows.filter((row) => row.status === "error" || row.status === "warning");
    if (filter === "ready") return rows.filter((row) => row.status === "ready");
    if (filter === "duplicate") return rows.filter((row) => row.status === "duplicate");
    return rows;
  }, [preview, filter]);

  const columns: DataTableColumn<PreviewRow>[] = [
    { id: "row", header: "Row", value: (row) => row.rowNumber, cell: (row) => <span className="tabular-nums text-muted-foreground">{row.rowNumber}</span> },
    { id: "student", header: "Student", value: (row) => row.name, cell: (row) => <span className="font-semibold text-foreground">{row.name}</span> },
    { id: "class", header: "Class", value: (row) => row.className ?? "", cell: (row) => row.className ?? <span className="text-muted-foreground">None</span> },
    {
      id: "dob",
      header: "Date of birth",
      value: (row) => row.row?.dateOfBirth ?? "",
      cell: (row) => (row.row ? displayDate(row.row.dateOfBirth) : <span className="text-muted-foreground">—</span>),
    },
    {
      id: "status",
      header: "Status",
      value: (row) => STATUS[row.status].label,
      cell: (row) => <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS[row.status].className}`}>{STATUS[row.status].label}</span>,
    },
    {
      id: "details",
      header: "Details",
      value: (row) => [...row.errors, ...row.warnings].join(" "),
      cell: (row) =>
        row.status === "duplicate" ? (
          <span className="text-xs text-muted-foreground">Already in the school, will be skipped.</span>
        ) : (
          <ul className="max-w-md space-y-0.5 text-xs">
            {row.errors.map((message) => <li key={message} className="text-destructive">{message}</li>)}
            {row.warnings.map((message) => <li key={message} className="text-warning">{message}</li>)}
          </ul>
        ),
    },
  ];

  const failed = results.filter((result) => result.status === "failed");
  const skipped = results.filter((result) => result.status === "skipped");
  const remaining = progress.total - progress.done;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4" onMouseDown={(event) => event.target === event.currentTarget && phase !== "importing" && closeRef.current()}>
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl outline-none sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="import-title" className="text-base font-bold text-foreground">Import students</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {phase === "upload" && "Step 1 of 3: choose a spreadsheet of your existing students."}
              {phase === "review" && "Step 2 of 3: check what will be imported. Nothing has been added yet."}
              {phase === "importing" && "Step 3 of 3: adding students. Please keep this window open."}
              {phase === "done" && "Finished."}
            </p>
          </div>
          <button type="button" onClick={() => closeRef.current()} aria-label="Close" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        {phase === "upload" && (
          <div className="mt-5 space-y-5">
            <label
              onDragOver={(event: DragEvent) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event: DragEvent) => { event.preventDefault(); setDragging(false); void readFile(event.dataTransfer.files[0]); }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition ${dragging ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
            >
              {busy ? <LoaderCircle className="size-8 animate-spin text-primary" /> : <Upload className="size-8 text-primary" />}
              <span className="text-sm font-semibold text-foreground">{busy ? "Reading your file…" : "Drop a file here, or click to choose one"}</span>
              <span className="text-xs text-muted-foreground">.csv or .xlsx, up to {STUDENT_IMPORT_LIMITS.maxRows} students and {mb(STUDENT_IMPORT_LIMITS.maxFileBytes)} MB</span>
              <input type="file" accept=".csv,.xlsx" className="sr-only" aria-label="Choose a student file" disabled={busy} onChange={(event) => { void readFile(event.target.files?.[0]); event.target.value = ""; }} />
            </label>
            {error && (
              <p role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <CircleAlert className="mt-0.5 size-4 shrink-0" /> {error}
              </p>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-xl border border-border p-4">
                <h3 className="text-xs font-bold text-foreground">Start from the template</h3>
                <p className="mt-1 text-xs text-muted-foreground">The Excel template has dropdowns for gender and class, and keeps dates and phone numbers exactly as you type them.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" disabled={templateBusy} onClick={() => void template("xlsx")} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
                    {templateBusy ? <LoaderCircle className="size-3.5 animate-spin" /> : <FileSpreadsheet className="size-3.5" />} Excel template
                  </button>
                  <button type="button" onClick={() => void template("csv")} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted">
                    <Download className="size-3.5" /> CSV template
                  </button>
                </div>
              </section>
              <section className="rounded-xl border border-border p-4">
                <h3 className="text-xs font-bold text-foreground">Good to know</h3>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                  <li>Required: first name, last name, gender and date of birth.</li>
                  <li>Dates are read day first, like 25/12/2012.</li>
                  <li>Give an <strong>Admission number</strong> to keep a student&rsquo;s existing one. Leave it blank to have one made.</li>
                  <li>Classes must already exist and be spelled as they are in the system.</li>
                  <li>Students already in the school are skipped, so a file can be uploaded again safely.</li>
                </ul>
              </section>
            </div>
          </div>
        )}

        {phase === "review" && preview && (
          <div className="mt-5 space-y-4">
            <p className="text-xs text-muted-foreground">{preview.file.name} · {preview.file.rows} row{preview.file.rows === 1 ? "" : "s"}</p>
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="Will be imported" value={preview.summary.importable} tone="emerald" />
              <Stat label="Need a look (still imported)" value={preview.summary.warning} tone="amber" />
              <Stat label="Already in the school" value={preview.summary.duplicate} tone="slate" />
              <Stat label="Problems (not imported)" value={preview.summary.error} tone="rose" />
            </div>
            {preview.notices.map((notice) => (
              <p key={notice} className="flex items-start gap-2 rounded-xl bg-warning/10 px-4 py-2.5 text-xs text-warning">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {notice}
              </p>
            ))}
            <details className="rounded-xl border border-border px-4 py-2.5 text-xs">
              <summary className="cursor-pointer font-semibold text-foreground">{preview.columns.recognized.length} columns recognised{preview.columns.ignored.length ? `, ${preview.columns.ignored.length} ignored` : ""}</summary>
              <p className="mt-2 text-muted-foreground">Used: {preview.columns.recognized.map((column) => column.header).join(", ")}.</p>
              {preview.columns.ignored.length > 0 && <p className="mt-1 text-muted-foreground">Ignored (not part of the template): {preview.columns.ignored.join(", ")}.</p>}
            </details>

            <div role="group" aria-label="Show rows" className="flex flex-wrap gap-2">
              {([
                ["all", `All (${preview.summary.total})`],
                ["attention", `Need attention (${preview.summary.error + preview.summary.warning})`],
                ["ready", `Ready (${preview.summary.ready})`],
                ["duplicate", `Already added (${preview.summary.duplicate})`],
              ] as [Filter, string][]).map(([id, label]) => (
                <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filter === id ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70"}`}>
                  {label}
                </button>
              ))}
            </div>
            <DataTable rows={shown} columns={columns} getRowId={(row) => String(row.rowNumber)} pageSize={10} searchPlaceholder="Search the file…" emptyTitle="No rows here" emptyDescription="Nothing matches this filter." />

            <label className="flex items-start gap-2.5 rounded-xl border border-border p-3 text-xs">
              <input type="checkbox" checked={createGuardianLogins} onChange={(event) => setCreateGuardianLogins(event.target.checked)} className="mt-0.5 size-4 accent-primary" />
              <span>
                <span className="font-semibold text-foreground">Also create parent-portal logins</span>
                <span className="block text-muted-foreground">Creates a sign-in for every linked guardian. If no contact email is provided, SchoolHub generates a non-deliverable login email; save the credentials report and share the login details securely with the guardian.</span>
              </span>
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={startOver} className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-xs font-semibold text-foreground hover:bg-muted">Choose a different file</button>
                {preview.summary.error > 0 && (
                  <button type="button" onClick={() => void exportXlsx(problemsTable(preview.rows))} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-4 text-xs font-semibold text-foreground hover:bg-muted">
                    <FileSpreadsheet className="size-3.5" /> Download problem report (Excel)
                  </button>
                )}
              </div>
              <button type="button" disabled={preview.summary.importable === 0} onClick={startImport} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
                Import {preview.summary.importable} student{preview.summary.importable === 1 ? "" : "s"}
              </button>
            </div>
            {preview.summary.error > 0 && (
              <p className="text-[11px] text-muted-foreground">{preview.summary.error} row{preview.summary.error === 1 ? " has a problem and won't" : "s have problems and won't"} be imported. You can import the rest now, fix those in your file and upload it again. Students already added are skipped.</p>
            )}
          </div>
        )}

        {phase === "importing" && (
          <div className="mt-8 space-y-4 py-4">
            <div className="flex items-center justify-between text-sm">
              <p className="font-semibold text-foreground" role="status">
                {paused ? "Paused" : stopped ? "Stopping…" : "Adding students…"} {progress.done} of {progress.total}
              </p>
              <p className="text-xs text-muted-foreground">{Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%</p>
            </div>
            <div role="progressbar" aria-label="Import progress" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done} className="h-3 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} />
            </div>
            {paused ? (
              <div role="alert" className="space-y-3 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                <p className="flex items-start gap-2"><CircleAlert className="mt-0.5 size-4 shrink-0" /> The import was interrupted: {paused}</p>
                <p className="text-xs">Nothing is lost. Students added so far are saved, and retrying carries on from where it stopped.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void runBatches()} className="inline-flex h-9 items-center rounded-lg bg-destructive px-4 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90">Retry</button>
                  <button type="button" onClick={() => { setPaused(null); setPhase("done"); }} className="inline-flex h-9 items-center rounded-lg border border-destructive/30 px-4 text-xs font-semibold">Stop here</button>
                </div>
              </div>
            ) : (
              <button type="button" disabled={stopped} onClick={() => { stopRequested.current = true; setStopped(true); }} className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50">
                Stop after this batch
              </button>
            )}
          </div>
        )}

        {phase === "done" && (
          <div className="mt-5 space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Students added" value={created.length} tone="emerald" />
              <Stat label="Skipped (already there)" value={skipped.length} tone="slate" />
              <Stat label="Could not be added" value={failed.length + (stopped || paused ? remaining : 0)} tone="rose" />
            </div>
            {remaining > 0 && <p className="rounded-xl bg-warning/10 px-4 py-2.5 text-xs text-warning">The import stopped early. {remaining} student{remaining === 1 ? " was" : "s were"} not processed. Upload the same file again to add them, and those already added will be skipped.</p>}

            {created.length > 0 && (
              <section className={`rounded-xl border-2 p-4 ${credentialsSaved ? "border-success/20 bg-success/10" : "border-warning/30 bg-warning/10"}`}>
                <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
                  {credentialsSaved ? <CircleCheck className="size-4 text-success" /> : <TriangleAlert className="size-4 text-warning" />}
                  Save the login details now
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Each student signs in with their username and a temporary password, and must change it the first time. For safety these are shown only on this screen and can&rsquo;t be looked up again once you close it.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => saveLogins("excel")} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90"><FileSpreadsheet className="size-3.5" /> Excel</button>
                  <button type="button" onClick={() => saveLogins("pdf")} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted"><FileText className="size-3.5" /> PDF</button>
                  <button type="button" onClick={() => saveLogins("print")} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted"><Printer className="size-3.5" /> Print</button>
                </div>
              </section>
            )}

            {failed.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-bold text-foreground">These students could not be added</h3>
                <ul className="divide-y divide-border rounded-xl border border-border text-xs">
                  {failed.map((result) => (
                    <li key={result.rowNumber} className="flex flex-wrap items-baseline gap-x-3 px-3 py-2">
                      <span className="font-semibold text-foreground">{result.name}</span>
                      <span className="text-muted-foreground">row {result.rowNumber}</span>
                      <span className="text-destructive">{result.message}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => downloadFailedRows(failed.flatMap((result) => { const row = sourceRows.current.get(result.rowNumber); return row ? [{ row, message: result.message ?? "" }] : []; }))}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted"
                >
                  <Download className="size-3.5" /> Download these to fix and re-upload
                </button>
              </section>
            )}

            <div className="flex justify-end">
              <button type="button" onClick={() => closeRef.current()} className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-xs font-bold text-primary-foreground hover:opacity-90">Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "emerald" | "amber" | "slate" | "rose" }) {
  const tones = {
    emerald: "border-success/20 bg-success/10 text-success",
    amber: "border-warning/20 bg-warning/10 text-warning",
    slate: "border-border bg-muted text-foreground",
    rose: "border-destructive/20 bg-destructive/10 text-destructive",
  };
  return (
    <div className={`rounded-xl border px-4 py-3 ${tones[tone]}`}>
      <p className="text-2xl font-black tabular-nums">{value}</p>
      <p className="text-[11px] font-medium">{label}</p>
    </div>
  );
}
