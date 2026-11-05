import type { ImportTemplate } from "@/components/bulk-import/import-templates";
import {
  SpreadsheetImportDialog,
  type ImportPreviewRow,
  type ImportResultRow,
} from "@/components/bulk-import/spreadsheet-import-dialog";
import { apiFetch } from "@/lib/api";

type Kind = "teacher" | "staff";
interface StaffPreviewRow extends ImportPreviewRow {
  status: "ready" | "duplicate" | "error";
}
interface StaffResult extends ImportResultRow {
  status: "created" | "failed";
  credentials?: { loginEmail: string; temporaryPassword: string } | null;
}

const employmentTypes = ["FULL_TIME", "PART_TIME", "CONTRACT", "TEMPORARY", "INTERN"];
const staffTypes = ["ACCOUNTANT", "HEADTEACHER", "ADMIN", "LIBRARIAN", "DRIVER", "SECURITY", "NURSE", "COUNSELOR", "IT_SUPPORT", "RECEPTIONIST", "COOK", "CLEANER", "OTHER"];
const today = () => new Date().toISOString().slice(0, 10);

const buildTemplate = (kind: Kind): ImportTemplate => {
  const teacher = kind === "teacher";
  return {
    fileBase: kind,
    title: teacher ? "Teacher import template" : "Staff import template",
    sheetName: teacher ? "Teachers" : "Staff",
    headers: teacher
      ? ["firstName", "lastName", "email", "phone", "gender", "dateOfBirth", "department", "qualification", "specialization", "experience", "employmentType", "hireDate"]
      : ["firstName", "lastName", "email", "phone", "gender", "dateOfBirth", "staffType", "jobTitle", "department", "staffId", "employmentType", "hireDate"],
    example: teacher
      ? ["Ama", "Mensah", "ama@example.com", "0240000000", "FEMALE", "1995-04-12", "Mathematics", "B.Ed", "Mathematics", 4, "FULL_TIME", today()]
      : ["Kojo", "Owusu", "kojo@example.com", "0240000000", "MALE", "1990-03-08", "LIBRARIAN", "Librarian", "Library", "STF-001", "FULL_TIME", today()],
    instructions: [
      ["Required fields", teacher
        ? "firstName, lastName, email, phone, gender, dateOfBirth, department, hireDate, employmentType"
        : "firstName, lastName, email, phone, gender, dateOfBirth, staffType, hireDate, employmentType"],
      ["Dates", "Use YYYY-MM-DD. Phone numbers and IDs are stored as text."],
      ["Duplicates", "Existing email addresses and staff identifiers are flagged before import."],
      ["Gender", "MALE, FEMALE, OTHER"],
      ["Employment type", employmentTypes.join(", ")],
      ...(teacher ? [] : [["Staff type", staffTypes.join(", ")] as const]),
    ],
    textColumns: ["phone", "dateOfBirth", "hireDate", "staffId"],
    listColumns: {
      gender: ["MALE", "FEMALE", "OTHER"],
      employmentType: employmentTypes,
      ...(teacher ? {} : { staffType: staffTypes }),
    },
  };
};

export function StaffBulkImport({ kind, onClose, onComplete }: { kind: Kind; onClose: () => void; onComplete: () => void }) {
  const title = kind === "teacher" ? "teachers" : "non-teaching staff";
  return (
    <SpreadsheetImportDialog<StaffPreviewRow, StaffResult>
      title={`Bulk upload ${title}`}
      description="Drop a CSV or Excel file, review every row, then create accounts."
      template={buildTemplate(kind)}
      templateText="The Excel template has dropdowns for gender, employment type and staff type, and keeps dates and phone numbers exactly as you type them."
      notes={[
        kind === "teacher"
          ? "Required: first name, last name, email, phone, gender, date of birth, department, hire date and employment type."
          : "Required: first name, last name, email, phone, gender, date of birth, staff type, hire date and employment type.",
        "Dates use YYYY-MM-DD. Gender: MALE, FEMALE or OTHER.",
        "Employment type: FULL_TIME, PART_TIME, CONTRACT, TEMPORARY or INTERN.",
        "Existing email addresses and staff identifiers are flagged before import.",
        "Temporary passwords are shown once after the import, so save them then.",
      ]}
      validateUrl={`/people/import/preview?kind=${kind}`}
      summaryCards={(summary) => [
        { label: "Ready", value: summary.ready ?? 0 },
        { label: "Duplicates", value: summary.duplicate ?? 0 },
        { label: "Errors", value: summary.error ?? 0 },
      ]}
      readyDetail={() => "Ready to create"}
      importLabel={(preview) => `Create ${preview.summary.ready ?? 0} records`}
      successStatuses={["created"]}
      interruptedMessage="Import stopped. Upload the same file again; existing accounts will be flagged as duplicates."
      resultSummary={(results) =>
        `${results.filter((r) => r.status === "created").length} created · ${results.filter((r) => r.status === "failed").length} failed.`}
      resultNotice="Save any newly issued credentials now; passwords are only shown in this response."
      resultColumns={[
        { header: "Login", cell: (result) => result.credentials?.loginEmail ?? "" },
        { header: "Temporary password", cell: (result) => result.credentials?.temporaryPassword ?? "" },
      ]}
      submitBatch={async (rows) => {
        const response = await apiFetch<{ results: StaffResult[] }>("/people/import", {
          method: "POST",
          body: JSON.stringify({
            kind,
            batchId: crypto.randomUUID(),
            rows: rows.map((row) => ({ rowNumber: row.rowNumber, row: row.row })),
          }),
        });
        return response.results;
      }}
      onComplete={onComplete}
      onClose={onClose}
    />
  );
}
