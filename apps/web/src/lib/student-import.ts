import {
  STUDENT_IMPORT_COLUMNS,
  type NormalizedStudentRow,
  type StudentImportColumn,
  type StudentImportField,
} from "@schoolhub/shared";
import { download, exportXlsx, type ExportTable } from "@/lib/table-export";

export type RowStatus = "ready" | "warning" | "duplicate" | "error";

export interface PreviewRow {
  rowNumber: number;
  status: RowStatus;
  errors: string[];
  warnings: string[];
  row: NormalizedStudentRow | null;
  name: string;
  className: string | null;
}
export interface PreviewResponse {
  file: { name: string; format: "csv" | "xlsx"; rows: number };
  columns: { recognized: { header: string; field: StudentImportField }[]; ignored: string[] };
  summary: { total: number; ready: number; warning: number; duplicate: number; error: number; importable: number };
  notices: string[];
  rows: PreviewRow[];
}
export interface ImportRowResult {
  rowNumber: number;
  name: string;
  status: "created" | "skipped" | "failed";
  message?: string;
  studentId?: string;
  admissionNumber?: string | null;
  className?: string | null;
  username?: string;
  loginEmail?: string;
  temporaryPassword?: string;
  guardianLogins?: { name: string; loginEmail: string; temporaryPassword: string }[];
}
export interface BatchResponse {
  batchId: string;
  totals: { created: number; skipped: number; failed: number };
  results: ImportRowResult[];
}

