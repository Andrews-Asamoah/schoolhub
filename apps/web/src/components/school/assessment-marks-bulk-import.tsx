import {
  MARKS_IMPORT_IDENTITY_HEADERS,
  marksImportColumns,
  type MarksImportComponent,
} from "@schoolhub/shared";
import { useMemo, useState } from "react";
import type { ImportTemplate } from "@/components/bulk-import/import-templates";
import {
  SpreadsheetImportDialog,
  type ImportPreviewRow,
  type ImportResultRow,
} from "@/components/bulk-import/spreadsheet-import-dialog";
import { apiFetch } from "@/lib/api";

type MarkEntry = { componentId: string; occurrenceIndex: number; marks: number; expectedMarks: number | null };
type MarksRow = { studentId: string; entries: MarkEntry[] };

interface MarksPreviewRow extends ImportPreviewRow {
  status: "ready" | "update" | "unchanged" | "duplicate" | "error";
  /** What the server will do for this pupil, for example "Class Test 1: 14 → 17". */
  detail: string;
  row: MarksRow | null;
}
interface MarksResult extends ImportResultRow {
  status: "created" | "updated" | "skipped" | "failed";
}

export interface MarksImportSheet {
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  templateId: string;
  templateName: string;
  termId: string;
  termName: string;
  /** Only the components this person may enter marks for. */
  components: (MarksImportComponent & { id: string })[];
  students: {
    studentId: string;
    admissionNumber: string | null;
    name: string;
    marks: { componentId: string; occurrenceIndex: number; marks: number }[];
  }[];
}

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/**
 * The template is built from the class list the teacher is looking at: every
 * pupil is already on a row, and every mark they can receive has its own column,
 * so nothing has to be typed except the marks. Marks already saved are filled in,
 * which lets a corrected sheet be uploaded again.
 */
export function buildMarksTemplate(sheet: MarksImportSheet): ImportTemplate {
  const columns = marksImportColumns(sheet.components);
  const saved = new Map<string, number>();
  for (const student of sheet.students) {
    for (const mark of student.marks) saved.set(`${student.studentId}|${mark.componentId}|${mark.occurrenceIndex}`, mark.marks);
  }
  const identity = [MARKS_IMPORT_IDENTITY_HEADERS.admissionNumber, MARKS_IMPORT_IDENTITY_HEADERS.name];
  return {
    fileBase: slug(`marks ${sheet.className} ${sheet.subjectName} ${sheet.templateName}`),
    title: `Marks upload: ${sheet.subjectName}, ${sheet.className}, ${sheet.templateName} (${sheet.termName})`,
    sheetName: "Marks",
    headers: [...identity, ...columns.map((column) => column.header)],
    rows: sheet.students.map((student) => [
      student.admissionNumber ?? "",
      student.name,
      ...columns.map((column) => saved.get(`${student.studentId}|${column.componentId}|${column.occurrenceIndex}`) ?? ""),
    ]),
    instructions: [
      ["Pupils", "Every pupil on the class list is already here. Do not add, remove or rename pupils; each row is matched by its Admission No."],
      ...columns.map((column): readonly [string, string] => [column.label, `A mark from 0 to ${column.maxMarks}, with at most 2 decimal places.`]),
      ["Empty cells", "An empty cell is skipped. It never clears a mark that is already saved and it is not counted as zero."],
      ["Absent pupils", "Leave their cells empty. Mark them as absent or excused on the marks page when you submit the sheet."],
      ["Marks already saved", "They are filled in so you can correct them and upload again. Anything that would change is shown for review before it is saved."],
      ["Review first", "Nothing is saved until you have checked the preview and confirmed."],
    ],
    textColumns: [MARKS_IMPORT_IDENTITY_HEADERS.admissionNumber],
    identityColumns: identity,
    numberColumns: Object.fromEntries(columns.map((column) => [column.header, { min: 0, max: column.maxMarks }])),
  };
}

