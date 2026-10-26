import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(here, "../..");
const DOOR = "finance-posting.service.ts";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "node_modules" ? [] : sourceFiles(full);
    return full.endsWith(".ts") && !full.endsWith(".spec.ts") && !full.endsWith(".d.ts") ? [full] : [];
  });
}

// Any client handle (tx, db, prisma.client, this.prisma.client) writing ledger rows or balances.
const LEDGER_WRITE = /\b(?:transaction\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)|chartAccount\.(?:update|updateMany|upsert))\s*\(/;
const RAW_LEDGER_WRITE = /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"?(?:transactions|chart_accounts)"?\b/i;

describe("P0 one posting door", () => {
  it("lets only FinancePostingService write ledger rows or cached account balances, anywhere in the API", () => {
    const offenders = sourceFiles(srcRoot)
      .filter(file => !file.endsWith(DOOR))
      .filter(file => { const text = readFileSync(file, "utf8"); return LEDGER_WRITE.test(text) || RAW_LEDGER_WRITE.test(text); })
      .map(file => relative(srcRoot, file));
    expect(offenders).toEqual([]);
  });

  it("detects a deliberate violation (the rule itself is working)", () => {
    expect(LEDGER_WRITE.test("await this.prisma.client.transaction.create({ data })")).toBe(true);
    expect(LEDGER_WRITE.test("await tx.chartAccount.update({ where })")).toBe(true);
    expect(RAW_LEDGER_WRITE.test('UPDATE "chart_accounts" SET balance = 1')).toBe(true);
    expect(LEDGER_WRITE.test("await tx.payment.create({ data })")).toBe(false);
  });

  it("keeps the legacy finance service on the posting door and free of the self-approval env bypass", () => {
    const source = readFileSync(join(here, "finance.service.ts"), "utf8");
    expect(source).not.toMatch(/FINANCE_ALLOW_SELF_APPROVAL/);
    expect(source).toContain("this.postingService.post(tx,");
  });

  it("never reads the self-approval environment flag anywhere", () => {
    const offenders = sourceFiles(srcRoot).filter(f => /FINANCE_ALLOW_SELF_APPROVAL/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