export const chunk = <T,>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/** 2012-12-25 -> "25 Dec 2012": unambiguous, so the person can check how their dates were read. */
export function displayDate(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

const column = (key: StudentImportField): StudentImportColumn => STUDENT_IMPORT_COLUMNS.find((item) => item.key === key)!;
const headers = STUDENT_IMPORT_COLUMNS.map((item) => item.label);

// -------------------------------------------------------------- templates

const csvCell = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** A CSV with just the headings, ready to fill in. */
export function downloadCsvTemplate() {
  const text = `${headers.map(csvCell).join(",")}\r\n`;
  download(new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" }), "student-import-template.csv");
}

const TEXT_FORMAT_FIELDS: StudentImportField[] = [
  "dateOfBirth", "admissionDate", "admissionNumber", "emergencyContactPhone", "g1Phone", "g2Phone",
];

/**
 * An Excel template with: a Students sheet (date, phone and admission-number
 * columns pre-set to text so Excel can't change "25/12/2012" or drop a leading
 * zero), dropdowns for gender, class, house and relationship, an Instructions
 * sheet, and an Example sheet that is not imported.
 */
export async function downloadXlsxTemplate(classNames: string[], houseNames: string[]) {
  const mod = await import("exceljs");
  const ExcelJS = mod.default ?? (mod as unknown as typeof mod.default);
  const workbook = new ExcelJS.Workbook();

  const guide = workbook.addWorksheet("Instructions");
  guide.columns = [{ width: 34 }, { width: 12 }, { width: 80 }];
  guide.addRow(["Student import template"]).font = { bold: true, size: 14 };
  guide.addRow(["Fill in the Students sheet, then upload it. Students already in the school are skipped, so uploading the same file twice is safe."]);
  guide.addRow(["Dates are read day first (25/12/2012). Do not delete or rename the headings. The Example sheet is only for reference and is not imported."]);
  guide.addRow([]);
  const head = guide.addRow(["Column", "Required", "What to enter"]);
  head.font = { bold: true };
  for (const item of STUDENT_IMPORT_COLUMNS) guide.addRow([item.label, item.required ? "Yes" : "", item.help]);

  const sheet = workbook.addWorksheet("Students", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } };
  STUDENT_IMPORT_COLUMNS.forEach((item, index) => {
    const col = sheet.getColumn(index + 1);
    col.width = Math.max(14, item.label.length + 4);
    if (TEXT_FORMAT_FIELDS.includes(item.key)) col.numFmt = "@";
  });

  const lists = workbook.addWorksheet("Lists", { state: "veryHidden" });
  lists.getColumn(1).values = ["Class", ...classNames];
  lists.getColumn(2).values = ["House", ...houseNames];

  const dropdown = (key: StudentImportField, formulae: string[]) => {
    const index = STUDENT_IMPORT_COLUMNS.findIndex((item) => item.key === key) + 1;
    for (let row = 2; row <= 1001; row++) {
      sheet.getCell(row, index).dataValidation = { type: "list", allowBlank: true, formulae, showErrorMessage: true, errorStyle: "warning", errorTitle: column(key).label, error: "Pick a value from the list." };
    }
  };
  dropdown("gender", ['"Male,Female,Other"']);
  const relationships = '"Father,Mother,Guardian,Grandfather,Grandmother,Sibling,Relative,Other"';
  dropdown("g1Relationship", [relationships]);
  dropdown("g2Relationship", [relationships]);
  if (classNames.length) dropdown("className", [`Lists!$A$2:$A$${classNames.length + 1}`]);
  if (houseNames.length) dropdown("houseName", [`Lists!$B$2:$B$${houseNames.length + 1}`]);

  const example = workbook.addWorksheet("Example");
  example.addRow(headers).font = { bold: true };
  example.addRow(STUDENT_IMPORT_COLUMNS.map((item) => item.example));
  example.columns = STUDENT_IMPORT_COLUMNS.map((item) => ({ width: Math.max(14, item.label.length + 4) }));

  workbook.views = [{ activeTab: 1, x: 0, y: 0, width: 10000, height: 20000, firstSheet: 0, visibility: "visible" }];
  const buffer = await workbook.xlsx.writeBuffer();
  download(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "student-import-template.xlsx");
}

// ---------------------------------------------------------------- reports

/** Rows that can't be imported, with the reasons, for fixing in the original file. */
export function problemsTable(rows: PreviewRow[]): ExportTable {
  return {
    title: "Student import problems",
    headers: ["Row in file", "Student", "Class", "Problem"],
    rows: rows.filter((row) => row.status === "error").map((row) => [row.rowNumber, row.name, row.className ?? "", row.errors.join(" ")]),
  };
}

/** The login details to hand out. The passwords exist only in this browser tab. */
export function credentialsTable(results: ImportRowResult[]): ExportTable {
  return {
    title: "New student logins",
    headers: ["Student", "Admission number", "Class", "Username", "Temporary password", "Parent logins"],
    rows: results
      .filter((result) => result.status === "created")
      .map((result) => [
        result.name,
        result.admissionNumber ?? "",
        result.className ?? "",
        result.username ?? result.loginEmail ?? "",
        result.temporaryPassword ?? "",
        (result.guardianLogins ?? []).map((guardian) => `${guardian.name}: ${guardian.loginEmail} / ${guardian.temporaryPassword}`).join("; "),
      ]),
  };
}

const cellsFor = (row: NormalizedStudentRow): Record<StudentImportField, string> => {
  const [g1, g2] = row.guardians;
  const relationship = (value?: string) => (value ? value.charAt(0) + value.slice(1).toLowerCase() : "");
  return {
    firstName: row.firstName, lastName: row.lastName, otherNames: row.otherNames ?? "",
    gender: row.gender.charAt(0) + row.gender.slice(1).toLowerCase(), dateOfBirth: row.dateOfBirth,
    admissionNumber: row.admissionNumber ?? "", admissionDate: row.admissionDate ?? "", className: row.className ?? "", houseName: row.houseName ?? "",
    nationality: row.nationality ?? "", residentialAddress: row.residentialAddress ?? "", city: row.city ?? "", region: row.region ?? "",
    bloodGroup: row.bloodGroup ?? "", allergies: row.allergies ?? "", medicalConditions: row.medicalConditions ?? "",
    emergencyContactName: row.emergencyContactName ?? "", emergencyContactPhone: row.emergencyContactPhone ?? "", emergencyRelationship: row.emergencyRelationship ?? "",
    g1FirstName: g1?.firstName ?? "", g1LastName: g1?.lastName ?? "", g1Relationship: relationship(g1?.relationshipType), g1Phone: g1?.phone ?? "", g1Email: g1?.email ?? "",
    g2FirstName: g2?.firstName ?? "", g2LastName: g2?.lastName ?? "", g2Relationship: relationship(g2?.relationshipType), g2Phone: g2?.phone ?? "", g2Email: g2?.email ?? "",
  };
};

/**
 * The rows that failed, in the import template's own layout and with an extra
 * "Reason" column, so they can be corrected and uploaded again. The reason column
 * is ignored on upload because it isn't a known heading.
 */
export function downloadFailedRows(failed: { row: NormalizedStudentRow; message: string }[]) {
  void exportXlsx({
    title: "Students to fix and re-upload",
    headers: [...headers, "Reason"],
    rows: failed.map(({ row, message }) => {
      const cells = cellsFor(row);
      return [...STUDENT_IMPORT_COLUMNS.map((item) => cells[item.key]), message];
    }),
    columnTypes: [...STUDENT_IMPORT_COLUMNS.map(() => "text" as const), "text"],
  });
}
