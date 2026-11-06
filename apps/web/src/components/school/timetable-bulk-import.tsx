import { TIMETABLE_DAYS } from "@schoolhub/shared";
import { useState } from "react";
import type { ImportTemplate } from "@/components/bulk-import/import-templates";
import {
  SpreadsheetImportDialog,
  type ImportPreviewRow,
  type ImportResultRow,
} from "@/components/bulk-import/spreadsheet-import-dialog";
import { apiFetch } from "@/lib/api";

interface TimetablePreviewRow extends ImportPreviewRow {
  status: "ready" | "update" | "duplicate" | "error";
  existingId?: string;
}
interface TimetableResult extends ImportResultRow {
  status: "created" | "updated" | "failed";
}

const ENTRY_TYPES = ["LESSON", "BREAK", "ACTIVITY"];

export interface TimetableImportLists {
  classes: string[];
  periods: string[];
  subjects: string[];
  teachers: string[];
  rooms: string[];
}

const buildTemplate = (lists: TimetableImportLists): ImportTemplate => ({
  fileBase: "timetable",
  title: "Timetable import template",
  sheetName: "Timetable",
  headers: ["class", "day", "period", "type", "subject", "strand", "teacher", "room", "label"],
  example: ["JHS 1A", "MONDAY", "Period 1", "LESSON", "SCI", "", "ama@example.com", "Science Lab", ""],
  instructions: [
    ["One row per slot", "Each row fills one period for one class on one day. A class can have only one row per day and period."],
    ["Required", "class, day and period. A lesson also needs a subject; a break or activity needs a label."],
    ["Class", "The class name exactly as it appears in SchoolHub, for example JHS 1A."],
    ["Day", "MONDAY to SUNDAY. Short forms such as Mon or Tues also work."],
    ["Period", "A period name from the class's department (for example Period 1), or its start time as text (for example 08:00). Set periods up under Periods first."],
    ["Type", "LESSON, BREAK or ACTIVITY. Leave blank for a lesson."],
    ["Subject", "The subject code or name. If the subject has teaching areas, give the one taught in the strand column."],
    ["Teacher", "Optional. Choose from the dropdown, or type the teacher's email address or full name. If blank, the teacher assigned to the class for that subject is used."],
    ["Room", "Optional. A room name that already exists under Rooms. Ignored for breaks."],
    ["Label", "Required for a break or activity, for example Lunch. Optional for a lesson."],
    ["Clashes", "A teacher or room cannot be in two places in the same period. Rows that clash are flagged before anything is imported."],
  ],
  textColumns: ["class", "period"],
  listColumns: { day: TIMETABLE_DAYS, type: ENTRY_TYPES },
  rangeColumns: {
    class: lists.classes,
    period: lists.periods,
    subject: lists.subjects,
    teacher: lists.teachers,
    room: lists.rooms,
  },
});

export function TimetableBulkImport({
  academicYearId,
  academicYearName,
  lists,
  onClose,
  onComplete,
}: {
  academicYearId: string;
  academicYearName: string;
  /** Current classes, periods, subjects, teachers and rooms, offered as dropdowns in the Excel template. */
  lists: TimetableImportLists;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [replace, setReplace] = useState(false);

  return (
    <SpreadsheetImportDialog<TimetablePreviewRow, TimetableResult>
      title="Bulk upload timetable"
      description={`Drop a CSV or Excel file, review every slot, then add the lessons to the ${academicYearName} timetable.`}
      template={buildTemplate(lists)}
      templateText="The Excel template has dropdowns for day, type and your current classes, periods, subjects, teachers and rooms, and keeps period names and start times exactly as you type them."
      notes={[
        "Required: class, day and period. Lessons also need a subject; breaks and activities need a label.",
        "Periods must already exist for the class's department. Use the period name or its start time.",
        "Teachers can be left blank when the class's subject already has a teacher assigned.",
        "Teacher and room clashes, and slots that already have a lesson, are flagged before anything is imported.",
      ]}
      validateUrl={`/timetable/import/preview?academicYearId=${encodeURIComponent(academicYearId)}`}
      importableStatuses={replace ? ["ready", "update"] : ["ready"]}
      summaryCards={(summary) => [
        { label: "New", value: summary.ready ?? 0 },
        { label: "Already scheduled", value: summary.update ?? 0 },
        { label: "Duplicates", value: summary.duplicate ?? 0 },
        { label: "Errors", value: summary.error ?? 0 },
      ]}
      readyDetail={(row) =>
        row.status === "update"
          ? replace ? "This period already has a lesson — it will be replaced" : "This period already has a lesson — it will be kept"
          : "Ready to add"
      }
      importLabel={(preview) => {
        const added = preview.summary.ready ?? 0;
        const replaced = replace ? preview.summary.update ?? 0 : 0;
        return replaced > 0 ? `Add ${added} · replace ${replaced}` : `Add ${added} ${added === 1 ? "slot" : "slots"}`;
      }}
      resultSummary={(results) =>
        `${results.filter((r) => r.status === "created").length} added · ${results.filter((r) => r.status === "updated").length} replaced · ${results.filter((r) => r.status === "failed").length} failed.`}
      interruptedMessage="The import stopped. Choose the file again; slots that were already added will show as already scheduled."
      reviewExtras={(preview) =>
        (preview.summary.update ?? 0) > 0 ? (
          <fieldset className="space-y-2 rounded-lg border border-border p-3">
            <legend className="px-1 text-xs font-semibold">What should happen to periods that already have a lesson?</legend>
            {([
              [false, "Keep the existing lessons", "Rows for periods that are already filled are skipped."],
              [true, "Replace them with the file", "The lesson in the file takes the place of the one already scheduled."],
            ] as const).map(([value, label, hint]) => (
              <label key={label} className="flex cursor-pointer items-start gap-2 text-xs">
                <input
                  type="radio"
                  name="timetable-replace-mode"
                  checked={replace === value}
                  onChange={() => setReplace(value)}
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
        const response = await apiFetch<{ results: TimetableResult[] }>("/timetable/import", {
          method: "POST",
          body: JSON.stringify({
            academicYearId,
            rows: rows.map((row) => ({
              rowNumber: row.rowNumber,
              name: row.name,
              row: row.row,
              ...(row.existingId ? { existingId: row.existingId } : {}),
            })),
          }),
        });
        return response.results;
      }}
      onComplete={onComplete}
      onClose={onClose}
    />
  );
}
