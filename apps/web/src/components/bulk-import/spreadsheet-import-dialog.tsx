import { STUDENT_IMPORT_LIMITS } from "@schoolhub/shared";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { BulkImportDialog } from "@/components/bulk-import/bulk-import-dialog";
import { FileDropzone } from "@/components/bulk-import/file-dropzone";
import { ImportStartPanels } from "@/components/bulk-import/import-start-panels";
import {
  downloadCsvTemplate,
  downloadExcelTemplate,
  type ImportTemplate,
} from "@/components/bulk-import/import-templates";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface ImportPreviewRow {
  rowNumber: number;
  name: string;
  status: string;
  errors: string[];
  row: Record<string, unknown> | null;
}
export interface ImportPreview<Row extends ImportPreviewRow> {
  notices?: string[];
  file: { name: string; format: string; rows: number };
  summary: Record<string, number>;
  rows: Row[];
}
export interface ImportResultRow {
  rowNumber: number;
  name: string;
  status: string;
  message?: string;
}
export interface ResultColumn<Result> {
  header: string;
  cell: (result: Result) => ReactNode;
}

interface SpreadsheetImportDialogProps<Row extends ImportPreviewRow, Result extends ImportResultRow> {
  title: string;
  description: string;
  template: ImportTemplate;
  /** One-line explanation on the template card. */
  templateText?: ReactNode;
  /** The rules shown under "Good to know" on the first step. */
  notes: ReactNode[];
  /** Endpoint that validates the uploaded file and returns a row-by-row preview. */
  validateUrl: string;
  /** Summary tiles above the preview table. */
  summaryCards: (summary: Record<string, number>) => { label: string; value: number }[];
  /** Preview statuses that will be sent to the server. Defaults to ["ready"]. */
  importableStatuses?: readonly string[];
  /** Text for the Details column of a row that has no errors. */
  readyDetail?: (row: Row) => string;
  /** Sends one batch of rows and returns a result for each. */
  submitBatch: (rows: Row[]) => Promise<Result[]>;
  /** Label of the confirm button. */
  importLabel: (preview: ImportPreview<Row>) => string;
  /** Result statuses that count as a success. */
  successStatuses?: readonly string[];
  resultColumns?: ResultColumn<Result>[];
  resultSummary?: (results: Result[]) => string;
  /** Warning shown above the results, e.g. about one-time passwords. */
  resultNotice?: string;
  /** Extra controls between the summary and the table (for example update options). */
  reviewExtras?: (preview: ImportPreview<Row>) => ReactNode;
  interruptedMessage?: string;
  onComplete: () => void;
  onClose: () => void;
}

const BADGE: Record<string, string> = {
  ready: "bg-success/10 text-success",
  update: "bg-primary/10 text-primary",
  duplicate: "bg-muted text-muted-foreground",
  error: "bg-destructive/10 text-destructive",
};
const LIMITS = STUDENT_IMPORT_LIMITS;
const cell = "p-2 align-top";

/**
 * The shared validate → review → import flow for spreadsheet uploads. A file is
 * dropped or chosen, checked by the server, previewed row by row, then sent in
 * small batches. Each feature supplies only its template, its endpoints and how
 * a batch is submitted.
 */
