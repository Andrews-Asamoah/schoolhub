import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const entry = process.env.PLAYWRIGHT_PACKAGE_ENTRY;
if (!entry) throw new Error("Set PLAYWRIGHT_PACKAGE_ENTRY to the Playwright CLI path.");
const { chromium } = await import(
  pathToFileURL(resolve(dirname(entry), "index.mjs")).href
);
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
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



try {
  for (const sectionMode of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: "en-GB" });
    const errors = [], imports = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    let uploaded = false, conflict = true;
    const sectionId = sectionMode ? "section" : undefined;
    const maximum = sectionMode ? 30 : 200;
    const before = sectionMode ? 20 : 140, after = sectionMode ? 25 : 180;
    const sections = sectionMode ? [
      { id: "section", subjectStrandId: "practical", name: "Practical", code: "PR", maxMarks: 30, weightPercent: 50, canEdit: true },
      { id: "other", subjectStrandId: "theory", name: "Theory", code: "TH", maxMarks: 70, weightPercent: 50, canEdit: false },
    ] : [];
    const sheet = () => ({
      paper: { id: "paper", name: "Science", code: "SCI", maxMarks: sectionMode ? 100 : 200, finalizedAt: null, sections },
      session: { id: "mock", name: "Mock 1", status: "OPEN" }, canEdit: true,
      grading: { name: "School mock scale", source: "SCHOOL_DEFAULT" },
      candidates: [
        { id: "c1", name: "Ama Akua Mensah", admissionNumber: "0042", marks: sectionMode ? uploaded ? 91.67 : 83.33 : uploaded ? after : before,
          status: "MARKED", version: uploaded ? 5 : 4, percentage: uploaded ? sectionMode ? 91.67 : 90 : sectionMode ? 83.33 : 70,
          grade: uploaded ? "1" : "2", remark: uploaded ? "Custom highest" : "Custom higher",
          sectionMarks: sectionMode ? [{ sectionId: "section", marks: uploaded ? after : before, status: "MARKED", version: uploaded ? 5 : 4 },
            { sectionId: "other", marks: 70, status: "MARKED", version: 1 }] : [] },
        { id: "c2", name: "Esi Boateng", admissionNumber: null, marks: null, status: uploaded ? "ABSENT" : null,
          version: uploaded ? 1 : 0, percentage: null, grade: null, remark: null,
          sectionMarks: sectionMode && uploaded ? [{ sectionId: "section", marks: null, status: "ABSENT", version: 1 }, { sectionId: "other", marks: 70, status: "MARKED", version: 1 }] : [] },
      ],
    });
    await page.route("**/api/**", async (route) => {
      const req = route.request(), url = new URL(req.url()), path = url.pathname;
      const json = (value) => route.fulfill({ json: value });
      if (path.includes("/auth/get-session")) return json(session);
      if (path.includes("/auth/organization/list")) return json([organization]);
      if (path.includes("/auth/organization/get-full-organization")) return json({ ...organization, members: [], invitations: [] });
      if (path.includes("/schools/public/") || path.endsWith("/schools/current")) return json(school);
      if (path.endsWith("/schools/academic-context")) return json(null);
      if (path.endsWith("/schools/roles")) return json({ primaryRole: "teacher", roles: ["teacher"] });
      if (path.endsWith("/internal-exams")) return json([{ id: "mock", name: "Mock 1", mockNumber: 1, status: "OPEN", class: { id: "class", name: "JHS 3A", level: "JHS3" },
        academicYear: { name: "2026/27" }, term: { name: "Term 1" }, _count: { candidates: 2 },
        papers: [{ id: "paper", subjectId: "science", nameSnapshot: "Science", codeSnapshot: "SCI", maxMarks: sectionMode ? 100 : 200, finalizedAt: null }] }]);
      if (path.endsWith("/internal-exams/papers/paper")) return json(sheet());
      if (path.endsWith("/internal-exams/marks/import/preview")) {
        assert.equal(url.searchParams.get("paperId"), "paper");
        assert.equal(url.searchParams.get("sectionId"), sectionId ?? null);
        return json({ file: { name: "marks.csv", format: "csv", rows: 2 }, summary: { total: 2, ready: 1, update: 1, unchanged: 0, duplicate: 0, error: 0 },
          rows: [
            { rowNumber: 2, name: "Ama Akua Mensah", status: "update", detail: `${before} → ${after}`, errors: [], row: { candidateId: "c1", status: "MARKED", marks: after, expectedVersion: 4 } },
            { rowNumber: 3, name: "Esi Boateng", status: "ready", detail: "Unmarked → Absent", errors: [], row: { candidateId: "c2", status: "ABSENT", marks: null, expectedVersion: 0 } },
          ] });
      }
      if (path.endsWith("/internal-exams/marks/import")) {
        const body = req.postDataJSON(); imports.push(body);
        assert.equal(body.paperId, "paper"); assert.equal(body.sectionId, sectionId);
        const results = body.rows.map((row) => ({ rowNumber: row.rowNumber, name: row.name,
          status: conflict ? "failed" : row.row.expectedVersion === 0 ? "created" : "updated",
          message: conflict ? "Nothing in this batch was saved. Marks changed after preview." : "Saved." }));
        if (!conflict) uploaded = true;
        return json({ results });
      }
      return json([]);
    });
    await page.goto(`${base}/internal-exams?school=test-school`);
    const ama = page.getByRole("row").filter({ hasText: "Ama Akua Mensah" });
    await ama.getByRole("cell", { name: "Custom higher", exact: true }).waitFor();
    await page.getByRole("columnheader", { name: "Total (%)", exact: true }).waitFor().catch(async (error) => {
      throw new Error(`Table headers: ${JSON.stringify(await page.locator("thead").allTextContents())}; column headers: ${JSON.stringify(await page.getByRole("columnheader").allTextContents())}`, { cause: error });
    });
    assert.equal(await page.getByRole("columnheader", { name: "Percentage", exact: true }).count(), 0);
    const bulk = page.getByRole("button", { name: "Bulk upload", exact: true });
    const input = page.getByRole("spinbutton", { name: "Marks for Ama Akua Mensah", exact: true });
    await input.fill("1"); assert(await bulk.isDisabled());
    await page.getByRole("button", { name: "Discard draft", exact: true }).click();
    assert(await bulk.isEnabled());
    if (sectionMode) {
      await page.getByRole("combobox", { name: "Teaching area section", exact: true }).click();
      await page.getByRole("option", { name: /Theory/ }).click();
      assert.equal(await bulk.count(), 0, "unassigned section has no upload action");
      await page.getByRole("combobox", { name: "Teaching area section", exact: true }).click();
      await page.getByRole("option", { name: /Practical/ }).click();
    }
    await bulk.click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Excel template", exact: true }).click();
    const download = await downloadPromise;
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await readFile(await download.path()));
    const data = workbook.getWorksheet("Marks");
    assert.equal(data.getRow(2).getCell(1).value, "c1");
    assert.equal(data.getRow(2).getCell(2).value, "0042");
    assert.equal(data.getRow(2).getCell(4).value, before);
    assert.deepEqual(data.getRow(3).getCell(4).dataValidation.formulae, [0, maximum]);
    data.getRow(2).getCell(4).value = after;
    data.getRow(3).getCell(5).value = "YES";
    const file = sectionMode
      ? { name: "marks.csv", mimeType: "text/csv", buffer: Buffer.from(`Candidate ID,Admission No,Pupil name,Marks (out of ${maximum}),Absent\nc1,0042,Ama Akua Mensah,${after},NO\nc2,,Esi Boateng,,YES`) }
      : { name: "marks.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(await workbook.xlsx.writeBuffer()) };
    await page.locator('input[type="file"]').setInputFiles(file);
    await page.getByText("Unmarked → Absent", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Save 2 candidate records", exact: true }).click();
    await page.getByText("0 saved · 2 not saved.", { exact: true }).waitFor();
    assert.equal(uploaded, false);
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await ama.getByRole("cell", { name: "Custom higher", exact: true }).waitFor();
    conflict = false;
    await bulk.click(); await page.locator('input[type="file"]').setInputFiles(file);
    await page.getByRole("button", { name: "Save 2 candidate records", exact: true }).click();
    await page.getByText("2 saved · 0 not saved.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await ama.getByRole("cell", { name: "Custom highest", exact: true }).waitFor();
    assert(await page.getByRole("checkbox", { name: "Absent: Esi Boateng", exact: true }).isChecked());
    assert.deepEqual(imports.at(-1).rows.map((row) => row.row), [
      { candidateId: "c1", status: "MARKED", marks: after, expectedVersion: 4 },
      { candidateId: "c2", status: "ABSENT", marks: null, expectedVersion: 0 },
    ]);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Internal mock import browser checks passed: configured remarks, whole-paper and section templates, Excel/CSV uploads, absence, version conflicts, draft protection and section permissions.");
} finally { await browser.close(); }
