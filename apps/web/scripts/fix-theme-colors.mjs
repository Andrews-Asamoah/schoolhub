#!/usr/bin/env node
/**
 * Conservative theme-token migration helper.
 * From repo root: node apps/web/scripts/fix-theme-colors.mjs [--write]
 * Dry-run is the default. Review theme-migration-report.txt and git diff.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
const WRITE = process.argv.includes("--write");
const REPORT = path.resolve(process.cwd(), "theme-migration-report.txt");
const palettes = "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const pattern = new RegExp(`(?<![\\w-])((?:[\\w-]+:)*)((?:bg|text|border|border-[xytblrse]|ring|divide|from|via|to|fill|stroke|shadow|placeholder)-(?:${palettes})-\\d{2,3})(?![\\w-])`, "g");

function replacement(raw) {
  const palette = raw.match(new RegExp(`^.*?-(${palettes})-\\d{2,3}$`))?.[1];
  const shade = Number(raw.match(/-(\d{2,3})$/)?.[1]);
  if (!palette || !Number.isFinite(shade)) return null;
  const utility = raw.slice(0, raw.lastIndexOf(`-${palette}-`)).replace(/-[xytblrse]$/, "");
  const neutral = ["slate", "gray", "zinc", "neutral", "stone"].includes(palette);
  const role = ["red", "rose"].includes(palette) ? "destructive"
    : ["green", "emerald", "lime", "teal"].includes(palette) ? "success"
    : ["yellow", "amber", "orange"].includes(palette) ? "warning"
    : ["blue", "cyan", "sky"].includes(palette) ? "info" : "primary";
  if (neutral) {
    if (utility === "bg") return shade <= 50 ? "bg-background" : shade <= 200 ? "bg-muted" : "bg-card";
    if (utility === "text") return shade <= 500 ? "text-muted-foreground" : "text-foreground";
    if (["border", "divide"].includes(utility)) return "border-border";
    if (utility === "ring") return "ring-ring";
    if (utility === "placeholder") return "placeholder:text-muted-foreground";
    if (["from", "via", "to"].includes(utility)) return `${utility}-${shade >= 700 ? "brand" : "primary"}`;
    if (utility === "shadow") return "shadow";
  } else {
    const isBrand = ["indigo", "violet", "purple", "fuchsia", "pink"].includes(palette);
    if (utility === "bg") return shade <= 200 ? `bg-${role}/10` : isBrand && shade >= 800 ? "bg-brand" : `bg-${role}`;
    if (utility === "text") return `text-${role}`;
    if (["border", "divide"].includes(utility)) return `border-${role}/20`;
    if (utility === "ring") return role === "primary" ? "ring-ring" : `ring-${role}`;
    if (["from", "via", "to"].includes(utility)) return `${utility}-${isBrand && shade >= 800 ? "brand" : role}`;
    if (["fill", "stroke"].includes(utility)) return `${utility}-${role}`;
  }
  return null;
}
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file, out);
    else if (/\.(tsx?|jsx?)$/.test(entry.name) && !/routeTree\.gen\.ts$/.test(entry.name)) out.push(file);
  }
  return out;
}
const files = walk(SRC), unresolved = [];
let changed = 0, count = 0;
for (const file of files) {
  const before = fs.readFileSync(file, "utf8");
  const after = before.replace(pattern, (match, prefixes, raw) => {
    const token = replacement(raw);
    if (!token) { unresolved.push(`${path.relative(SRC, file)}: ${match}`); return match; }
    count++;
    // Semantic tokens follow .dark; remove dark: but keep other variants.
    return prefixes.replace(/(?:^|:)dark:/g, part => part.replace("dark:", "")) + token;
  });
  if (after !== before) { changed++; if (WRITE) fs.writeFileSync(file, after); }
}
const report = [`Mode: ${WRITE ? "WRITE" : "DRY RUN"}`, `Files scanned: ${files.length}`,
  `Files ${WRITE ? "changed" : "to change"}: ${changed}`, `Replacements ${WRITE ? "made" : "proposed"}: ${count}`,
  `Unresolved classes: ${unresolved.length}`, "", ...unresolved, ""].join("\n");
fs.writeFileSync(REPORT, report);
console.log(report.split("\n").slice(0, 6).join("\n"));
console.log(`Full report: ${REPORT}`);
if (!WRITE) console.log("Dry run only; review the report before using --write.");