export function SpreadsheetImportDialog<Row extends ImportPreviewRow, Result extends ImportResultRow>({
  title,
  description,
  template,
  templateText = "Download the template, fill it in, then drop it above. Keep the column headings unchanged.",
  notes,
  validateUrl,
  summaryCards,
  importableStatuses = ["ready"],
  readyDetail = () => "Ready to import",
  submitBatch,
  importLabel,
  successStatuses = ["created", "updated"],
  resultColumns = [],
  resultSummary,
  resultNotice,
  reviewExtras,
  interruptedMessage = "The import stopped. Choose the file again to check which records were already added.",
  onComplete,
  onClose,
}: SpreadsheetImportDialogProps<Row, Result>) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview<Row> | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState("");
  const [templateBusy, setTemplateBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useRef(0);

  const reset = (message: string | null = null) => {
    setPreview(null);
    setResults(null);
    setError(message);
  };

  const validate = async (file: File) => {
    const current = ++run.current;
    setFileName(file.name);
    reset();
    setChecking(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const data = await apiFetch<ImportPreview<Row>>(validateUrl, { method: "POST", body: form });
      if (current === run.current) setPreview(data);
    } catch (failure) {
      if (current === run.current) {
        setFileName(null);
        setError(failure instanceof Error ? failure.message : "This file could not be checked.");
      }
    } finally {
      if (current === run.current) setChecking(false);
    }
  };

  const downloadExcel = async () => {
    setTemplateBusy(true);
    setError(null);
    try {
      await downloadExcelTemplate(template);
    } catch (failure) {
      setError(failure instanceof Error ? `The Excel template could not be created: ${failure.message}` : "The Excel template could not be created.");
    } finally {
      setTemplateBusy(false);
    }
  };

  const importable = preview?.rows.filter(
    (row): row is Row & { row: Record<string, unknown> } => importableStatuses.includes(row.status) && row.row !== null,
  ) ?? [];

  const runImport = async () => {
    if (!importable.length || importing) return;
    setImporting(true);
    setError(null);
    const collected: Result[] = [];
    try {
      for (let index = 0; index < importable.length; index += LIMITS.batchSize) {
        const batch = importable.slice(index, index + LIMITS.batchSize);
        setProgress(`Importing ${Math.min(index + batch.length, importable.length)} of ${importable.length}…`);
        collected.push(...(await submitBatch(batch)));
        setResults([...collected]);
      }
    } catch (failure) {
      setResults([...collected]);
      setError(failure instanceof Error ? failure.message : interruptedMessage);
    } finally {
      setImporting(false);
      setProgress("");
      if (collected.some((result) => successStatuses.includes(result.status))) onComplete();
    }
  };

  const succeeded = results?.filter((result) => successStatuses.includes(result.status)).length ?? 0;
  const failed = results ? results.length - succeeded : 0;

  const footer = results ? (
    <Button type="button" size="sm" disabled={importing} onClick={onClose}>
      {importing ? progress || "Importing…" : "Done"}
    </Button>
  ) : (
    <>
      <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
      {preview && (
        <Button type="button" size="sm" disabled={importing || importable.length === 0} onClick={() => void runImport()}>
          {importing && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
          {importing ? progress || "Importing…" : importLabel(preview)}
        </Button>
      )}
    </>
  );

  return (
    <BulkImportDialog title={title} description={description} busy={importing} onClose={onClose} footer={footer}>
      <div className="space-y-4">
        {!results && (
          <>
            <FileDropzone
              extensions={[".csv", ".xlsx"]}
              maxBytes={LIMITS.maxFileBytes}
              busy={checking}
              disabled={importing}
              selection={fileName ?? undefined}
              prompt="Drop a .csv or .xlsx file here, or click to choose"
              hint={`Maximum 2 MB; up to ${LIMITS.maxRows.toLocaleString()} rows. Old .xls files must be saved as .xlsx first.`}
              ariaLabel={`Choose a file of ${title.toLowerCase()}`}
              onFiles={([file]) => void validate(file!)}
              onReject={(message) => reset(message)}
            />
          </>
        )}

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> {error}
          </p>
        )}

        {!results && !preview && (
          <ImportStartPanels
            templateText={templateText}
            templateBusy={templateBusy}
            onExcel={() => void downloadExcel()}
            onCsv={() => downloadCsvTemplate(template)}
            notes={notes}
          />
        )}

        {!results && preview && (
          <div className="space-y-3 rounded-xl border border-border p-4">
            <p className="text-xs text-muted-foreground">
              {preview.file.name} · {preview.file.rows} row{preview.file.rows === 1 ? "" : "s"}
            </p>
            {preview.notices?.map((notice) => (
              <p key={notice} className="rounded-lg bg-muted p-2 text-xs text-muted-foreground">{notice}</p>
            ))}
            <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
              {summaryCards(preview.summary).map(({ label, value }) => (
                <div key={label} className="rounded-lg bg-muted p-3">
                  <div className="text-xl font-bold">{value}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
            {reviewExtras?.(preview)}
            <div className="max-h-64 overflow-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-muted">
                  <tr><th className={cell}>Row</th><th className={cell}>Name</th><th className={cell}>Status</th><th className={cell}>Details</th></tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.rowNumber} className="border-t border-border">
                      <td className={cell}>{row.rowNumber}</td>
                      <td className={cell}>{row.name}</td>
                      <td className={cell}>
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize", BADGE[row.status] ?? BADGE.duplicate)}>{row.status}</span>
                      </td>
                      <td className={cell}>{row.errors.join(" ") || readyDetail(row as Row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {results && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Import results</h3>
            <p role="status" className="text-sm text-muted-foreground">
              {importing ? progress : resultSummary ? resultSummary(results) : `${succeeded} imported · ${failed} failed.`}
            </p>
            {resultNotice && <p className="rounded-lg bg-warning/10 p-2 text-xs text-warning">{resultNotice}</p>}
            <div className="max-h-72 overflow-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className={cell}>Name</th><th className={cell}>Status</th>
                    {resultColumns.map((column) => <th key={column.header} className={cell}>{column.header}</th>)}
                    <th className={cell}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result) => (
                    <tr key={result.rowNumber} className="border-t border-border">
                      <td className={cell}>{result.name}</td>
                      <td className={cell}>{result.status}</td>
                      {resultColumns.map((column) => <td key={column.header} className={cell}>{column.cell(result)}</td>)}
                      <td className={cell}>{result.message ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </BulkImportDialog>
  );
}
