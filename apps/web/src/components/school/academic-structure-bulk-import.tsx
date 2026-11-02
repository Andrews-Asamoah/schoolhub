import { useEffect, useRef, useState } from "react";
import { STUDENT_IMPORT_LIMITS } from "@schoolhub/shared";
import { Download, FileSpreadsheet, FileUp, LoaderCircle, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { download } from "@/lib/table-export";

type Kind = "departments" | "houses" | "clubs";
type PreviewRow = {
  rowNumber: number;
  name: string;
  status: "ready" | "duplicate" | "error";
  errors: string[];
  row: Record<string, unknown> | null;
};
type Preview = {
  file: { name: string; format: "csv" | "xlsx"; rows: number };
  summary: { total: number; ready: number; duplicate: number; error: number };
  rows: PreviewRow[];
};
type ImportResult = {
  rowNumber: number;
  name: string;
  status: "created" | "failed";
  message?: string;
};

const definitions: Record<Kind, {
  title: string;
  sheet: string;
  headers: string[];
  example: string[];
  required: string;
  description: string;
}> = {
  departments: {
    title: "departments",
    sheet: "Departments",
    headers: ["name", "code", "description"],
    example: ["Science", "SCI", "Science and laboratory studies"],
    required: "name, code",
    description: "Departments need a unique name and code. Use 2–20 letters, numbers or hyphens for the code.",
  },
  houses: {
    title: "houses",
    sheet: "Houses",
    headers: ["name", "code", "description", "color", "motto", "houseTeacherEmail", "isActive"],
    example: ["Red House", "RED", "The red house", "#C0392B", "Lead with courage", "", "TRUE"],
    required: "name, code",
    description: "House names and codes must be unique. Optional houseTeacherEmail must match an active teacher's invitation email.",
  },
  clubs: {
    title: "clubs",
    sheet: "Clubs",
    headers: ["name", "description", "teacherInChargeEmail", "isActive"],
    example: ["Science Club", "Explore science through projects", "", "TRUE"],
    required: "name",
    description: "Club names must be unique. Optional teacherInChargeEmail must match an active teacher's invitation email.",
  },
};

function csvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function AcademicStructureBulkImport({
  kind,
  onClose,
  onComplete,
}: {
  kind: Kind;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const panel = useRef<HTMLElement>(null);
  const title = definitions[kind].title;
  const closeRef = useRef<() => void>(() => undefined);
  closeRef.current = () => {
    if (loading && !window.confirm("An import operation is still running and cannot be cancelled. Close this window and let it finish in the background?")) return;
    onClose();
  };

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);

  const downloadCsv = () => {
    const { headers, example } = definitions[kind];
    const csv = [headers, example].map((row) => row.map(csvCell).join(",")).join("\r\n");
    download(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }), `${kind}-import-template.csv`);
  };

  const downloadExcel = async () => {
    setTemplateBusy(true);
    setError(null);
    try {
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "SchoolHub";
      workbook.created = new Date();
      const definition = definitions[kind];

      const instructions = workbook.addWorksheet("Instructions");
      instructions.columns = [{ width: 28 }, { width: 100 }];
      instructions.addRow([`${title[0]!.toUpperCase()}${title.slice(1)} import template`]).font = { bold: true, size: 15 };
      instructions.addRow(["Complete the data sheet, then upload it from the matching school workspace."]);
      instructions.addRow(["Do not rename the worksheet or change the column headings."]);
      instructions.addRow(["Required columns", definition.required]);
      instructions.addRow(["Validation", definition.description]);
      instructions.addRow(["Optional status", "isActive accepts TRUE or FALSE; blank defaults to active."]);

      const sheet = workbook.addWorksheet(definition.sheet, { views: [{ state: "frozen", ySplit: 1 }] });
      sheet.addRow(definition.headers);
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: definition.headers.length } };
      definition.headers.forEach((header, index) => {
        sheet.getColumn(index + 1).width = Math.max(18, header.length + 5);
      });
      const example = workbook.addWorksheet("Example");
      example.addRow(definition.headers).font = { bold: true };
      example.addRow(definition.example);
      example.columns = definition.headers.map((header) => ({ width: Math.max(18, header.length + 5) }));

      const buffer = await workbook.xlsx.writeBuffer();
      download(new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }), `${kind}-import-template.xlsx`);
    } catch (failure) {
      setError(failure instanceof Error ? `Excel template could not be created: ${failure.message}` : "Excel template could not be created.");
    } finally {
      setTemplateBusy(false);
    }
  };

  const inspect = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const data = await apiFetch<Preview>(`/academics/import/preview?kind=${kind}`, { method: "POST", body: form });
      setPreview(data);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The file could not be validated.");
    } finally {
      setLoading(false);
    }
  };

  const runImport = async () => {
    if (!preview) return;
    const ready = preview.rows.filter((row): row is PreviewRow & { row: Record<string, unknown> } =>
      row.status === "ready" && row.row !== null,
    );
    if (!ready.length) return;
    setLoading(true);
    setError(null);
    const all: ImportResult[] = [];
    try {
      for (let index = 0; index < ready.length; index += 25) {
        const batch = ready.slice(index, index + 25);
        setProgress(`Creating ${Math.min(index + batch.length, ready.length)} of ${ready.length}…`);
        const response = await apiFetch<{ results: ImportResult[] }>("/academics/import", {
          method: "POST",
          body: JSON.stringify({
            kind,
            rows: batch.map((row) => ({ rowNumber: row.rowNumber, row: row.row })),
          }),
        });
        all.push(...response.results);
        setResults([...all]);
      }
      onComplete();
    } catch (failure) {
      setError(failure instanceof Error
        ? failure.message
        : "Import stopped. Validate the file again to check for records already created.");
    } finally {
      setLoading(false);
      setProgress("");
    }
  };

  const createdCount = results?.filter((result) => result.status === "created").length ?? 0;
  const failedCount = results?.filter((result) => result.status === "failed").length ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      onMouseDown={(event) => event.target === event.currentTarget && closeRef.current()}
    >
      <section
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="academic-import-title"
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-border bg-card p-5 text-foreground shadow-xl outline-none sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="academic-import-title" className="text-lg font-bold">Bulk import {title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Upload CSV or Excel, review the rows, then create the valid records.</p>
          </div>
          <button type="button" onClick={() => closeRef.current()} aria-label="Close bulk import" className="rounded-lg p-2 hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        {!results && (
          <div className="mt-5 space-y-4">
            <p className="text-xs text-muted-foreground">{definitions[kind].description}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={templateBusy} onClick={() => void downloadExcel()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60">
                {templateBusy ? <LoaderCircle className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
                Download Excel template
              </button>
              <button type="button" onClick={downloadCsv} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted">
                <Download className="size-4" /> CSV template
              </button>
            </div>
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 p-7 text-center">
              <FileUp className="size-7 text-primary" />
              <span className="text-sm font-semibold">{file?.name ?? "Choose a .csv or .xlsx file"}</span>
              <span className="text-xs text-muted-foreground">Maximum 2 MB; up to {STUDENT_IMPORT_LIMITS.maxRows.toLocaleString()} rows</span>
              <input
                type="file"
                accept=".csv,.xlsx"
                className="sr-only"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setPreview(null);
                  setResults(null);
                  setError(null);
                }}
              />
            </label>
            <div className="flex justify-end">
              <button type="button" disabled={!file || loading} onClick={() => void inspect()} className="rounded-lg bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-50">
                {loading ? "Checking…" : "Validate file"}
              </button>
            </div>
            {preview && (
              <div className="space-y-3 rounded-xl border border-border p-4">
                <p className="text-xs text-muted-foreground">{preview.file.name} · {preview.file.rows} row{preview.file.rows === 1 ? "" : "s"}</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    ["Ready", preview.summary.ready],
                    ["Duplicates", preview.summary.duplicate],
                    ["Errors", preview.summary.error],
                  ].map(([label, count]) => (
                    <div key={String(label)} className="rounded-lg bg-muted p-3">
                      <div className="text-xl font-bold">{count}</div>
                      <div className="text-xs text-muted-foreground">{label}</div>
                    </div>
                  ))}
                </div>
                <div className="max-h-64 overflow-auto rounded-lg border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-muted">
                      <tr><th className="p-2">Row</th><th className="p-2">Name</th><th className="p-2">Status</th><th className="p-2">Details</th></tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row) => (
                        <tr key={row.rowNumber} className="border-t border-border">
                          <td className="p-2">{row.rowNumber}</td>
                          <td className="p-2">{row.name}</td>
                          <td className="p-2">{row.status}</td>
                          <td className="p-2">{row.errors.join(" ") || "Ready to create"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end">
                  <button type="button" disabled={loading || preview.summary.ready === 0} onClick={() => void runImport()} className="rounded-lg bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-50">
                    {loading ? progress || "Importing…" : `Create ${preview.summary.ready} records`}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {error && <p role="alert" className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        {results && (
          <div className="mt-5 space-y-3">
            <h3 className="font-semibold">Import results</h3>
            <p role={loading ? "status" : undefined} className="text-sm text-muted-foreground">
              {loading ? progress : `${createdCount} created · ${failedCount} failed.`}
            </p>
            <div className="max-h-72 overflow-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted"><tr><th className="p-2">Name</th><th className="p-2">Status</th><th className="p-2">Details</th></tr></thead>
                <tbody>
                  {results.map((result) => (
                    <tr key={result.rowNumber} className="border-t border-border">
                      <td className="p-2">{result.name}</td>
                      <td className="p-2">{result.status}</td>
                      <td className="p-2">{result.message ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={() => closeRef.current()} className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">Done</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
