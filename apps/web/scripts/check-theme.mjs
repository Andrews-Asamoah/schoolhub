#!/usr/bin/env node
/**
 * Theme guard: fails when a component hard-codes a colour instead of using the
 * theme tokens defined in src/index.css. Run by `pnpm lint:theme` and as part
 * of `pnpm build`, so raw colours cannot reach production unnoticed.
 *
 *   bg-white  text-slate-500  bg-indigo-600  dark:bg-slate-900   -> bg-card  text-muted-foreground  bg-primary
 *   text-white  bg-black/40                                         -> text-primary-foreground  bg-overlay
 *   bg-[#fff]  style={{ color: "#333" }}                            -> a token (bg-card, text-foreground)
 *
 * A line that is genuinely data-driven (e.g. a user-chosen swatch) can opt out
 * with a trailing  // theme-allow: <reason>  comment, or an entry in ALLOW.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const UTILS =
  "bg|text|border|border-[xytblrse]|ring|ring-offset|divide|from|via|to|fill|stroke|shadow|outline|decoration|accent|caret|placeholder";

const RULES = [
  {
    id: "palette-colour",
    re: new RegExp(`(?<![\\w-])(?:${UTILS})-(?:${PALETTE})-\\d{2,3}(?![\\w-])`, "g"),
    hint: "Use a semantic token: text-foreground, text-muted-foreground, bg-card, bg-muted, border-border, bg-primary, text-success, bg-destructive/10 ...",
  },
  {
    id: "white-black",
    re: new RegExp(`(?<![\\w-])(?:${UTILS})-(?:white|black)(?![\\w-])`, "g"),
    hint: "Use bg-card / text-primary-foreground / bg-overlay / bg-foreground/10 (or text-brand-foreground on fixed brand banners).",
  },
  {
    id: "arbitrary-colour",
    re: new RegExp(`(?<![\\w-])(?:${UTILS})-\\[(?:#|rgb|hsl|oklch|color-mix)`, "g"),
    hint: "Arbitrary colour values bypass the theme. Add or reuse a token in src/index.css.",
  },
  {
    id: "inline-style-colour",
    re: /\b(?:color|background|backgroundColor|borderColor|fill|stroke)\s*:\s*["'`]#[0-9a-fA-F]{3,8}["'`]/g,
    hint: "Use a CSS variable: style={{ color: 'var(--primary)' }} or a token class.",
  },
];

/** [file regex, rule id, line regex] - narrow, documented exceptions only. */
const ALLOW = [
  // House colour swatches are chosen by the school (data), text on them must stay white.
  [/school\/houses-workspace\.tsx$/, "white-black", /text-white/],
  // The default for a school-chosen house colour (stored in the database, shown in a colour picker).
  [/school\/houses-workspace\.tsx$/, "inline-style-colour", /#[0-9a-fA-F]{6}/],
];

const CSS_RULES = [
  {
    test: (css) => /@custom-variant\s+dark\s*\(&:where\(\.dark,\s*\.dark \*\)\)/.test(css),
    message:
      "index.css must declare `@custom-variant dark (&:where(.dark, .dark *));` so dark: follows the app theme, not the OS.",
    expect: true,
  },
  {
    test: (css) => /prefers-color-scheme/.test(css),
    message: "index.css must not use prefers-color-scheme: the app theme is controlled by the .dark class only.",
    expect: false,
  },
  {
    test: (css) => /color-scheme:\s*light\s+dark/.test(css),
    message: "Do not set `color-scheme: light dark`: it makes native controls follow the OS instead of the app theme.",
    expect: false,
  },
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(entry.name) && !/routeTree\.gen\.ts$/.test(entry.name)) out.push(full);
  }
  return out;
}

const problems = [];
for (const file of walk(SRC)) {
  const rel = path.relative(SRC, file).split(path.sep).join("/");
  fs.readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (/theme-allow:/.test(line)) return;
      for (const rule of RULES) {
        for (const m of line.matchAll(rule.re)) {
          const allowed = ALLOW.some(([f, id, l]) => f.test(rel) && id === rule.id && l.test(line));
          if (!allowed) problems.push({ rel, line: i + 1, rule, found: m[0] });
        }
      }
    });
}

const cssPath = path.join(SRC, "index.css");
const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, "utf8") : "";
const cssProblems = CSS_RULES.filter((r) => r.test(css) !== r.expect);

if (problems.length === 0 && cssProblems.length === 0) {
  console.log("theme check passed: no raw colours in components.");
  process.exit(0);
}

console.error("\nTheme check failed. Components must use theme tokens (see THEMING.md).\n");
for (const p of problems) {
  console.error(`  ${p.rel}:${p.line}  ${p.found}   [${p.rule.id}]`);
}
const hints = new Map(problems.map((p) => [p.rule.id, p.rule.hint]));
for (const [id, hint] of hints) console.error(`\n  ${id}: ${hint}`);
for (const p of cssProblems) console.error(`\n  index.css: ${p.message}`);
console.error(`\n${problems.length + cssProblems.length} problem(s).`);
process.exit(1);
