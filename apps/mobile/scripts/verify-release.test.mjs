import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

function verify(sources) {
  const folder = mkdtempSync(join(tmpdir(), "schoolhub-release-"));
  try {
    if (sources)
      writeFileSync(
        join(folder, "bundle.hbc.map"),
        JSON.stringify({ version: 3, sources }),
      );
    return spawnSync(
      process.execPath,
      [fileURLToPath(new URL("./verify-release.mjs", import.meta.url)), folder],
      { encoding: "utf8" },
    );
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

test("accepts the production entry sources", () => {
  assert.equal(
    verify(["/repo/apps/mobile/app/_layout.tsx", "../app/(auth)/login.tsx"])
      .status,
    0,
  );
});
for (const route of [
  "dev-gallery.tsx",
  "dev-tabs/index.tsx",
  "(tabs)/profile.tsx",
  "(workspace)/fees.tsx",
  "(superadmin)/index.tsx",
  "(management)/index.tsx",
  "(accountant)/index.tsx",
  "(admin)/index.tsx",
  "(student)/bece.tsx",
]) {
  test(`rejects bundled route ${route}`, () => {
    const result = verify([`/repo/apps/mobile/app/${route}`]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Forbidden release route/);
  });
}
test("rejects Windows development paths too", () => {
  assert.notEqual(
    verify(["C:\\repo\\apps\\mobile\\app\\dev-tabs\\index.tsx"]).status,
    0,
  );
});
test("fails closed without source maps or app sources", () => {
  assert.notEqual(verify(null).status, 0);
  assert.notEqual(verify(["node_modules/expo/index.js"]).status, 0);
});
