import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
function check(code) {
  const root = mkdtempSync(join(tmpdir(), "mobile-endpoints-"));
  try {
    mkdirSync(join(root, "api"));
    writeFileSync(join(root, "api", "fixture.ts"), code);
    return spawnSync(
      process.execPath,
      [fileURLToPath(new URL("./verify-endpoints.mjs", import.meta.url)), root],
      { encoding: "utf8" },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
const declaration = (path, roles = "'teacher'", method = "GET") =>
  `defineEndpoint({ method:'${method}', path:'${path}', roles:[${roles}], response:schema });`;
test("normalises inventory parameter names", () =>
  assert.equal(
    check(declaration("/academics/classes/:classId/students")).status,
    0,
  ));
for (const code of [
  declaration("/missing"),
  declaration("/announcements", "'admin'"),
  declaration("/students/me", "'guardian'"),
  declaration("/announcements", "'teacher'", "DELETE"),
  declaration("/external-exams/results"),
  "defineEndpoint(config)",
  "apiFetch(path)",
  "fetch(path)",
  'defineEndpoint({ method:method, path:"/announcements", roles:["teacher"] })',
]) {
  test(`rejects unsupported endpoint configuration ${code}`, () =>
    assert.notEqual(check(code).status, 0));
}
test("fails closed for an empty registry", () =>
  assert.notEqual(check("export const placeholder = true").status, 0));

for (const [path, method] of [
  ["/schools/public/:subdomain", "GET"],
  ["/schools/public/:subdomain/resolve-login", "POST"],
  ["/account/password-recovery/request", "POST"],
  ["/account/password-recovery/complete", "POST"],
]) {
  test(`accepts reviewed anonymous ${method} ${path}`, () =>
    assert.equal(
      check(
        `defineEndpoint({method:'${method}',path:'${path}',roles:['teacher','student','guardian'],scope:'public',response:schema})`,
      ).status,
      0,
    ));
}
for (const code of [
  "defineEndpoint({method:'POST',path:'/account/change-password',roles:['teacher'],scope:'public',response:schema})",
  "defineEndpoint({method:'GET',path:'/schools/public/:subdomain',roles:['teacher'],scope:'account',response:schema})",
]) {
  test(`rejects an incorrect authentication scope: ${code}`, () =>
    assert.notEqual(check(code).status, 0));
}
