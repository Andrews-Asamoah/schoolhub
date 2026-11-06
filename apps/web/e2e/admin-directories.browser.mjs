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


const students = Array.from({ length: 105 }, (_, index) => ({
  id: `student-${index + 1}`, studentId: `ST-${index + 1}`,
  admissionNumber: `ADM-${index + 1}`, status: "ACTIVE",
  profile: { firstName: "Pupil", otherNames: "Full", lastName: `Name ${index + 1}`,
    gender: "FEMALE", dateOfBirth: "2013-01-01", phone: null },
  class: { id: "class", name: "JHS 1A", level: "JHS1" }, guardians: [],
}));
const people = Array.from({ length: 105 }, (_, index) => ({
  id: `person-${index + 1}`, teacherId: `T-${index + 1}`, staffId: `S-${index + 1}`,
  firstName: "Person", lastName: `Name ${index + 1}`, invitationEmail: null,
  profile: { firstName: "Person", lastName: `Name ${index + 1}`, phone: null,
    user: { email: `person${index + 1}@example.test` } },
  isActive: true, department: { id: "department", name: "Teaching" },
  staffType: "ADMINISTRATIVE", jobTitle: "Office staff",
}));
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: "en-GB" });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const json = (data) => route.fulfill({ json: data });
    if (path.includes("/auth/get-session")) return json(session);
    if (path.includes("/auth/organization/list")) return json([organization]);
    if (path.includes("/auth/organization/get-full-organization")) return json({ ...organization, members: [], invitations: [] });
    if (path.endsWith("/schools/public/test-school") || path.endsWith("/schools/current")) return json(school);
    if (path.endsWith("/schools/academic-context")) return json(null);
    if (path.endsWith("/schools/roles")) return json({ primaryRole: "owner", roles: ["owner"] });
    if (path.endsWith("/students/student-105/profile")) return json({
      ...students[104], username: "ADM-105", loginEmail: "pupil@example.test", admissionDate: "2026-01-01",
      department: null, house: null, previousSchool: null, previousClass: null,
      health: { bloodGroup: null, allergies: null, medicalConditions: null },
      subjects: [{ subjectId: "subject", name: "Inherited subject", code: "SUB", teacherName: null }],
    });
    if (["/api/students", "/api/people/teachers", "/api/people/staff"].includes(path)) {
      const number = Number(url.searchParams.get("page") ?? 1);
      const limit = Number(url.searchParams.get("limit") ?? 20);
      const source = path === "/api/students" ? students : people.map((person) => {
        if (path.endsWith("/staff")) { const { teacherId, ...staff } = person; return staff; }
        return person;
      });
      return json({ data: source.slice((number - 1) * limit, number * limit),
        meta: { page: number, limit, total: source.length, totalPages: Math.ceil(source.length / limit) } });
    }
    return json([]);
  });

  for (const kind of ["students", "teachers", "staff"]) {
    await page.goto(`${base}/${kind}?school=test-school`);
    const search = page.getByRole("textbox", { name: "Search table", exact: true });
    await search.waitFor();
    assert.equal(await search.count(), 1);
    assert.equal(await page.getByRole("textbox").count(), 1, `${kind}: one search field`);
    assert.equal(await page.getByText("Active on this page", { exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Next page", exact: true }).count(), 1);
    assert.equal(await page.getByRole("button", { name: "Next", exact: true }).count(), 0);
    await page.getByRole("button", { name: "Last page", exact: true }).click();
    await page.getByText("Page 11 of 11", { exact: true }).waitFor();
    await search.fill("Name 105");
    await page.getByText("Page 1 of 1", { exact: true }).waitFor();
    const row = page.getByRole("row").filter({ hasText: "Name 105" });
    assert.equal(await row.count(), 1, `${kind}: search reaches records past API page one`);
    if (kind === "students") {
      const view = row.getByRole("button", { name: /View profile/ });
      await view.click();
      const modal = page.getByRole("dialog", { name: "Student profile", exact: true });
      await modal.getByRole("heading", { name: "Pupil Full Name 105", exact: true }).waitFor();
      assert.equal(await modal.getByText(/Subjects \(inherited/).count(), 0);
      assert.equal(await modal.getByText("Inherited subject", { exact: true }).count(), 0);
      await modal.getByRole("button", { name: "Close", exact: true }).waitFor();
      await page.keyboard.press("Escape");
      await modal.waitFor({ state: "detached" });
      assert(await view.evaluate((element) => document.activeElement === element), "returns focus to View");
      await page.setViewportSize({ width: 390, height: 844 });
      await view.click();
      await modal.waitFor();
      const box = await modal.boundingBox();
      assert(box.x >= 0 && box.x + box.width <= 390, "profile fits a mobile viewport");
      await modal.getByRole("button", { name: "Close", exact: true }).click();
      await page.setViewportSize({ width: 1280, height: 900 });
    }
  }
  assert.deepEqual(errors, []);
  console.log("Admin directories passed: single search/pager, cross-page search, profile content, Escape, focus return and mobile layout.");
} finally {
  await browser.close();
}
