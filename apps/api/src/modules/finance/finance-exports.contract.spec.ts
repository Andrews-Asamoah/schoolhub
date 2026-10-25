import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const webSrc = join(here, "../../../../web/src");
const exportFiles = [
  "lib/table-export.ts",
  "lib/csv.ts",
  "components/ui/data-table.tsx",
  "components/school/workspace-ui.tsx",
  "components/portal/accountant-portal-workspace.tsx",
  "components/portal/accountant-finance-reporting-workspace.tsx",
  "components/portal/expense-management-workspace.tsx",
  "components/portal/inventory-management-workspace.tsx",
  "components/portal/payroll-management-workspace.tsx",
  "routes/admin/audit/index.tsx",
  "lib/student-import.ts",
  "components/school/student-import-wizard.tsx",
];

const readWeb = (path: string) => readFileSync(join(webSrc, path), "utf8").replace(/\r\n/g, "\n");

describe("Phase 1 browser export contract", () => {
  it("does not leave shared or portal CSV export helpers or menu options", () => {
    for (const path of exportFiles) {
      const source = readWeb(path);
      expect(source, path).not.toMatch(/\bexportCsv\b|\btoCsv\b|\bdownloadCsv\s*\(/i);
      expect(source, path).not.toMatch(/Export CSV|Download CSV/i);
    }
  });

  it("does not create text/csv blobs in export code", () => {
    for (const path of exportFiles.filter((entry) => entry !== "lib/student-import.ts")) {
      expect(readWeb(path), path).not.toMatch(/text\/csv/i);
    }
  });

  it("keeps CSV limited to the import input and downloadable template", () => {
    const importer = readWeb("lib/student-import.ts");
    const wizard = readWeb("components/school/student-import-wizard.tsx");
    expect(importer).toContain("downloadCsvTemplate");
    expect(importer).toContain('type: "text/csv;charset=utf-8"');
    expect(wizard).toContain('accept=".csv,.xlsx"');
    expect(wizard).not.toMatch(/\bexportCsv\b|\btoCsv\b|\bdownloadCsv\s*\(/i);
    expect(wizard).not.toMatch(/Download CSV|Export CSV/i);
  });

  it("declares the confidential payroll export role tier", () => {
    const policy = readWeb("lib/table-export-policy.ts");
    expect(policy).toContain('PAYROLL_EXPORT_ROLES = ["accountant", "owner", "headteacher"]');
    expect(policy).toContain("canExportPayrollTables");
  });
});
