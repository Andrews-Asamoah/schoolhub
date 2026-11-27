#!/usr/bin/env node
/**
 * UI consistency guard. Run by `pnpm lint:theme` and `pnpm build`.
 *
 *  1. No native confirm( / alert( / prompt(  -> use confirmAction() from components/ui/confirm-host
 *     or toast from components/ui/toaster.
 *  2. No hand-written <table outside the allow-list -> use DataTable or SimpleTable.
 *     Files in TABLE_BASELINE still contain legacy tables. The list may only shrink: migrate a file,
 *     then delete its line. New files are never added to it.
 *
 * A line can opt out with a trailing  // ui-allow: <reason>  comment.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const baselinePath = path.join(ROOT, "scripts", "ui-table-baseline.json");

/** Permanent exceptions: layouts that are not data tables. */
const TABLE_ALLOW = new Set([
  "components/ui/table.tsx",
  "components/ui/data-table.tsx",
  "components/ui/simple-table.tsx",
  "lib/table-export.ts", // builds print-only HTML
]);
const baseline = new Set(fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, "utf8")) : []);

const NATIVE_DIALOG = /(?<![\w.$])(?:window\.)?(?:confirm|alert|prompt)\(/;
const RAW_TABLE = /<table[\s>]/;

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(tsx?|jsx?)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name) && entry.name !== "routeTree.gen.ts") yield full;
  }
}

const failures = [];
const stillLegacy = new Set();
for (const file of walk(SRC)) {
  const rel = path.relative(SRC, file).split(path.sep).join("/");
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (line.includes("ui-allow:")) return;
    const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, ""); // ignore comment-only lines
    if (NATIVE_DIALOG.test(code)) {
      failures.push(`${rel}:${index + 1}  native dialog. Use confirmAction() or toast.`);
    }
    if (RAW_TABLE.test(code) && !TABLE_ALLOW.has(rel)) {
      if (baseline.has(rel)) stillLegacy.add(rel);
      else failures.push(`${rel}:${index + 1}  hand-written <table>. Use DataTable or SimpleTable.`);
    }
  });
}

const migrated = [...baseline].filter((rel) => !stillLegacy.has(rel));
if (migrated.length) {
  failures.push(
    `Baseline is out of date. These files no longer contain a raw <table>; remove them from scripts/ui-table-baseline.json:\n  ${migrated.join("\n  ")}`,
  );
}

if (failures.length) {
  console.error(`UI check failed:\n${failures.map((f) => `  ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`UI check passed (${stillLegacy.size} legacy table file(s) still to migrate).`);
