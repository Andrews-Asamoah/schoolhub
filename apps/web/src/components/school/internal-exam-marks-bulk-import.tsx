import type { ImportTemplate } from "@/components/bulk-import/import-templates";
import { SpreadsheetImportDialog, type ImportPreviewRow, type ImportResultRow } from "@/components/bulk-import/spreadsheet-import-dialog";
import { apiFetch } from "@/lib/api";

export interface MockMarksImportSheet {
  paperId: string;
  paperName: string;
  sessionName: string;
  sectionId?: string;
  sectionName?: string;
  maxMarks: number;
  candidates: { id: string; name: string; admissionNumber: string | null;
    marks: number | null; status: "MARKED" | "ABSENT" | null; version: number }[];
}
interface PreviewRow extends ImportPreviewRow {
  detail: string;
  row: { candidateId: string; marks: number | null; status: "MARKED" | "ABSENT"; expectedVersion: number } | null;
}
interface Result extends ImportResultRow { status: "created" | "updated" | "failed" }
const marksHeader = (max: number) => `Marks (out of ${max})`;
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function buildMockMarksTemplate(sheet: MockMarksImportSheet): ImportTemplate {
  const identity = ["Candidate ID", "Admission No", "Pupil name"];
  const mark = marksHeader(sheet.maxMarks);
  return {
    fileBase: slug(`${sheet.sessionName} ${sheet.paperName} ${sheet.sectionName ?? ""} marks`),
    title: `${sheet.sessionName} · ${sheet.paperName}${sheet.sectionName ? ` · ${sheet.sectionName}` : ""}`,
    sheetName: "Marks",
    headers: [...identity, mark, "Absent"],
    rows: sheet.candidates.map((candidate) => [candidate.id, candidate.admissionNumber ?? "", candidate.name,
      candidate.marks ?? "", candidate.status === "ABSENT" ? "YES" : "NO"]),
    instructions: [
      ["Candidates", "The mock's frozen register is already listed. Keep Candidate ID and admission numbers unchanged."],
      ["Target", `Use only for this ${sheet.sectionName ? "teaching-area section" : "subject paper"}: ${sheet.sessionName} · ${sheet.paperName}${sheet.sectionName ? ` · ${sheet.sectionName}` : ""}.`],
      ["Marks", `Enter a mark from 0 to ${sheet.maxMarks}, with at most two decimal places. Zero is a real mark.`],
      ["Absent", "Set Absent to YES and leave Marks empty to record an absence. Set NO and enter a mark to restore a pupil previously marked absent."],
      ["Empty cells", "An empty Marks cell with Absent blank or NO makes no change. It never clears a saved mark or absence."],
      ["Review", "The preview shows new marks, updates and errors. Nothing is saved until you confirm. Locked papers and unassigned sections cannot be uploaded."],
    ],
    identityColumns: identity,
    textColumns: ["Candidate ID", "Admission No"],
    numberColumns: { [mark]: { min: 0, max: sheet.maxMarks } },
    listColumns: { Absent: ["YES", "NO"] },
  };
}

export function InternalExamMarksBulkImport({ sheet, onClose, onComplete }: {
  sheet: MockMarksImportSheet; onClose: () => void; onComplete: () => void;
}) {
  const query = new URLSearchParams({ paperId: sheet.paperId });
  if (sheet.sectionId) query.set("sectionId", sheet.sectionId);
  return <SpreadsheetImportDialog<PreviewRow, Result>
    title="Bulk upload mock marks"
    description={`${sheet.sessionName} · ${sheet.paperName}${sheet.sectionName ? ` · ${sheet.sectionName}` : ""}. Download the template, complete it, then upload it for review.`}
    template={buildMockMarksTemplate(sheet)}
    templateText="The template lists this mock's candidates and saved marks. Use YES in Absent with an empty mark to record an absence."
    notes={[
      "Use the template for this paper or teaching-area section and keep the candidate identifiers.",
      `Marks must be between 0 and ${sheet.maxMarks}, with at most two decimal places.`,
      "Empty marks with Absent blank or NO are skipped. Zero is a mark; it is never treated as absent.",
      "Review every change, including any change to a pupil's absence status, before saving.",
      "Uploads use the same teacher permissions, locks and conflict checks as typed marks. If another teacher changes a mark after preview, that batch is refused.",
    ]}
    validateUrl={`/internal-exams/marks/import/preview?${query}`}
    importableStatuses={["ready", "update"]}
    successStatuses={["created", "updated"]}
    summaryCards={(summary) => [
      { label: "New records", value: summary.ready ?? 0 }, { label: "Updates", value: summary.update ?? 0 },
      { label: "No change", value: (summary.unchanged ?? 0) + (summary.duplicate ?? 0) }, { label: "Errors", value: summary.error ?? 0 },
    ]}
    readyDetail={(row) => row.detail}
    importLabel={(preview) => `Save ${(preview.summary.ready ?? 0) + (preview.summary.update ?? 0)} candidate records`}
    resultSummary={(results) => `${results.filter((row) => row.status !== "failed").length} saved · ${results.filter((row) => row.status === "failed").length} not saved.`}
    interruptedMessage="The upload stopped. Preview the file again; previously saved records will show as unchanged."
    submitBatch={async (rows) => (await apiFetch<{ results: Result[] }>("/internal-exams/marks/import", {
      method: "POST", body: JSON.stringify({ paperId: sheet.paperId, ...(sheet.sectionId ? { sectionId: sheet.sectionId } : {}),
        rows: rows.map((row) => ({ rowNumber: row.rowNumber, name: row.name, row: row.row })) }),
    })).results}
    onClose={onClose} onComplete={onComplete}
  />;
}
