import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const { createAuthClient } = await import(
  pathToFileURL(require.resolve("better-auth/client")).href
);
const compiled = ts.transpileModule(
  readFileSync(
    new URL("../src/lib/auth-token-hooks.ts", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const module = { exports: {} };
// Compile the same pure hook used by native, with no replacement auth implementation.
new Function("module", "exports", compiled)(module, module.exports);
const { createTokenHooks } = module.exports;
const response = () =>
  new Response(JSON.stringify({ user: { id: "fixture", role: "teacher" } }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "set-auth-token": "response-fixture",
    },
  });

test("real Better Auth client preserves request and response ownership", async () => {
  let revision = 0;
  let token = null;
  const hooks = createTokenHooks({
    getRevision: () => revision,
    async setToken(value) {
      token = value;
      return ++revision;
    },
  });
  const client = createAuthClient({
    baseURL: "https://auth-tests.schoolhub.invalid",
    fetchOptions: {
      onRequest: hooks.onRequest,
      onSuccess: hooks.onSuccess,
      customFetchImpl: async () => response(),
    },
  });
  const result = await client.getSession();
  assert.equal(token, "response-fixture");
  assert.equal(hooks.isCurrentResponse(result.data), true);
});
test("real Better Auth response cannot restore a logged-out token", async () => {
  let revision = 0;
  let token = "initial-fixture";
  let finish;
  let requested;
  const started = new Promise((resolve) => {
    requested = resolve;
  });
  const delayed = new Promise((resolve) => {
    finish = resolve;
  });
  const hooks = createTokenHooks({
    getRevision: () => revision,
    async setToken(value) {
      token = value;
      return ++revision;
    },
  });
  const client = createAuthClient({
    baseURL: "https://auth-tests.schoolhub.invalid",
    fetchOptions: {
      onRequest: hooks.onRequest,
      onSuccess: hooks.onSuccess,
      customFetchImpl: async () => {
        requested();
        return delayed;
      },
    },
  });
  const pending = client.getSession();
  await started;
  revision++;
  token = null;
  finish(response());
  const result = await pending;
  assert.equal(token, null);
  assert.equal(hooks.isCurrentResponse(result.data), false);
});

test("real Better Auth revocation uses the captured pre-logout credential", async () => {
  let authorization;
  const client = createAuthClient({
    baseURL: "https://auth-tests.schoolhub.invalid",
    fetchOptions: {
      auth: { type: "Bearer", token: () => "" },
      customFetchImpl: async (_url, options) => {
        authorization = new Headers(options.headers).get("Authorization");
        return new Response('{"success":true}', {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  });
  await client.signOut({
    fetchOptions: { auth: { type: "Bearer", token: "revocation-fixture" } },
  });
  assert.equal(authorization, "Bearer revocation-fixture");
});
