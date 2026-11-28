#!/usr/bin/env node
/**
 * UI consistency guard. Run by `pnpm lint:theme` and `pnpm build`.
 *
 *  1. No native confirm( / alert( / prompt(  -> use confirmAction() from components/ui/confirm-host
 *     or toast from components/ui/toaster.
 *  2. Use the shared Table primitives or DataTable for application tables.
 *  3. Table cells never set their own padding. Density comes from <Table> (use `dense` for previews),
 *     so every table in the app lines up. Print documents and fixed grids are listed below.
 *
 * A line can opt out with a trailing  // ui-allow: <reason>  comment.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");

/** Only the shared table primitive and the generated print HTML produce raw tables. */
const TABLE_ALLOW = new Set([
  "components/ui/table.tsx",
  "lib/table-export.ts", // builds print-only HTML
]);

/** Print documents and fixed grids that need their own cell spacing. */
const CELL_PADDING_ALLOW = new Set([
  "components/reports/report-card-document.tsx",
  "routes/verify-report.$id.$code.tsx",
  "components/school/timetable-workspace.tsx",
]);
const CELL_PADDING = /<Table(?:Head|Cell)\b[^>]*className=(?:"[^"]*|\{[^}]*)(?<![\w:\[-])(?:p|px|py|pt|pb|pl|pr)-(?:\[[^\]]+\]|[\d.]+)(?![\w\]-])/;

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
for (const file of walk(SRC)) {
  const rel = path.relative(SRC, file).split(path.sep).join("/");
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (line.includes("ui-allow:")) return;
    const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, ""); // ignore comment-only lines
    if (NATIVE_DIALOG.test(code)) {
      failures.push(`${rel}:${index + 1}  native dialog. Use confirmAction() or toast.`);
    }
    if (CELL_PADDING.test(code) && !CELL_PADDING_ALLOW.has(rel)) {
      failures.push(`${rel}:${index + 1}  table cell sets its own padding. Remove it, or use <Table dense>.`);
    }
    if (RAW_TABLE.test(code) && !TABLE_ALLOW.has(rel)) {
      failures.push(`${rel}:${index + 1}  hand-written <table>. Use Table or DataTable.`);
    }
  });
}

if (failures.length) {
  console.error(`UI check failed:\n${failures.map((f) => `  ${f}`).join("\n")}`);
  process.exit(1);
}
console.log("UI check passed.");
