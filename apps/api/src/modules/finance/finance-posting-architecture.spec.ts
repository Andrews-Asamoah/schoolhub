import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

describe("P0 one posting door", () => {
  it("does not let the legacy finance service write ledger rows or account balances", () => {
    const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "finance.service.ts"), "utf8");
    expect(source).not.toMatch(/\btx\.transaction\.create\s*\(/);
    expect(source).not.toMatch(/\btx\.chartAccount\.update\s*\(/);
    expect(source).not.toMatch(/FINANCE_ALLOW_SELF_APPROVAL/);
    expect(source).toContain("this.postingService.post(tx,");
  });
});
