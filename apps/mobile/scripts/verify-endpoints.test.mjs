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
