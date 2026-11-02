import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const entry = process.env.PLAYWRIGHT_PACKAGE_ENTRY;
if (!entry) throw new Error("Set PLAYWRIGHT_PACKAGE_ENTRY to the Playwright CLI path.");
const { chromium } = await import(
  pathToFileURL(resolve(dirname(entry), "index.mjs")).href
);
const browser = await chromium.launch({ headless: true });
const base = process.env.SCHOOLHUB_WEB_URL ?? "http://127.0.0.1:5173";

const now = new Date().toISOString();
const organization = { id: "org", name: "Test school", slug: "test-school", createdAt: now };
const session = {
  user: {
    id: "accountant-e2e",
    name: "Test Accountant",
    email: "accountant@example.test",
    role: "user",
    mustChangePassword: false,
    twoFactorEnabled: true,
    createdAt: now,
    updatedAt: now,
  },
  session: {
    id: "accountant-session",
    token: "accountant-session-token",
    userId: "accountant-e2e",
    activeOrganizationId: "org",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    createdAt: now,
    updatedAt: now,
  },
};
const school = {
  id: "school",
  organizationId: "org",
  name: "Test school",
  code: "TEST",
  subdomain: "test-school",
  currency: "GHS",
};
const academicYears = [
  {
    id: "year-2026",
    name: "2026 Academic Year",
    isCurrent: true,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    terms: [
      {
        id: "term-1",
        name: "Term 1",
        isCurrent: true,
        startDate: "2026-01-01",
        endDate: "2026-04-30",
      },
    ],
  },
];
const summary = {
  asOf: "2026-11-02",
  balanceAsOf: "2026-11-02",
  balanceBasis: "CURRENT",
  reconciliation: {
    status: "RECONCILED",
    ageingTotal: "450.00",
    ageingDifference: "0.00",
    ageingReconciled: true,
    invoiceItemMismatchCount: 0,
    studentBalanceMismatchCount: 0,
    receiptAllocationMismatchCount: 0,
    ledgerMismatchCount: 0,
  },
  period: {
    from: "2026-01-01",
    to: "2026-04-30",
    yearId: "year-2026",
    termId: "term-1",
    basis: "ISSUE_AND_PAYMENT_DATE",
  },
  billed: "1234.50",
  billedCount: 12,
  collected: "987.65",
  receiptCount: 9,
  outstanding: "450.00",
  outstandingBillCount: 3,
  overdue: "100.00",
  overdueBillCount: 1,
  collectionRate: "80.0",
  byMethod: [{ method: "CASH", amount: "987.65", receiptCount: 9 }],
  byClass: [{
    classId: "class-1",
    className: "Primary 1",
    billed: "1234.50",
    collected: "987.65",
    outstanding: "450.00",
    billCount: 12,
  }],
  ageing: {
    days0To30: "0.00",
    days31To60: "0.00",
    days61To90: "0.00",
    days90Plus: "100.00",
    notDue: "350.00",
  },
};

async function installMocks(page, { failFirstSummary = false, noAcademicYears = false } = {}) {
  const summaryRequests = [];
  let summaryFailures = 0;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
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
      return route.fulfill({ json: { primaryRole: "accountant", roles: ["accountant"] } });
    }
    if (path.endsWith("/schools/academic-years")) {
      return route.fulfill({ json: noAcademicYears ? [] : academicYears });
    }
    if (path.endsWith("/finance/summary")) {
      summaryRequests.push(new URL(request.url()).searchParams);
      if (failFirstSummary && summaryFailures++ === 0) {
        return route.fulfill({
          status: 503,
          json: { message: "Summary unavailable in browser fixture." },
        });
      }
      return route.fulfill({ json: summary });
    }
    if (path.endsWith("/finance/reconciliations/accounts") ||
        path.endsWith("/finance/reconciliations/journal-accounts") ||
        path.endsWith("/finance/reconciliations") ||
        path.endsWith("/finance/manual-journals") ||
        path.endsWith("/finance/periods") ||
        path.endsWith("/finance/period-controls/requests")) {
      return route.fulfill({ json: [] });
    }
    if (request.method() !== "GET") {
      return route.fulfill({ status: 200, json: { success: true } });
    }
    return route.fulfill({
      status: 404,
      json: { message: `No accountant browser-test mock for ${path}.` },
    });
  });
  return summaryRequests;
}

async function runPeriodScopes(viewport) {
  const page = await browser.newPage({ viewport, locale: "en-GB" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const requests = await installMocks(page, { failFirstSummary: true });
  await page.goto(`${base}/finance-reports?school=test-school`);

  await page.getByRole("heading", { name: "Bank and cash reconciliation", exact: true }).waitFor();
  await page.getByText("The finance report could not be loaded.", { exact: false }).waitFor();
  await page
    .locator('[role="alert"]')
    .filter({ hasText: "The finance report could not be loaded." })
    .getByRole("button", { name: "Retry", exact: true })
    .click();
  await page.getByText(/1,234\.50/).first().waitFor();
  assert.equal(requests.length, 2, "summary retry should issue another request");
  assert.equal(requests[0].get("yearId"), "year-2026");
  assert.equal(requests[0].get("termId"), "term-1");

  await page.getByRole("combobox", { name: "Report scope" }).click();
  await page.getByRole("option", { name: "Academic year" }).click();
  await page.waitForFunction(() => document.body.innerText.includes("1,234.50"));
  const yearRequest = requests.at(-1);
  assert.equal(yearRequest.get("yearId"), "year-2026");
  assert.equal(yearRequest.has("termId"), false, "year scope must not retain the term filter");

  await page.getByRole("combobox", { name: "Report scope" }).click();
  await page.getByRole("option", { name: "All time" }).click();
  await page.waitForFunction(() => document.body.innerText.includes("1,234.50"));
  const allTimeRequest = requests.at(-1);
  assert.equal(allTimeRequest.has("yearId"), false, "all-time scope must not retain the academic year filter");
  assert.equal(allTimeRequest.has("termId"), false, "all-time scope must not retain the academic term filter");

  assert.deepEqual(errors, []);
  const layout = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    overflowing: Array.from(document.querySelectorAll("body *"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          className: typeof element.className === "string" ? element.className : "",
          text: element.textContent?.trim().slice(0, 60),
          right: Math.ceil(rect.right),
        };
      })
      .filter((element) => element.right > innerWidth + 1)
      .sort((left, right) => right.right - left.right)
      .slice(0, 5),
  }));
  assert(layout.document <= layout.viewport, `reporting page should fit the viewport: ${JSON.stringify(layout)}`);
  await page.close();
}

async function runMissingAcademicPeriod() {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const requests = await installMocks(page, { noAcademicYears: true });
  await page.goto(`${base}/finance-reports?school=test-school`);
  await page.getByRole("heading", { name: "Bank and cash reconciliation", exact: true }).waitFor();
  await page.getByText("Select an academic year to calculate this report.", { exact: true }).waitFor();
  assert.equal(requests.length, 0, "do not request an unscoped summary when academic periods are unavailable");
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "mobile report should not overflow");
  await page.close();
}

try {
  await runPeriodScopes({ width: 1440, height: 1000 });
  await runPeriodScopes({ width: 390, height: 844 });
  await runMissingAcademicPeriod();
  console.log("Accountant finance reporting browser checks passed: retry, academic scopes, missing period guard, and desktop/mobile layout.");
} finally {
  await browser.close();
}
