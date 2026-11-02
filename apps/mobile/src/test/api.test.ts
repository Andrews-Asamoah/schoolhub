import { publicFetch, apiFetch, buildHeaders } from "@/lib/api";
import {
  getActiveRole,
  getSubdomain,
  getToken,
  emitSessionEvent,
  sessionStore,
} from "@/lib/session";
jest.mock("@/lib/session", () => ({
  getActiveRole: jest.fn(() => "teacher"),
  getSubdomain: jest.fn(() => "school"),
  getToken: jest.fn(() => "fixture-session"),
  emitSessionEvent: jest.fn(),
  sessionStore: { getRevision: jest.fn(() => 0) },
}));
beforeEach(() => {
  jest.mocked(sessionStore.getRevision).mockReturnValue(0);
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
  let complete!: (value: Response) => void;
  global.fetch = jest.fn(
    () =>
      new Promise<Response>((resolve) => {
        complete = resolve;
      }),
  );
  const abort = new AbortController();
  const pending = apiFetch("/announcements", { signal: abort.signal });
  const forwarded = jest.mocked(fetch).mock.calls[0]?.[1]?.signal;
  expect(forwarded).toBeInstanceOf(AbortSignal);
  abort.abort();
  expect(forwarded?.aborted).toBe(true);
  complete(new Response(null, { status: 204 }));
  await expect(pending).resolves.toBeUndefined();
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

test("late 401 cannot sign out a newer session", async () => {
  let finish!: (value: Response) => void;
  global.fetch = jest.fn(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  const pending = apiFetch("/announcements");
  jest.mocked(sessionStore.getRevision).mockReturnValue(1);
  finish(new Response("{}", { status: 401 }));
  await expect(pending).rejects.toThrow("session has changed");
  expect(emitSessionEvent).not.toHaveBeenCalled();
});
test("successful responses from an old session are discarded too", async () => {
  global.fetch = jest.fn(async () => {
    jest.mocked(sessionStore.getRevision).mockReturnValue(1);
    return new Response("[]", { status: 200 });
  }) as jest.Mock;
  await expect(apiFetch("/announcements")).rejects.toThrow(
    "session has changed",
  );
});

test("anonymous recovery cannot override the configured HTTPS mail origin with an app scheme", async () => {
  const fetcher = jest.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({ success: true }),
  } as Response);
  await publicFetch("/account/password-recovery/request", "school", {
    method: "POST",
    headers: { Origin: "schoolhub://", Referer: "https://untrusted.invalid" },
  });
  const headers = fetcher.mock.calls[0]?.[1]?.headers as Headers;
  expect(headers.has("origin")).toBe(false);
  expect(headers.has("referer")).toBe(false);
  fetcher.mockRestore();
});

test("a stalled startup role request has a bounded wait", async () => {
  jest.useFakeTimers();
  try {
    jest.spyOn(global, "fetch").mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new Error("request aborted")),
            { once: true },
          );
        }),
    );
    const pending = apiFetch("/schools/roles");
    const rejected = expect(pending).rejects.toThrow("request aborted");
    await jest.advanceTimersByTimeAsync(20000);
    await rejected;
  } finally {
    jest.useRealTimers();
  }
});
