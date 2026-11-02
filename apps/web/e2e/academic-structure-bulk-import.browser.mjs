import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ExcelJS from "exceljs";

const entry = process.env.PLAYWRIGHT_PACKAGE_ENTRY;
if (!entry) throw new Error("Set PLAYWRIGHT_PACKAGE_ENTRY to the Playwright CLI path.");
const { chromium } = await import(
  pathToFileURL(resolve(dirname(entry), "index.mjs")).href
);
const browser = await chromium.launch({ headless: true });
const base = process.env.SCHOOLHUB_WEB_URL ?? "http://127.0.0.1:5173";
const now = new Date().toISOString();
const organization = { id: "org", name: "Test school", slug: "test-school", createdAt: now };
const school = {
  id: "school",
  organizationId: "org",
  name: "Test school",
  code: "TEST",
  subdomain: "test-school",
  currency: "GHS",
};
const session = {
  user: {
    id: "academic-structure-e2e",
    name: "Test Administrator",
    email: "admin@example.test",
    role: "user",
    mustChangePassword: false,
    twoFactorEnabled: true,
    createdAt: now,
    updatedAt: now,
  },
  session: {
    id: "academic-structure-session",
    token: "academic-structure-token",
    userId: "academic-structure-e2e",
    activeOrganizationId: "org",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    createdAt: now,
    updatedAt: now,
  },
};

const kinds = [
  { route: "classes", kind: "departments", sheet: "Departments", headers: ["name", "code", "description"], name: "Science", button: "Bulk import" },
  { route: "classes", kind: "classes", sheet: "Classes", headers: ["name", "level", "departmentCode", "capacity", "isGraduatingClass", "isActive", "order"], name: "JHS 1A", button: "Bulk import classes" },
  { route: "houses", kind: "houses", sheet: "Houses", headers: ["name", "code", "description", "color", "motto", "houseTeacherEmail", "isActive"], name: "Red House" },
  { route: "clubs", kind: "clubs", sheet: "Clubs", headers: ["name", "description", "teacherInChargeEmail", "isActive"], name: "Science Club" },
];

async function installMocks(page, writes) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.includes("/auth/get-session")) return route.fulfill({ json: session });
    if (path.includes("/auth/organization/list")) return route.fulfill({ json: [organization] });
    if (path.includes("/auth/organization/get-full-organization")) {
      return route.fulfill({ json: { ...organization, members: [], invitations: [] } });
    }
    if (path.endsWith("/schools/public/test-school") || path.endsWith("/schools/current")) {
      return route.fulfill({ json: school });
    }
    if (path.endsWith("/schools/academic-context")) return route.fulfill({ json: null });
    if (path.endsWith("/schools/roles")) {
      return route.fulfill({ json: { primaryRole: "admin", roles: ["admin"] } });
    }
    if (path.endsWith("/academics/departments")) {
      return route.fulfill({ json: [{ id: "department-jhs", name: "Junior High", code: "JHS", description: null, _count: { classes: 0 } }] });
    }
    if (path.endsWith("/academics/classes") || path.endsWith("/academics/teachers") || path.endsWith("/academics/houses") ||
        path.endsWith("/academics/clubs")) {
      return route.fulfill({ json: [] });
    }
    if (path.endsWith("/academics/import/preview")) {
      const kind = url.searchParams.get("kind");
      const body = request.postDataBuffer()?.toString("latin1") ?? "";
      assert.match(body, /filename="[^"]+\.xlsx"/i, "upload should be an Excel workbook");
      const spec = kinds.find((item) => item.kind === kind);
      assert(spec, `unexpected import kind ${kind}`);
      return route.fulfill({
        json: {
          file: { name: `${kind}-import-template.xlsx`, format: "xlsx", rows: 1 },
          summary: { total: 1, ready: 1, duplicate: 0, error: 0 },
          rows: [{
            rowNumber: 2,
            name: spec.name,
            status: "ready",
            errors: [],
            row: spec.kind === "classes"
              ? { name: spec.name, level: "JHS 1", departmentId: "department-jhs", capacity: 40, isGraduatingClass: false, isActive: true, order: 1 }
              : spec.kind === "departments"
                ? { name: spec.name, code: "SCI", description: "Science department" }
                : spec.kind === "houses"
                  ? { name: spec.name, code: "RED", description: "Red team", color: "#C0392B", motto: "Lead with courage", isActive: true }
                  : { name: spec.name, description: "Science projects", isActive: true },
          }],
        },
      });
    }
    if (path.endsWith("/academics/import")) {
      const body = request.postDataJSON();
      writes.push(body);
      return route.fulfill({
        json: {
          results: body.rows.map((row) => ({
            rowNumber: row.rowNumber,
            name: row.row.name,
            status: "created",
          })),
        },
      });
    }
    if (request.method() !== "GET") return route.fulfill({ json: { success: true } });
    return route.fulfill({ json: [] });
  });
}

try {
  // Match the other browser suites; POSIX runner locales are not valid Intl locales.
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: "en-GB" });
  const errors = [];
  const writes = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installMocks(page, writes);

  for (const spec of kinds) {
    await page.goto(`${base}/${spec.route}?school=test-school`);
    await page.getByRole("button", { name: spec.button ?? "Bulk import", exact: true }).click();
    await page.getByRole("dialog", { name: `Bulk import ${spec.kind}` }).waitFor();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download Excel template", exact: true }).click();
    const templateDownload = await downloadPromise;
    assert.equal(templateDownload.suggestedFilename(), `${spec.kind}-import-template.xlsx`);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await readFile(await templateDownload.path()));
    const sheet = workbook.getWorksheet(spec.sheet);
    assert(sheet, `template has a ${spec.sheet} worksheet`);
    assert.deepEqual(sheet.getRow(1).values.slice(1), spec.headers);
    const values = spec.kind === "classes"
      ? ["JHS 1A", "JHS 1", "JHS", "40", "FALSE", "TRUE", "1"]
      : spec.kind === "departments"
      ? ["Science", "SCI", "Science department"]
      : spec.kind === "houses"
        ? ["Red House", "RED", "Red team", "#C0392B", "Lead with courage", "", "TRUE"]
        : ["Science Club", "Science projects", "", "TRUE"];
    sheet.addRow(values);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    await page.locator('input[type="file"]').setInputFiles({
      name: templateDownload.suggestedFilename(),
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer,
    });
    await page.getByRole("button", { name: "Validate file", exact: true }).click();
    await page.getByText(spec.name, { exact: true }).waitFor();
    await page.getByRole("button", { name: "Create 1 records", exact: true }).click();
    await page.getByText("1 created · 0 failed.", { exact: true }).waitFor();
    assert.equal(writes.at(-1).kind, spec.kind);
    assert.equal(writes.at(-1).rows.length, 1);
    assert.equal(writes.at(-1).rows[0].row.name, spec.name);
    if (spec.kind === "classes") {
      assert.deepEqual(writes.at(-1).rows[0].row, {
        name: spec.name, level: "JHS 1", departmentId: "department-jhs",
        capacity: 40, isGraduatingClass: false, isActive: true, order: 1,
      });
    }
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "detached" });
  }

  assert.deepEqual(errors, []);
  await page.close();
  console.log("Academic structure bulk import checks passed for departments, classes, houses and clubs using Excel templates.");
} finally {
  await browser.close();
}
