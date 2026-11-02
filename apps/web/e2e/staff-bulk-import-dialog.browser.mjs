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
    id: "staff-import-e2e",
    name: "Test Owner",
    email: "owner@example.test",
    role: "user",
    mustChangePassword: false,
    twoFactorEnabled: true,
    createdAt: now,
    updatedAt: now,
  },
  session: {
    id: "staff-import-session",
    token: "staff-import-token",
    userId: "staff-import-e2e",
    activeOrganizationId: "org",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    createdAt: now,
    updatedAt: now,
  },
};

async function installMocks(page) {
  const uploadedFiles = [];
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
      return route.fulfill({ json: { primaryRole: "owner", roles: ["owner"] } });
    }
    if (path.endsWith("/people/teachers") || path.endsWith("/people/staff")) {
      return route.fulfill({ json: { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } } });
    }
    if (path.endsWith("/people/import/preview")) {
      const body = request.postDataBuffer()?.toString("latin1") ?? "";
      const filename = /filename="([^"]+)"/.exec(body)?.[1];
      uploadedFiles.push({ kind: url.searchParams.get("kind"), filename });
      return route.fulfill({
        json: {
          file: { name: filename, format: "xlsx", rows: 1 },
          summary: { total: 1, ready: 1, duplicate: 0, error: 0 },
          rows: [{
            rowNumber: 2,
            name: "Test User",
            status: "ready",
            errors: [],
            row: { firstName: "Test", lastName: "User" },
          }],
        },
      });
    }
    if (route.request().method() !== "GET") return route.fulfill({ json: { success: true } });
    return route.fulfill({ json: [] });
  });
  return uploadedFiles;
}

try {
  // Match the other browser suites; POSIX runner locales are not valid Intl locales.
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: "en-GB" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const uploadedFiles = await installMocks(page);

  for (const kind of ["teachers", "staff"]) {
    await page.goto(`${base}/${kind}?school=test-school`);
    await page.getByRole("button", { name: "Bulk upload", exact: true }).waitFor();
    await page.getByRole("button", { name: "Bulk upload", exact: true }).click();
    await page.getByRole("dialog", { name: `Bulk upload ${kind === "teachers" ? "teachers" : "non-teaching staff"}` }).waitFor();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download Excel template", exact: true }).click();
    const templateDownload = await downloadPromise;
    assert.equal(templateDownload.suggestedFilename(), `${kind === "teachers" ? "teacher" : "staff"}-import-template.xlsx`);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await readFile(await templateDownload.path()));
    const dataSheet = workbook.getWorksheet(kind === "teachers" ? "Teachers" : "Staff");
    assert(dataSheet, "template includes the correct import worksheet");
    const headerRow = dataSheet.getRow(1).values.slice(1);
    assert.equal(headerRow[0], "firstName");
    assert.equal(headerRow[1], "lastName");
    dataSheet.addRow(kind === "teachers"
      ? ["Test", "User", "test@example.test", "0240000000", "FEMALE", "1995-04-12", "Mathematics", "B.Ed", "Mathematics", 4, "TCH-001", "FULL_TIME", "2026-01-05"]
      : ["Test", "User", "test@example.test", "0240000000", "FEMALE", "1995-04-12", "LIBRARIAN", "Librarian", "Library", "STF-001", "", "FULL_TIME", "2026-01-05"]);
    const completedWorkbook = await workbook.xlsx.writeBuffer();
    await page.locator('input[type="file"]').setInputFiles({
      name: templateDownload.suggestedFilename(),
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(completedWorkbook),
    });
    await page.getByRole("button", { name: "Validate file", exact: true }).click();
    await page.getByText("Test User", { exact: true }).waitFor();
    assert.deepEqual(uploadedFiles.at(-1), {
      kind: kind === "teachers" ? "teacher" : "staff",
      filename: templateDownload.suggestedFilename(),
    });

    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached" });

    await page.getByRole("button", { name: "Bulk upload", exact: true }).click();
    await page.getByRole("button", { name: "Close bulk upload", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "detached" });
  }

  assert.deepEqual(errors, []);
  await page.close();
  console.log("Staff bulk import checks passed: Excel template download, XLSX upload, Escape, and close button for teachers and staff.");
} finally {
  await browser.close();
}