export function AssessmentMarksBulkImport({
  sheet,
  onClose,
  onComplete,
}: {
  sheet: MarksImportSheet;
  onClose: () => void;
  onComplete: () => void;
}) {
  // "overwrite" saves every changed mark; "fill" saves only marks for cells that are still empty.
  const [mode, setMode] = useState<"overwrite" | "fill">("overwrite");
  const template = useMemo(() => buildMarksTemplate(sheet), [sheet]);
  const entriesFor = (row: MarksPreviewRow) =>
    (row.row?.entries ?? []).filter((entry) => mode === "overwrite" || entry.expectedMarks === null);
  const query = new URLSearchParams({ classId: sheet.classId, subjectId: sheet.subjectId, templateId: sheet.templateId });

  return (
    <SpreadsheetImportDialog<MarksPreviewRow, MarksResult>
      title="Bulk upload marks"
      description={`${sheet.subjectName} · ${sheet.className} · ${sheet.templateName}. Download the template with your pupils and columns, fill in the marks, then drop it here.`}
      template={template}
      templateText="The Excel template lists every pupil in this class and a column for each assessment you can enter marks for. Cells only accept a mark within range."
      notes={[
        "Use the template for this class, subject and assessment, and keep its headings and pupil rows.",
        "Pupils are matched by Admission No, or by name when they have no admission number.",
        "Marks are from 0 to each column's maximum, with at most 2 decimal places.",
        "Empty cells are skipped; they never clear or change a saved mark.",
        "Marks you can't enter, a locked or submitted sheet, or a passed deadline are refused here just as they are on the marks page.",
      ]}
      validateUrl={`/assessments/entry/import/preview?${query.toString()}`}
      importableStatuses={["ready", "update"]}
      summaryCards={(summary) => [
        { label: "New marks", value: summary.ready ?? 0 },
        { label: "Changing marks", value: summary.update ?? 0 },
        { label: "No change", value: (summary.unchanged ?? 0) + (summary.duplicate ?? 0) },
        { label: "Errors", value: summary.error ?? 0 },
      ]}
      readyDetail={(row) => row.detail}
      importLabel={(preview) => {
        const rows = preview.rows.filter((row) => row.status === "ready" || row.status === "update");
        const marks = rows.reduce((sum, row) => sum + entriesFor(row).length, 0);
        const pupils = rows.filter((row) => entriesFor(row).length > 0).length;
        return `Save ${plural(marks, "mark")} for ${plural(pupils, "pupil")}`;
      }}
      resultSummary={(results) =>
        `${results.filter((r) => r.status === "created" || r.status === "updated").length} pupils saved · ${results.filter((r) => r.status === "skipped").length} kept as they were · ${results.filter((r) => r.status === "failed").length} not saved.`}
      interruptedMessage="The upload stopped. Choose the file again; marks that were already saved will show as unchanged."
      reviewExtras={(preview) =>
        (preview.summary.update ?? 0) > 0 ? (
          <fieldset className="space-y-2 rounded-lg border border-border p-3">
            <legend className="px-1 text-xs font-semibold">Some pupils already have a different mark. What should happen to those marks?</legend>
            {([
              ["overwrite", "Replace them with the file", "Every changed mark in the file is saved. The Details column shows each old and new mark."],
              ["fill", "Keep them, only fill empty cells", "Marks that are already saved are left alone."],
            ] as const).map(([value, label, hint]) => (
              <label key={value} className="flex cursor-pointer items-start gap-2 text-xs">
                <input
                  type="radio"
                  name="marks-import-mode"
                  checked={mode === value}
                  onChange={() => setMode(value)}
                  className="mt-0.5 accent-primary"
                />
                <span>
                  <span className="font-semibold">{label}</span>
                  <span className="block text-muted-foreground">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}
      submitBatch={async (rows) => {
        const withEntries = rows.map((row) => ({ row, entries: entriesFor(row) }));
        const kept: MarksResult[] = withEntries
          .filter(({ entries }) => entries.length === 0)
          .map(({ row }) => ({ rowNumber: row.rowNumber, name: row.name, status: "skipped", message: "Existing marks were kept." }));
        const toSend = withEntries.filter(({ entries }) => entries.length > 0);
        if (toSend.length === 0) return kept;
        const response = await apiFetch<{ results: MarksResult[] }>("/assessments/entry/import", {
          method: "POST",
          body: JSON.stringify({
            classId: sheet.classId,
            subjectId: sheet.subjectId,
            templateId: sheet.templateId,
            termId: sheet.termId,
            rows: toSend.map(({ row, entries }) => ({
              rowNumber: row.rowNumber,
              name: row.name,
              row: { studentId: row.row!.studentId, entries },
            })),
          }),
        });
        return [...response.results, ...kept].sort((a, b) => a.rowNumber - b.rowNumber);
      }}
      onComplete={onComplete}
      onClose={onClose}
    />
  );
}
