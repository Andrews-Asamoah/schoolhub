import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
const require = createRequire(import.meta.url),
  ts = require("typescript");
function compile(file, replacements = {}) {
  let s = ts.transpileModule(
    readFileSync(new URL("../src/lib/" + file, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  for (const [a, b] of Object.entries(replacements)) s = s.replaceAll(a, b);
  return "data:text/javascript;base64," + Buffer.from(s).toString("base64");
}
const origin = compile("auth-origin.ts"),
  tokensURL = compile("auth-token-hooks.ts");
const { createTokenHooks } = await import(tokensURL);
const nativeURL = compile("native-auth.ts", {
  "./auth-token-hooks": tokensURL,
  "./auth-origin": origin,
  "better-auth/cookies/utils": pathToFileURL(
    require.resolve("better-auth/cookies/utils"),
  ).href,
});
const { createNativeAuthHooks } = await import(nativeURL);
const { createAuthClient } = await import(
  pathToFileURL(require.resolve("better-auth/client")).href
);
const { twoFactorClient } = await import(
  pathToFileURL(require.resolve("better-auth/client/plugins")).href
);
function fixture(write = async () => {}) {
  let revision = 0,
    token = null;
  const store = {
    getRevision: () => revision,
    getSnapshot: () => ({ token, subdomain: "school", activeRole: null }),
    async setToken(value) {
      token = value;
      return ++revision;
    },
    logout() {
      token = null;
      revision++;
    },
  };
  const tokens = createTokenHooks(store);
  return { store, tokens, bridge: createNativeAuthHooks(store, tokens, write) };
}
const response = (data, headers = {}) =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json", ...headers },
  });
test("real client carries only MFA cookie with native origin, then uses the issued header bearer token", async () => {
  const writes = [];
  const f = fixture(async (value) => {
    writes.push(value);
  });
  let requests = 0;
  const client = createAuthClient({
    baseURL: "https://auth-tests.schoolhub.invalid",
    plugins: [twoFactorClient()],
    fetchOptions: {
      auth: { type: "Bearer", token: () => f.store.getSnapshot().token ?? "" },
      onRequest: f.bridge.onRequest,
      onSuccess: f.bridge.onSuccess,
      customFetchImpl: async (input, init) => {
        const path = new URL(String(input)).pathname,
          h = new Headers(init.headers);
        requests++;
        assert.equal(init.credentials, "omit");
        assert.equal(h.get("origin"), "schoolhub://");
        assert.equal(h.get("x-school-subdomain"), "school");
        assert.equal(h.has("x-school-role"), false);
        if (path.endsWith("/sign-in/email"))
          return response(
            { twoFactorRedirect: true },
            {
              "set-cookie":
                "better-auth.two_factor=mfa-fixture; Max-Age=300; Path=/",
              "set-auth-token": "unverified-header-fixture",
            },
          );
        if (path.endsWith("/two-factor/verify-totp")) {
          assert.equal(h.get("cookie"), "better-auth.two_factor=mfa-fixture");
          return response(
            { user: { id: "fixture" }, token: "ignored-body-fixture" },
            { "set-auth-token": "verified-header-fixture" },
          );
        }
        assert.equal(h.has("cookie"), false);
        assert.equal(h.get("authorization"), "Bearer verified-header-fixture");
        return response({ user: { id: "fixture" } });
      },
    },
  });
  const first = await client.signIn.email({
    email: "fixture@example.test",
    password: "fixture",
  });
  assert.equal(f.tokens.isCurrentResponse(first.data), true);
  assert.equal(f.store.getSnapshot().token, null);
  const verified = await client.twoFactor.verifyTotp({
    code: "123456",
    trustDevice: false,
  });
  assert.equal(f.tokens.isCurrentResponse(verified.data), true);
  assert.equal(f.store.getSnapshot().token, "verified-header-fixture");
  assert.deepEqual(writes, ["better-auth.two_factor=mfa-fixture", null]);
  await client.getSession();
  assert.equal(requests, 3);
});
test("a delayed challenge cannot restore MFA state after logout", async () => {
  const writes = [];
  const f = fixture(async (value) => {
    writes.push(value);
  });
  const request = {
    url: "https://test.invalid/api/auth/sign-in/email",
    headers: new Headers(),
  };
  await f.bridge.onRequest(request);
  f.store.logout();
  await f.bridge.onSuccess({
    request,
    data: { twoFactorRedirect: true },
    response: {
      headers: new Headers({
        "set-cookie": "better-auth.two_factor=old-fixture; Max-Age=300",
      }),
    },
  });
  assert.deepEqual(writes, []);
  await assert.rejects(
    f.bridge.onRequest({
      url: "https://test.invalid/api/auth/two-factor/verify-backup-code",
      headers: new Headers(),
    }),
    /expired/,
  );
});
test("logout during a pending secure challenge write leaves no reusable challenge", async () => {
  let finish;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const writes = [];
  const f = fixture(async (value) => {
    writes.push(value);
    if (value) await pending;
  });
  const request = {
    url: "https://test.invalid/api/auth/sign-in/email",
    headers: new Headers(),
  };
  await f.bridge.onRequest(request);
  const success = f.bridge.onSuccess({
    request,
    data: { twoFactorRedirect: true },
    response: {
      headers: new Headers({
        "set-cookie": "better-auth.two_factor=challenge-fixture; Max-Age=300",
      }),
    },
  });
  await Promise.resolve();
  await Promise.resolve();
  f.store.logout();
  const cleared = f.bridge.clear();
  finish();
  await Promise.all([success, cleared]);
  assert.equal(writes.at(-1), null);
  await assert.rejects(
    f.bridge.onRequest({
      url: "https://test.invalid/api/auth/two-factor/verify-totp",
      headers: new Headers(),
    }),
    /expired/,
  );
});

test("native auth scrubs forged identity and unrelated cookies before sending", async () => {
  const f = fixture();
  const request = {
    url: "https://test.invalid/api/auth/get-session",
    headers: new Headers({
      authorization: "Bearer forged-fixture",
      cookie: "foreign=fixture",
      "x-school-role": "admin",
      "x-school-subdomain": "other",
      "x-academic-year-id": "forged-scope",
    }),
  };
  await f.bridge.onRequest(request);
  assert.equal(request.headers.has("x-academic-year-id"), false);
  assert.equal(request.headers.has("authorization"), false);
  assert.equal(request.headers.has("cookie"), false);
  assert.equal(request.headers.has("x-school-role"), false);
  assert.equal(request.headers.get("x-school-subdomain"), "school");
});
