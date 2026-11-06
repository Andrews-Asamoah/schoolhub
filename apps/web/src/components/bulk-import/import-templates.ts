import { download } from "@/lib/table-export";

export interface ImportTemplate {
  /** File name stem: "subjects" downloads subjects-import-template.xlsx. */
  fileBase: string;
  /** Heading on the Instructions sheet. */
  title: string;
  /** Name of the data sheet. */
  sheetName: string;
  headers: readonly string[];
  /** One example row, the same length and order as `headers`. Not needed when `rows` is given. */
  example?: readonly (string | number)[];
  /**
   * Rows already filled in from the school's own records (for example the class
   * list for a marks upload). When given they replace the example row in both the
   * Excel and CSV templates.
   */
  rows?: readonly (readonly (string | number)[])[];
  /** Columns that identify a record and are not meant to be edited; shaded grey in the Excel template. */
  identityColumns?: readonly string[];
  /** Columns that only accept a number in this range; Excel rejects anything else as it is typed. */
  numberColumns?: Readonly<Record<string, { min: number; max: number }>>;
  /** Label and text rows for the Instructions sheet. */
  instructions: readonly (readonly [string, string])[];
  /** Columns stored as text so phone numbers, dates and IDs keep their exact form. */
  textColumns?: readonly string[];
  /** Columns that get a dropdown in the Excel template. */
  listColumns?: Readonly<Record<string, readonly string[]>>;
  /**
   * Columns whose dropdown choices come from the school's own records (teachers,
   * classes …). They are written to a hidden "Lists" sheet and the dropdown points
   * at that range, because an inline list is limited to 255 characters.
   */
  rangeColumns?: Readonly<Record<string, readonly string[]>>;
}

const csvCell = (value: string | number) => {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const columnWidth = (header: string) => Math.max(16, header.length + 5);

const sampleRows = (template: ImportTemplate) => template.rows ?? (template.example ? [template.example] : []);

export function downloadCsvTemplate(template: ImportTemplate) {
  const csv = [template.headers, ...sampleRows(template)].map((row) => row.map(csvCell).join(",")).join("\r\n");
  download(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }), `${template.fileBase}-import-template.csv`);
}

export async function downloadExcelTemplate(template: ImportTemplate) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SchoolHub";
  workbook.created = new Date();

  const guide = workbook.addWorksheet("Instructions");
  guide.columns = [{ width: 28 }, { width: 96 }];
  guide.addRow([template.title]).font = { bold: true, size: 15 };
  guide.addRow(["Complete the data sheet, then upload this workbook from the same page you downloaded it from."]);
  guide.addRow(["Do not rename the worksheet or change the column headings."]);
  guide.addRow([]);
  for (const row of template.instructions) guide.addRow([...row]);

  const sheet = workbook.addWorksheet(template.sheetName, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.addRow([...template.headers]);
  for (const row of template.rows ?? []) sheet.addRow([...row]);
  // Validation covers only the rows that exist when the template was built from the school's records.
  const lastRow = template.rows ? Math.max(template.rows.length + 1, 2) : 1001;
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: template.headers.length } };
  template.headers.forEach((header, index) => {
    const column = sheet.getColumn(index + 1);
    column.width = columnWidth(header);
    if (template.textColumns?.includes(header)) column.numFmt = "@";
    if (template.identityColumns?.includes(header)) {
      for (let row = 2; row <= lastRow; row++) {
        sheet.getCell(row, index + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
      }
    }
    const range = template.numberColumns?.[header];
    if (range) {
      for (let row = 2; row <= lastRow; row++) {
        sheet.getCell(row, index + 1).dataValidation = {
          type: "decimal",
          operator: "between",
          allowBlank: true,
          formulae: [range.min, range.max],
          showErrorMessage: true,
          errorTitle: header,
          error: `Enter a number from ${range.min} to ${range.max}, or leave the cell empty.`,
        };
      }
    }
    const options = template.listColumns?.[header];
    if (options) {
      for (let row = 2; row <= lastRow; row++) {
        sheet.getCell(row, index + 1).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`"${options.join(",")}"`],
          showErrorMessage: true,
          errorTitle: header,
          error: "Choose a value from the list.",
        };
      }
    }
  });

  const rangeEntries = Object.entries(template.rangeColumns ?? {}).filter(
    ([header, values]) => values.length > 0 && template.headers.includes(header),
  );
  if (rangeEntries.length) {
    const lists = workbook.addWorksheet("Lists", { state: "hidden" });
    rangeEntries.forEach(([header, values], listIndex) => {
      lists.getCell(1, listIndex + 1).value = header;
      values.forEach((value, index) => { lists.getCell(index + 2, listIndex + 1).value = value; });
      lists.getColumn(listIndex + 1).width = 28;
      const letter = lists.getColumn(listIndex + 1).letter;
      const column = template.headers.indexOf(header) + 1;
      for (let row = 2; row <= lastRow; row++) {
        sheet.getCell(row, column).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`Lists!$${letter}$2:$${letter}$${values.length + 1}`],
          showErrorMessage: true,
          errorStyle: "warning",
          errorTitle: header,
          error: "This is not in the list. Keep it only if it is exactly right.",
        };
      }
    });
  }

  if (template.example) {
    const example = workbook.addWorksheet("Example");
    example.addRow([...template.headers]).font = { bold: true };
    example.addRow([...template.example]);
    example.columns = template.headers.map((header) => ({ width: columnWidth(header) }));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  download(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${template.fileBase}-import-template.xlsx`,
  );
}
