import { publicFetch, apiFetch, buildHeaders } from "@/lib/api";
import {
  getActiveRole,
  getSubdomain,
  getToken,
  emitSessionEvent,
} from "@/lib/session";
jest.mock("@/lib/session", () => ({
  getActiveRole: jest.fn(() => "teacher"),
  getSubdomain: jest.fn(() => "school"),
  getToken: jest.fn(() => "fixture-session"),
  emitSessionEvent: jest.fn(),
}));
beforeEach(() => {
  jest.mocked(getActiveRole).mockReturnValue("teacher");
  jest.mocked(getSubdomain).mockReturnValue("school");
  jest.mocked(getToken).mockReturnValue("fixture-session");
});
test("overrides forged identity and removes every accountant scope header", () => {
  const headers = buildHeaders("/announcements", {
    headers: {
      Authorization: "wrong-fixture",
      "x-school-role": "admin",
      "x-school-subdomain": "other",
      "x-academic-year-id": "old",
      "x-academic-term-id": "old",
    },
  });
  expect(headers.get("Authorization")).toBe("Bearer fixture-session");
  expect(headers.get("x-school-role")).toBe("teacher");
  expect(headers.get("x-school-subdomain")).toBe("school");
  expect(headers.has("x-academic-year-id")).toBe(false);
  expect(headers.has("x-academic-term-id")).toBe(false);
});
test("role discovery never sends the role header, including query-string variants", () => {
  for (const path of [
    "/schools/roles",
    "/schools/roles?refresh=1",
    "/schools/roles/",
  ])
    expect(
      buildHeaders(path, { headers: { "x-school-role": "admin" } }).has(
        "x-school-role",
      ),
    ).toBe(false);
});
test("unsupported roles cannot build business request headers", () => {
  jest.mocked(getActiveRole).mockReturnValue("accountant" as never);
  expect(() => buildHeaders("/announcements")).toThrow();
});
test("anonymous requests cannot inherit a caller-supplied token", () => {
  jest.mocked(getToken).mockReturnValue(null);
  expect(
    buildHeaders("/announcements", {
      headers: { Authorization: "forged-fixture" },
    }).has("Authorization"),
  ).toBe(false);
});
test.each([
  [401, {}, "unauthorized"],
  [403, { error: "PASSWORD_CHANGE_REQUIRED" }, "password-change-required"],
  [403, { error: "SUBSCRIPTION_INACTIVE" }, "subscription-inactive"],
  [403, { error: "TWO_FACTOR_REQUIRED" }, "two-factor-required"],
])("dispatches session event for %s %j", async (status, body, type) => {
  global.fetch = jest.fn(
    async () => new Response(JSON.stringify(body), { status }),
  ) as jest.Mock;
  await expect(apiFetch("/announcements")).rejects.toThrow();
  expect(emitSessionEvent).toHaveBeenCalledWith(
    expect.objectContaining({ type }),
  );
});
test("forwards cancellation and treats 204 as an empty response", async () => {
  global.fetch = jest.fn(
    async () => new Response(null, { status: 204 }),
  ) as jest.Mock;
  const abort = new AbortController();
  await expect(
    apiFetch("/announcements", { signal: abort.signal }),
  ).resolves.toBeUndefined();
  expect(fetch).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ signal: abort.signal }),
  );
});

test("anonymous school lookup cannot forward session or finance headers", async () => {
  global.fetch = jest.fn(
    async () =>
      new Response(JSON.stringify({ name: "School" }), { status: 200 }),
  ) as jest.Mock;
  await publicFetch("/schools/public/school", "School", {
    headers: {
      Authorization: "forged-fixture",
      "x-school-role": "admin",
      "x-academic-year-id": "old",
    },
  });
  const headers = jest.mocked(fetch).mock.calls[0]?.[1]?.headers as Headers;
  expect(headers.has("Authorization")).toBe(false);
  expect(headers.has("x-school-role")).toBe(false);
  expect(headers.has("x-academic-year-id")).toBe(false);
  expect(headers.get("x-school-subdomain")).toBe("school");
});
