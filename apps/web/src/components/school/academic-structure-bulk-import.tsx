import { useState } from "react";
import type { ImportTemplate } from "@/components/bulk-import/import-templates";
import {
  SpreadsheetImportDialog,
  type ImportPreviewRow,
  type ImportResultRow,
} from "@/components/bulk-import/spreadsheet-import-dialog";
import { apiFetch } from "@/lib/api";

export type AcademicStructureKind = "departments" | "houses" | "clubs" | "classes" | "subjects";

interface StructurePreviewRow extends ImportPreviewRow {
  status: "ready" | "update" | "duplicate" | "error";
  existingId?: string;
  matchCode?: string;
}
interface StructureResult extends ImportResultRow {
  status: "created" | "updated" | "failed";
}

const definitions: Record<AcademicStructureKind, {
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
    description: "Existing houses are matched by name or code. Optional houseTeacherEmail must match an active teacher's invitation email.",
  },
  clubs: {
    title: "clubs",
    sheet: "Clubs",
    headers: ["name", "description", "teacherInChargeEmail", "isActive"],
    example: ["Science Club", "Explore science through projects", "", "TRUE"],
    required: "name",
    description: "Club names must be unique. Optional teacherInChargeEmail must match an active teacher's invitation email.",
  },
  classes: {
    title: "classes",
    sheet: "Classes",
    headers: ["name", "level", "departmentCode", "capacity", "isGraduatingClass", "isActive", "order"],
    example: ["JHS 1A", "JHS 1", "JHS", "40", "FALSE", "TRUE", "1"],
    required: "name, level, departmentCode",
    description: "Class names must be unique. departmentCode must match a department in this school. Capacity and order must be positive/whole numbers when provided; class flags accept TRUE or FALSE.",
  },
  subjects: {
    title: "subjects",
    sheet: "Subjects",
    headers: ["name", "code", "description", "periodsPerWeek", "isActive"],
    example: ["Integrated Science", "SCI", "Science for junior high", "4", "TRUE"],
    required: "name, code",
    description: "Subject codes must be unique, 2–20 letters, numbers, - or _. periodsPerWeek is a whole number from 1 to 20; blank uses 4. Classes and teachers are assigned from the Subjects page after the import.",
  },
};

const buildTemplate = (kind: AcademicStructureKind): ImportTemplate => {
  const definition = definitions[kind];
  return {
    fileBase: kind,
    title: `${definition.title[0]!.toUpperCase()}${definition.title.slice(1)} import template`,
    sheetName: definition.sheet,
    headers: definition.headers,
    example: definition.example,
    instructions: [
      ["Required columns", definition.required],
      ["Validation", definition.description],
      ["Optional status", "isActive and isGraduatingClass accept TRUE or FALSE; blank uses the school default."],
    ],
  };
};

export function AcademicStructureBulkImport({
  kind,
  onClose,
  onComplete,
}: {
  kind: AcademicStructureKind;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [houseUpdateMode, setHouseUpdateMode] = useState<"merge" | "replace">("merge");
  const { title, description, required } = definitions[kind];
  const houses = kind === "houses";

  return (
    <SpreadsheetImportDialog<StructurePreviewRow, StructureResult>
      title={`Bulk upload ${title}`}
      description="Drop a CSV or Excel file, review the rows, then import the valid records."
      template={buildTemplate(kind)}
      notes={[
        `Required: ${required}.`,
        description,
        "Records that already exist are flagged before anything is imported, so a file can be uploaded again safely.",
      ]}
      validateUrl={`/academics/import/preview?kind=${kind}`}
      importableStatuses={["ready", "update"]}
      summaryCards={(summary) => [
        { label: houses ? "New" : "Ready", value: summary.ready ?? 0 },
        ...(houses ? [{ label: "Updates", value: summary.update ?? 0 }] : []),
        { label: "Duplicates", value: summary.duplicate ?? 0 },
        { label: "Errors", value: summary.error ?? 0 },
      ]}
      readyDetail={(row) => (row.status === "update" ? "Matches an existing house" : "Ready to create")}
      importLabel={(preview) => {
        const ready = preview.summary.ready ?? 0;
        const updates = preview.summary.update ?? 0;
        return houses
          ? `Import ${ready} new · ${houseUpdateMode === "replace" ? "replace" : "update"} ${updates} existing`
          : `Create ${ready} ${ready === 1 ? title.replace(/s$/, "") : title}`;
      }}
      resultSummary={(results) =>
        `${results.filter((r) => r.status === "created").length} created · ${results.filter((r) => r.status === "updated").length} updated · ${results.filter((r) => r.status === "failed").length} failed.`}
      submitBatch={async (rows) => {
        const response = await apiFetch<{ results: StructureResult[] }>("/academics/import", {
          method: "POST",
          body: JSON.stringify({
            kind,
            houseUpdateMode,
            rows: rows.map((row) => ({
              rowNumber: row.rowNumber,
              row: row.row,
              ...(row.existingId ? { existingId: row.existingId, matchCode: row.matchCode } : {}),
            })),
          }),
        });
        return response.results;
      }}
      reviewExtras={(preview) =>
        houses && (preview.summary.update ?? 0) > 0 ? (
          <fieldset className="space-y-2 rounded-lg border border-border p-3">
            <legend className="px-1 text-xs font-semibold">How should matching houses be updated?</legend>
            {([
              ["merge", "Update changed fields", "Blank optional cells stay unchanged."],
              ["replace", "Replace all fields", "Blank description, color, motto, or teacher cells clear those values."],
            ] as const).map(([value, label, hint]) => (
              <label key={value} className="flex cursor-pointer items-start gap-2 text-xs">
                <input
                  type="radio"
                  name="house-update-mode"
                  value={value}
                  checked={houseUpdateMode === value}
                  onChange={() => setHouseUpdateMode(value)}
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
      onComplete={onComplete}
      onClose={onClose}
    />
  );
}
