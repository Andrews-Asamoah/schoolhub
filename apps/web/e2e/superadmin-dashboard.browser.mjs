import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const packageEntry = process.env.PLAYWRIGHT_PACKAGE_ENTRY;
if (!packageEntry) {
  throw new Error("PLAYWRIGHT_PACKAGE_ENTRY must point to the Playwright CLI installed by pnpm dlx.");
}

const playwrightModule = await import(
  pathToFileURL(resolve(dirname(packageEntry), "index.mjs")).href
);
const { chromium } = playwrightModule;

const baseUrl = process.env.SCHOOLHUB_WEB_URL ?? "http://127.0.0.1:5173";
const browser = await chromium.launch({ headless: true });

const session = {
  user: {
    id: "e2e-superadmin",
    name: "E2E Super Admin",
    email: "superadmin@example.test",
    role: "superAdmin",
    mustChangePassword: false,
    twoFactorEnabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  session: {
    id: "e2e-session",
    token: "e2e-session-token",
    userId: "e2e-superadmin",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
};

const statsPayload = {
  totalSchools: 12,
  totalStudents: 840,
  totalTeachers: 63,
  activeSubscriptions: 9,
  trialing: 2,
  pastDue: 1,
  suspended: 0,
  expiringSoon: 0,
  lapsed: 0,
  cancelled: 0,
  subscriptionStatusCounts: { ACTIVE: 9, TRIALING: 2, PAST_DUE: 1 },
};

const schoolsPayload = {
  data: [
    {
      id: "school-e2e",
      name: "Example Academy",
      code: "EXA",
      subdomain: "example-academy",
      createdAt: "2026-09-01T00:00:00.000Z",
      organization: {
        subscriptionStatus: "ACTIVE",
        expiresAt: "2027-09-01T00:00:00.000Z",
        metadata: JSON.stringify({ region: "Eastern" }),
      },
      _count: { students: 120, teachers: 8 },
    },
  ],
  meta: { total: 1 },
};

const healthPayload = {
  status: "degraded",
  checkedAt: "2026-10-27T12:00:00.000Z",
  application: {
    status: "healthy",
    version: "e2e",
    environment: "test",
    commitSha: "e2e-test",
  },
  migrations: {
    status: "not_configured",
    latestApplied: "20261001000000_initial",
    unfinishedCount: 0,
  },
  dependencies: {
    database: { status: "healthy", latencyMs: 8 },
    storage: { status: "not_instrumented" },
    notifications: { status: "not_instrumented" },
    backgroundJobs: { status: "not_instrumented" },
  },
};

async function installApiMocks(page, { failHealth = false, delayStats = 0 } = {}) {
  const calls = { stats: 0, schools: 0, health: 0 };

  await page.route("**/api/auth/get-session*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(session),
    });
  });

  await page.route("**/api/super-admin/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/super-admin/stats")) {
      calls.stats += 1;
      if (delayStats > 0 && calls.stats === 1) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, delayStats));
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(statsPayload),
      });
      return;
    }

    if (url.pathname.endsWith("/super-admin/schools")) {
      calls.schools += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(schoolsPayload),
      });
      return;
    }

    if (url.pathname.endsWith("/super-admin/operations/health")) {
      calls.health += 1;
      if (failHealth && calls.health === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "Health endpoint unavailable in test." }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(healthPayload),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ message: "No browser-test mock for this endpoint." }),
    });
  });

  return calls;
}

async function runDashboardHappyPath() {
  const context = await browser.newContext();
  const page = await context.newPage();
  const calls = await installApiMocks(page, { delayStats: 700 });

  await page.goto(`${baseUrl}/admin/dashboard`);
  await page.getByText("Loading subscription data…").waitFor({ state: "visible", timeout: 10_000 });
  await page.getByRole("heading", { name: "Platform overview" }).waitFor({ state: "visible" });
  await page.getByText("Example Academy").waitFor({ state: "visible" });
  await page.getByText("Expected version not configured").waitFor({ state: "visible" });
  await page.getByText("12", { exact: true }).first().waitFor({ state: "visible" });

  assert.ok(calls.stats >= 1, "dashboard should request platform stats");
  assert.ok(calls.schools >= 1, "dashboard should request recent schools");
  assert.ok(calls.health >= 1, "dashboard should request operations health");

  const statsBeforeRefresh = calls.stats;
  const schoolsBeforeRefresh = calls.schools;
  await page.getByRole("button", { name: "Refresh data" }).click();
  await page.waitForFunction(
    ({ statsBeforeRefresh, schoolsBeforeRefresh }) =>
      window.__schoolhubBrowserTestCalls?.stats > statsBeforeRefresh &&
      window.__schoolhubBrowserTestCalls?.schools > schoolsBeforeRefresh,
    { statsBeforeRefresh, schoolsBeforeRefresh },
    { timeout: 10_000 },
  ).catch(async () => {
    // The app route handlers update the closure; verify those counters below
    // without exposing test state to the application window.
    await page.getByRole("button", { name: "Refresh data" }).waitFor({ state: "visible" });
  });

  assert.ok(calls.stats > statsBeforeRefresh, "manual refresh should refetch stats");
  assert.ok(calls.schools > schoolsBeforeRefresh, "manual refresh should refetch schools");

  const healthBeforeRefresh = calls.health;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.waitForFunction(
    () => document.body.innerText.includes("Checked"),
    null,
    { timeout: 10_000 },
  );
  assert.ok(calls.health > healthBeforeRefresh, "health refresh should refetch the health endpoint");

  await context.close();
}

async function runHealthErrorRecovery() {
  const context = await browser.newContext();
  const page = await context.newPage();
  const calls = await installApiMocks(page, { failHealth: true });

  await page.goto(`${baseUrl}/admin/dashboard`);
  await page.getByRole("heading", { name: "Platform overview" }).waitFor({ state: "visible" });
  await page.getByText("Health status unavailable").waitFor({ state: "visible", timeout: 10_000 });

  await page.getByRole("button", { name: "Try again" }).click();
  await page.getByText("Expected version not configured").waitFor({ state: "visible", timeout: 10_000 });
  assert.ok(calls.health >= 2, "health retry should issue a second request");

  await context.close();
}

try {
  await runDashboardHappyPath();
  await runHealthErrorRecovery();
  process.stdout.write("SuperAdmin browser E2E passed: authenticated dashboard, loading/data states, manual refresh, migration status, and health-error recovery.\n");
} finally {
  await browser.close();
}
