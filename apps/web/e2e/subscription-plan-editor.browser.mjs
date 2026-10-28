import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const entry = process.env.PLAYWRIGHT_PACKAGE_ENTRY;
if (!entry) throw new Error("Set PLAYWRIGHT_PACKAGE_ENTRY to the Playwright CLI path.");
const { chromium } = await import(pathToFileURL(resolve(dirname(entry), "index.mjs")).href);
const browser = await chromium.launch({ headless: true });
const baseUrl = process.env.SCHOOLHUB_WEB_URL ?? "http://127.0.0.1:5173";
const now = new Date().toISOString();
const session = {
  user: { id: "admin", name: "Admin", email: "admin@example.test", role: "superAdmin", twoFactorEnabled: true, mustChangePassword: false, createdAt: now, updatedAt: now },
  session: { id: "session", token: "token", userId: "admin", expiresAt: new Date(Date.now() + 3600000).toISOString(), createdAt: now, updatedAt: now },
};

try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport, locale: "en-GB" });
    const plans = [];
    const writes = [];
    let failNext = false;
    let releaseSave;
    const errors = [];
    page.on("pageerror", error => errors.push(error.stack ?? error.message));
    await page.route("**/api/auth/get-session*", route => route.fulfill({ json: session }));
    await page.route("**/api/super-admin/subscription-plans**", async route => {
      if (route.request().method() === "GET") return route.fulfill({ json: plans });
      writes.push(route.request().postDataJSON());
      if (failNext) {
        failNext = false;
        return route.fulfill({ status: 409, json: { message: "A subscription plan with this code already exists" } });
      }
      if (releaseSave) await new Promise(resolveSave => { releaseSave = resolveSave; });
      const data = { ...route.request().postDataJSON(), id: "plan", version: plans.length ? 2 : 1 };
      plans.splice(0, plans.length, data);
      return route.fulfill({ json: data });
    });
    await page.goto(`${baseUrl}/admin/plans`);
    const create = page.getByRole("button", { name: "Create plan", exact: true });
    await create.waitFor();
    await create.click();
    const dialog = page.getByRole("dialog", { name: "Create subscription plan" });
    await dialog.waitFor();
    assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden");
    assert.equal(await dialog.getByLabel("Plan code *", { exact: true }).evaluate(el => el === document.activeElement), true);
    // Native modal focus containment and Escape restoration.
    await page.keyboard.press("Shift+Tab");
    assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest("dialog"))), true);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.equal(await create.evaluate(el => el === document.activeElement), true);
    await create.click();
    await dialog.getByRole("button", { name: "Create plan", exact: true }).click();
    await dialog.getByText("Check the highlighted fields before saving.").waitFor();
    assert.equal(writes.length, 0);
    await dialog.getByLabel("Plan code *", { exact: true }).fill("GROWTH");
    await dialog.getByLabel("Display name *", { exact: true }).fill("Growth");
    await dialog.getByLabel("Monthly price (GHS) *", { exact: true }).fill("-1");
    await dialog.getByLabel("Annual price (GHS) *", { exact: true }).fill("1200");
    await dialog.getByLabel("Students", { exact: true }).fill("1.5");
    await dialog.getByRole("button", { name: "Create plan", exact: true }).click();
    assert.equal(writes.length, 0);
    await dialog.getByLabel("Monthly price (GHS) *", { exact: true }).fill("100.50");
    await dialog.getByLabel("Students", { exact: true }).fill("500");
    await dialog.getByRole("checkbox", { name: "Unlimited teachers", exact: true }).check();
    assert.equal(await dialog.getByLabel("Teachers", { exact: true }).isDisabled(), true);
    await dialog.getByLabel("Included features", { exact: true }).fill("Attendance\nReports, advanced\nAttendance");
    // Dirty close confirmation preserves the draft when cancelled.
    await page.keyboard.press("Escape");
    await dialog.getByText("Discard unsaved changes?").waitFor();
    await dialog.getByRole("button", { name: "Keep editing" }).click();
    assert.equal(await dialog.getByLabel("Display name *", { exact: true }).inputValue(), "Growth");
    failNext = true;
    await dialog.getByRole("button", { name: "Create plan", exact: true }).click();
    await dialog.getByRole("alert").getByText("A subscription plan with this code already exists").waitFor();
    assert.equal(await dialog.getByLabel("Display name *", { exact: true }).inputValue(), "Growth");
    // Pending saves cannot be dismissed or submitted twice.
    releaseSave = true;
    await dialog.getByRole("button", { name: "Create plan", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('form[aria-busy="true"]'));
    await page.keyboard.press("Escape");
    assert.equal(await dialog.isVisible(), true);
    assert.equal(await dialog.getByRole("button", { name: "Saving…" }).isDisabled(), true);
    await page.waitForFunction(() => document.querySelector('form[aria-busy="true"]'));
    // Wait for the intercepted request to register its resolver.
    for (let attempt = 0; typeof releaseSave !== "function" && attempt < 100; attempt++) await page.waitForTimeout(10);
    assert.equal(typeof releaseSave, "function");
    releaseSave();
    releaseSave = undefined;
    await dialog.waitFor({ state: "detached" });
    await page.getByText("Subscription plan created.", { exact: true }).waitFor();
    assert.equal(writes.length, 2);
    assert.equal(writes[1].maxTeachers, null);
    assert.equal(writes[1].monthlyPrice, 100.5);
    assert.deepEqual(writes[1].features, ["Attendance", "Reports, advanced"]);
    assert.equal(await page.evaluate(() => document.body.style.overflow), "");
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const edit = page.getByRole("dialog", { name: "Edit subscription plan" });
    assert.equal(await edit.getByLabel("Plan code *", { exact: true }).getAttribute("readonly"), "");
    assert.equal(await edit.getByLabel("Included features", { exact: true }).inputValue(), "Attendance\nReports, advanced");
    await edit.getByLabel("Display name *", { exact: true }).fill("Growth Plus");
    await edit.getByRole("button", { name: "Save changes", exact: true }).click();
    await edit.waitFor({ state: "detached" });
    await page.getByText("Subscription plan updated.", { exact: true }).waitFor();
    await create.click();
    await dialog.getByLabel("Display name *", { exact: true }).fill("Discard me");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await dialog.getByRole("button", { name: "Discard changes" }).click();
    await dialog.waitFor({ state: "detached" });
    await create.click();
    assert.equal(await dialog.getByLabel("Display name *", { exact: true }).inputValue(), "");
    const bounds = await dialog.boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= viewport.width && bounds.height <= viewport.height);
    const footer = dialog.locator("footer");
    assert.ok(await footer.isVisible());
    assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true);
    if (process.env.SCHOOLHUB_SCREENSHOT_DIR) {
      await page.screenshot({ path: `${process.env.SCHOOLHUB_SCREENSHOT_DIR}/plan-editor-${viewport.width}.png` });
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Subscription plan editor: desktop/mobile create, edit, validation, focus, discard, error and pending-save checks passed.");
} finally {
  await browser.close();
}
