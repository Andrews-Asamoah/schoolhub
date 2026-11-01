import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
// Normalise line endings so the check behaves the same on Windows (CRLF) checkouts.
const source = readFileSync(join(here, "dashboard.controller.ts"), "utf8").replace(/\r\n/g, "\n");
const analyticsRoles = /@Get\("analytics"\)[\s\S]*?@Roles\(([^)]*)\)/.exec(source)?.[1] ?? "";
const roles = [...analyticsRoles.matchAll(/"([^"]+)"/g)].map((match) => match[1]);

describe("DashboardController analytics roles", () => {
  it("allows leadership", () => {
    expect(roles).toEqual(expect.arrayContaining(["owner", "admin", "headteacher"]));
  });

  it("refuses roles that must not see whole-school data", () => {
    for (const role of ["accountant", "teacher", "staff", "guardian", "student"]) expect(roles).not.toContain(role);
  });
});
