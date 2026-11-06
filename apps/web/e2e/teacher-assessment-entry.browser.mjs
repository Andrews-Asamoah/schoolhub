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
    name: "Test Teacher",
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



const errors = [];
let uploaded = false;
let cleared = false;
let includeAbsentMark = false;
let clearedAbsent = false;
let rejectClear = true;
let acceptClear = false;
let submission = null;
const writes = [];
const grades = [
  { grade: "1", description: "Highest", minScore: 90, maxScore: 100 },
  { grade: "2", description: "Higher", minScore: 80, maxScore: 89 },
  { grade: "9", description: "Lowest", minScore: 0, maxScore: 34 },
];
let rankGrading = false;
function sheet(subjectId) {
  const science = subjectId === "science";
  const pupil = (id, name, marks, grade) => ({
    studentId: id, name, admissionNumber: id.toUpperCase(),
    marks: marks === null ? [] : [{ componentId: "exam", occurrenceIndex: 0, marks }],
    totalScore: marks === null ? 0 : marks / 2, percentage: marks ?? 0, grade,
    complete: marks !== null, excused: submission?.excusedStudentIds.includes(id) ?? false, position: marks === null ? null : 1,
  });
  return {
    class: { id: "class", name: "JHS 1A" }, subject: { id: subjectId, name: science ? "Science" : "Maths" },
    term: { id: "term", name: "Term 1" }, templates: [{ id: "template", name: "Exam" }],
    template: { id: "template", name: "Exam", deadline: null,
      components: [{ id: "exam", name: "Exam", maxMarks: 100, weight: 50, isRequired: true, slots: 1,
        subjectStrandId: null, subjectStrandName: null, canEdit: !submission, canCorrect: true }],
      grades: rankGrading ? grades.map((band) => ({ ...band, description: `Rank: ${band.description}` })) : grades,
      gradingMethod: rankGrading ? "CLASS_RANK" : "SCORE_BANDS" },
    students: [
      pupil("p1", "Ama Akua Mensah", science ? uploaded ? 95 : 80 : null, science ? uploaded ? "1" : "2" : null),
      pupil("p2", "Esi Boateng", science && includeAbsentMark && !clearedAbsent ? 0 : null, science && includeAbsentMark && !clearedAbsent ? "9" : null),
      pupil("p3", "Kojo Owusu", science && !cleared ? 0 : null, science && !cleared ? "9" : null),
    ],
    stats: { count: 1, mean: 80, median: 80, highest: 80, lowest: 0, passRate: 50 },
    canEdit: !submission, readOnlyReason: submission ? "These marks were submitted." : null,
    lock: submission ? "SUBMITTED" : null,
    submission: submission ? { submittedAt: now, note: null, excusedCount: submission.excusedStudentIds.length } : null,
    canSubmit: !submission, canRequestCorrection: !!submission, pendingCorrection: null,
  };
}
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: "en-GB" });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.message().startsWith("Mark Kojo") && !acceptClear ? dialog.dismiss() : dialog.accept());
  await page.route("**/api/**", async (route) => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const json = (data) => route.fulfill({ json: data });
    if (path.includes("/auth/get-session")) return json(session);
    if (path.includes("/auth/organization/list")) return json([organization]);
    if (path.includes("/auth/organization/get-full-organization")) return json({ ...organization, members: [], invitations: [] });
    if (path.includes("/schools/public/") || path.endsWith("/schools/current")) return json(school);
    if (path.endsWith("/schools/academic-context")) return json(null);
    if (path.endsWith("/schools/roles")) return json({ primaryRole: "teacher", roles: ["teacher"] });
    if (path.endsWith("/teaching/me")) return json({ teacher: { id: "teacher", name: "Test Teacher" }, term: { id: "term", name: "Term 1" },
      classes: [{ id: "class", name: "JHS 1A", level: "JHS1", isClassTeacher: true, studentCount: 3,
        subjects: [{ id: "science", name: "Science", code: "SCI" }, { id: "maths", name: "Maths", code: "MAT" }] }] });
    if (path.endsWith("/assessments/entry/import/preview")) return json({
      file: { name: "marks.csv", format: "csv", rows: 1 }, summary: { total: 1, ready: 0, update: 1, unchanged: 0, duplicate: 0, error: 0 },
      rows: [{ rowNumber: 2, name: "Ama Akua Mensah", status: "update", detail: "Exam: 80 → 95", errors: [],
        row: { studentId: "p1", entries: [{ componentId: "exam", occurrenceIndex: 0, marks: 95, expectedMarks: 80 }] } }],
    });
    if (path.endsWith("/assessments/entry/import")) {
      uploaded = true;
      return json({ results: [{ rowNumber: 2, name: "Ama Akua Mensah", status: "updated", message: "Updated" }] });
    }
    if (path.endsWith("/assessments/entry/submit")) {
      submission = request.postDataJSON();
      return json(sheet(submission.subjectId));
    }
    if (path.endsWith("/assessments/entry")) {
      if (request.method() === "PUT") {
        const body = request.postDataJSON(); writes.push(body);
        if (rejectClear) return route.fulfill({ status: 409, json: { message: "Another user changed these marks." } });
        if (body.entries[0].studentId === "p2") clearedAbsent = true;
        else cleared = true;
        return json(sheet(body.subjectId));
      }
      return json(sheet(url.searchParams.get("subjectId")));
    }
    return json([]);
  });
  await page.goto(`${base}/assessments?school=test-school`);
  const ama = page.getByRole("row").filter({ hasText: "Ama Akua Mensah" });
  const esi = page.getByRole("checkbox", { name: "Esi Boateng is absent or excused" });
  const kojo = page.getByRole("checkbox", { name: "Kojo Owusu is absent or excused" });
  await ama.waitFor();
  assert.equal(await page.getByRole("columnheader", { name: "%", exact: true }).count(), 0);
  await page.getByRole("columnheader", { name: "Total (%)", exact: true }).waitFor();
  await page.getByRole("columnheader", { name: "Description", exact: true }).waitFor();
  await ama.getByRole("cell", { name: "80%", exact: true }).waitFor();
  await ama.getByRole("cell", { name: "Higher", exact: true }).waitFor();
  await esi.check();
  await page.reload();
  await esi.waitFor(); assert(await esi.isChecked(), "absence draft survives tab reload");
  await page.getByRole("combobox", { name: "Subject", exact: true }).click();
  await page.getByRole("option", { name: "Maths", exact: true }).click();
  await page.getByRole("heading", { name: "Maths · JHS 1A", exact: true }).waitFor();
  assert.equal(await esi.isChecked(), false, "absence draft is scoped to the subject");
  await page.getByRole("combobox", { name: "Subject", exact: true }).click();
  await page.getByRole("option", { name: "Science", exact: true }).click();
  await page.getByRole("heading", { name: "Science · JHS 1A", exact: true }).waitFor();
  assert(await esi.isChecked(), "returning restores that sheet's absence draft");

  await page.getByRole("button", { name: "Bulk upload", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "marks.csv", mimeType: "text/csv", buffer: Buffer.from("Admission No,Pupil name,Exam (out of 100)\nP1,Ama Akua Mensah,95") });
  await page.getByRole("button", { name: "Save 1 mark for 1 pupil", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await ama.getByRole("cell", { name: "Highest", exact: true }).waitFor();
  assert(await esi.isChecked(), "bulk upload does not discard the absent pupil");
  rankGrading = true;
  await page.evaluate(async () => { const { queryClient } = await import("/src/lib/query-client.ts"); await queryClient.invalidateQueries({ queryKey: ["assessments", "entry"] }); });
  await ama.getByRole("cell", { name: "Rank: Highest", exact: true }).waitFor();
  assert(await esi.isChecked(), "background refetch preserves the absence draft");

  // An uploaded zero for a previously excused pupil must neither lose the choice nor submit as a grade.
  includeAbsentMark = true;
  await page.evaluate(async () => { const { queryClient } = await import("/src/lib/query-client.ts"); await queryClient.invalidateQueries({ queryKey: ["assessments", "entry"] }); });
  const clearEsi = page.getByRole("button", { name: "Clear recorded marks for absent pupil Esi Boateng", exact: true });
  await clearEsi.waitFor();
  assert(await esi.isChecked(), "conflicting uploaded zero does not erase the absence choice");
  assert(await page.getByRole("button", { name: "Submit marks", exact: true }).isDisabled());
  rejectClear = false;
  await clearEsi.click();
  await clearEsi.waitFor({ state: "detached" });
  assert(await esi.isChecked());
  assert.deepEqual(writes.at(-1).entries, [{ studentId: "p2", componentId: "exam", occurrenceIndex: 0, marks: null, expectedMarks: 0 }]);
  const previousWrites = writes.length;
  rejectClear = true;
  await kojo.click(); // Cancel clearing recorded zero marks.
  assert.equal(writes.length, previousWrites); assert.equal(await kojo.isChecked(), false);
  acceptClear = true;
  await kojo.click(); // A conflict must not mark the pupil absent or silently clear marks.
  await page.getByRole("alert").filter({ hasText: "Another user changed these marks" }).waitFor();
  assert.equal(await kojo.isChecked(), false);
  rejectClear = false;
  await kojo.click();
  await page.getByRole("status").filter({ hasText: "Recorded marks cleared for Kojo Owusu" }).waitFor();
  assert(await kojo.isChecked());
  assert.deepEqual(writes.at(-1).entries, [{ studentId: "p3", componentId: "exam", occurrenceIndex: 0, marks: null, expectedMarks: 0 }]);
  await page.getByRole("button", { name: "Submit marks", exact: true }).click();
  await page.getByText("These marks were submitted.", { exact: true }).waitFor();
  assert.deepEqual(submission.excusedStudentIds.sort(), ["p2", "p3"]);
  assert(await esi.isChecked()); assert(await esi.isDisabled());
  assert(await kojo.isChecked()); assert(await kojo.isDisabled());
  await page.reload(); await esi.waitFor();
  assert(await esi.isChecked(), "submitted absence remains visible after reload");
  assert.deepEqual(errors, []);
  console.log("Teacher assessment browser checks passed: normalized total, configured grade descriptions, upload/refetch/reload-safe absences, subject isolation, confirmed mark clearing, conflict protection and submission.");
} finally {
  await browser.close();
}
