#!/usr/bin/env node
/**
 * One-off migration: raw Tailwind colours -> theme tokens.
 *
 *   node scripts/migrate-theme-tokens.mjs --dry     # report only
 *   node scripts/migrate-theme-tokens.mjs           # rewrite files in src/
 *
 * Rewrites class strings such as `bg-white text-slate-500 dark:bg-slate-900`
 * into token classes (`bg-card text-muted-foreground`), dropping the dark:
 * duplicates the tokens make unnecessary. It only touches string literals found
 * by a real parser, so code and comments are never altered. Safe to re-run:
 * already-migrated classes are ignored. Run it again after merging branches
 * that still contain raw colours, then `pnpm lint:theme` to confirm.
 *
 * Needs @babel/parser. It is found automatically in a pnpm install; otherwise:
 *   pnpm --filter @schoolhub/web add -D @babel/parser
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(here, "..");
const require = createRequire(import.meta.url);

function loadParser() {
  try { return require("@babel/parser"); } catch {}
  // pnpm keeps transitive packages under node_modules/.pnpm
  let dir = WEB;
  for (let i = 0; i < 6; i++) {
    const store = path.join(dir, "node_modules", ".pnpm");
    if (fs.existsSync(store)) {
      const hit = fs.readdirSync(store).filter((n) => n.startsWith("@babel+parser@")).sort().pop();
      if (hit) return require(path.join(store, hit, "node_modules", "@babel", "parser"));
    }
    dir = path.dirname(dir);
  }
  console.error("Cannot find @babel/parser. Run: pnpm --filter @schoolhub/web add -D @babel/parser");
  process.exit(2);
}
const { parse } = loadParser();

const ROOT = path.join(WEB, "src");
const DRY = process.argv.includes("--dry");

const NEUTRAL = new Set(["slate", "gray", "zinc", "neutral", "stone"]);
const HUE = {
  indigo: "primary", blue: "primary",
  sky: "info", cyan: "info",
  emerald: "success", green: "success", teal: "success", lime: "success",
  amber: "warning", yellow: "warning", orange: "warning",
  rose: "destructive", red: "destructive",
  violet: "highlight", purple: "highlight", fuchsia: "highlight", pink: "highlight",
};
const PAL = [...NEUTRAL, ...Object.keys(HUE)].join("|");
const UTIL = "bg|text|border|border-[xytblrse]|ring|ring-offset|divide|from|via|to|fill|stroke|shadow|outline|decoration|accent|caret|placeholder";
const BASE = new RegExp(`^(${UTIL})-(white|black|(${PAL})-(\\d{2,3}))(?:/(\\d{1,3}|\\[[0-9.]+\\]))?$`);
const SEMANTIC = /^(bg|text|border|ring|divide|from|via|to|fill|stroke|shadow|outline)-(background|foreground|card|card-foreground|popover|popover-foreground|primary|primary-foreground|secondary|secondary-foreground|muted|muted-foreground|accent|accent-foreground|destructive|destructive-foreground|border|input|ring|success|success-foreground|warning|warning-foreground|info|info-foreground|highlight|highlight-foreground|sidebar|sidebar-foreground|sidebar-border|sidebar-accent)(\/\d+)?$/;

const stats = { mapped: 0, droppedDark: 0, keptRaw: 0, leftover: new Map() };

function splitVariants(tok) {
  const parts = []; let depth = 0, cur = "";
  for (const ch of tok) {
    if (ch === "[") depth++; if (ch === "]") depth--;
    if (ch === ":" && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
  }
  return { variants: parts, base: cur };
}
const family = (u) => (u.startsWith("border") ? "border" : u);
const HOVERISH = new Set(["hover", "focus", "active", "focus-visible", "group-hover", "peer-hover", "focus-within"]);

function mapColor({ util, color, shade, alpha, dark, interactive }, ctx) {
  const n = shade ? Number(shade) : null;
  const A = alpha ? `/${alpha}` : "";
  const fam = family(util);
  // ---- white / black
  if (color === "white") {
    if (dark) return { fg: ["bg", "text", "border", "ring", "divide", "outline", "decoration", "fill", "stroke"].includes(fam) ? "foreground" : null };
    const a = alpha ? (alpha.startsWith("[") ? parseFloat(alpha.slice(1, -1)) * 100 : Number(alpha)) : 100;
    if (fam === "bg") return a >= 50 ? { v: `card${A}` } : null;           // glass surface vs translucent overlay
    if (fam === "ring") return a >= 50 ? { v: `background${A}` } : null;
    if (fam === "text") {
      if (ctx.inverse) return { v: `background${A}` };
      if (ctx.solid) return { v: `${ctx.solid}-foreground${A}` };
      return null;
    }
    if (fam === "from" || fam === "via" || fam === "to") return a >= 50 ? { v: `card${A}` } : null;
    return null;
  }
  if (color === "black") return null;
  const neutral = NEUTRAL.has(color);
  const tok = neutral ? null : HUE[color];

  if (neutral) {
    if (fam === "bg" || fam === "from" || fam === "via" || fam === "to") {
      if (dark) { // dark-only surfaces
        if (n >= 950) return { v: `background${A}` };
        if (n >= 900) return { v: `card${A}` };
        if (n >= 800) return { v: `muted${A}` };
        if (n >= 700) return { v: `secondary${A}` };
        if (n >= 400) return { v: `muted-foreground${A}` };
        return { v: `foreground${A}` };
      }
      if (n === 50) return { v: ctx.screen ? "background" : `muted${alpha ? A : "/50"}` };
      if (n === 100) return { v: `muted${A}` };
      if (n === 200) return { v: `muted-foreground/20` };
      if (n === 300) return { v: `muted-foreground/30` };
      if (n <= 600) return { v: `muted-foreground${A}` };
      if (n === 700) return { v: `foreground/80${""}` };
      return { v: `foreground${A}` };
    }
    if (fam === "text" || fam === "placeholder" || fam === "decoration" || fam === "caret" || fam === "accent") {
      if (ctx.inverse && !dark) {
        if (n <= 200) return { v: `background${A}` };
        if (n === 300) return { v: `background/70` };
        return { v: `background/60` };
      }
      if (dark) { if (n <= 200) return { v: `foreground${A}` }; if (n === 300) return { v: `foreground/80` }; return { v: `muted-foreground${A}` }; }
      if (n >= 800) return { v: `foreground${A}` };
      if (n === 700) return { v: `foreground/80` };
      if (n >= 500) return { v: `muted-foreground${A}` };
      if (n === 400) return { v: `muted-foreground/70` };
      return { v: `muted-foreground/50` };
    }
    if (fam === "border" || fam === "divide" || fam === "outline") {
      if (n <= 100) return { v: `border/60` };
      if (n === 200) return { v: `border${A}` };
      if (n === 300) return { v: `input${A}` };
      if (n === 400) return { v: `muted-foreground/40` };
      if (n >= 700) return { v: `border${A}` };
      return { v: `muted-foreground/60` };
    }
    if (fam === "ring" || fam === "ring-offset") {
      if (n <= 300) return { v: `border${A}` };
      return { v: `foreground${alpha ? A : "/10"}` };
    }
    if (fam === "shadow") return { v: `foreground${alpha ? A : "/10"}` };
    if (fam === "fill" || fam === "stroke") {
      if (n >= 700) return { v: `foreground${A}` };
      if (n >= 400) return { v: `muted-foreground${A}` };
      return { v: `border${A}` };
    }
    return null;
  }
  // ---- coloured hues
  if (!tok) return null;
  if (fam === "bg") {
    if (n <= 50) return { v: `${tok}/10` };
    if (n === 100) return { v: `${tok}/15` };
    if (n === 200) return { v: `${tok}/20` };
    if (n === 300) return { v: `${tok}/30` };
    if (interactive && n >= 600) return { v: `${tok}/90` };
    if (n === 400) return { v: `${tok}${alpha ? A : "/80"}` };
    return { v: `${tok}${A}` };
  }
  if (fam === "from" || fam === "via" || fam === "to") {
    if (n <= 50) return { v: `${tok}/10` };
    if (n <= 200) return { v: `${tok}/20` };
    if (n === 300) return { v: `${tok}/30` };
    if (n === 400) return { v: `${tok}/60` };
    return { v: `${tok}${A}` };
  }
  if (fam === "text" || fam === "placeholder") {
    if (ctx.solid && !dark && n <= 400) {
      const a = n <= 50 ? "" : n <= 200 ? "/80" : n === 300 ? "/70" : "/60";
      return { v: `${ctx.solid}-foreground${a}` };
    }
    if (n <= 50) return { v: `${tok}-foreground${A}` };
    if (n <= 200) return { v: `${tok}-foreground/80` };
    return { v: `${tok}${A}` };
  }
  if (fam === "border" || fam === "divide" || fam === "ring" || fam === "outline" || fam === "ring-offset") {
    if (n <= 200) return { v: `${tok}/20` };
    if (n === 300) return { v: `${tok}/30` };
    if (n === 400) return { v: `${tok}/50` };
    return { v: `${tok}${A}` };
  }
  if (fam === "shadow") return { v: `${tok}${alpha ? A : "/25"}` };
  if (fam === "fill" || fam === "stroke") return { v: `${tok}${n <= 200 ? "/20" : A}` };
  if (fam === "decoration" || fam === "caret" || fam === "accent") return { v: `${tok}${A}` };
  return null;
}

function transformGroup(texts) {
  const partsList = texts.map((t) => t.split(/(\s+)/));
  const toks = [];
  partsList.forEach((parts, li) => parts.forEach((p, i) => {
    if (!p || /^\s+$/.test(p)) return;
    const { variants, base0 } = (() => { const r = splitVariants(p); return { variants: r.variants, base0: r.base }; })();
    const important = base0.startsWith("!");
    const base = important ? base0.slice(1) : base0;
    const m = BASE.exec(base);
    const t = { li, i, raw: p, variants, important, base, m, sem: SEMANTIC.test(base) };
    if (m) {
      t.util = m[1]; t.color = m[3] ? m[3] : m[2]; t.shade = m[4]; t.alpha = m[5];
      t.dark = variants.includes("dark");
      t.vkey = variants.filter((v) => v !== "dark").join(":");
      t.fam = family(t.util);
    } else if (SEMANTIC.test(base)) {
      const sm = SEMANTIC.exec(base);
      t.fam = family(sm[1]);
      t.dark = variants.includes("dark");
      t.vkey = variants.filter((v) => v !== "dark").join(":");
    }
    toks.push(t);
  }));
  if (!toks.some((t) => t.m)) return texts;

  // context from non-dark, non-interactive tokens
  const plain = toks.filter((t) => !t.dark && t.variants.length === 0);
  const ctx = { inverse: false, solid: null, screen: toks.some((t) => /^(min-h-screen|h-screen)$/.test(t.base)) };
  for (const t of plain) {
    if (!t.m) continue;
    const isBgLike = ["bg", "from", "via", "to"].includes(t.fam);
    if (!isBgLike) continue;
    if (NEUTRAL.has(t.color) && Number(t.shade) >= 800 && !t.alpha) ctx.inverse = true;
    if (HUE[t.color] && Number(t.shade) >= 500 && (!t.alpha || Number(t.alpha) >= 60)) ctx.solid = ctx.solid ?? HUE[t.color];
  }

  // semantic counterparts that already adapt to the theme
  const adapt = new Set();
  const results = new Map();
  for (const t of toks) {
    if (t.m && !t.dark) {
      const interactive = t.variants.some((v) => HOVERISH.has(v));
      const r = mapColor({ util: t.util, color: t.color, shade: t.shade, alpha: t.alpha, dark: false, interactive }, ctx);
      results.set(t, r);
      if (r && r.v) adapt.add(`${t.vkey}|${t.fam}`);
    } else if (!t.m && t.sem && !t.dark) adapt.add(`${t.vkey}|${t.fam}`);
  }
  for (const t of toks) {
    if (t.m && t.dark) {
      if (adapt.has(`${t.vkey}|${t.fam}`)) { results.set(t, { drop: true }); continue; }
      const interactive = t.variants.some((v) => HOVERISH.has(v));
      if (t.color === "white") { // dark-only white overlay: express through foreground
        results.set(t, mapColor({ util: t.util, color: "white", alpha: t.alpha, dark: true }, ctx) ? { v: `${(mapColor({ util: t.util, color: "white", alpha: t.alpha, dark: true }, ctx)).fg}${t.alpha ? "/" + t.alpha : ""}` } : null);
      } else {
        results.set(t, mapColor({ util: t.util, color: t.color, shade: t.shade, alpha: t.alpha, dark: true, interactive }, ctx));
      }
    }
  }

  return partsList.map((parts, li) => {
    const out = [];
    parts.forEach((p, i) => {
      if (!p) return;
      if (/^\s+$/.test(p)) { out.push({ ws: p }); return; }
      const t = toks.find((x) => x.li === li && x.i === i);
      const r = t && results.get(t);
      if (r && r.drop) { stats.droppedDark++; out.push({ drop: true }); return; }
      if (r && r.v) {
        const v = [...t.variants, `${t.important ? "!" : ""}${t.util}-${r.v}`].join(":");
        stats.mapped++; out.push({ tok: v }); return;
      }
      if (t && t.m) {
        const key = t.base; stats.keptRaw++; stats.leftover.set(key, (stats.leftover.get(key) ?? 0) + 1);
      }
      out.push({ tok: p });
    });
    let s = ""; const seen = new Set(); let pendingWs = "";
    for (const o of out) {
      if (o.ws !== undefined) { pendingWs = pendingWs || o.ws; continue; }
      if (o.drop) continue;
      const last = o.tok.split(/:(?![^\[]*\])/).pop().replace(/^!/, "");
      if (seen.has(o.tok) && SEMANTIC.test(last)) { pendingWs = ""; continue; }
      seen.add(o.tok);
      s += (s ? (pendingWs || " ") : pendingWs) + o.tok;
      pendingWs = "";
    }
    const text = texts[li];
    const lead = /^\s*/.exec(text)[0]; const trail = /\s*$/.exec(text)[0];
    return lead + (s + pendingWs).trim() + trail;
  });
}

const CLASS_FNS = new Set(["cn", "clsx", "twMerge", "cx", "classNames", "twJoin"]);
function collect(node, acc, group) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { node.forEach((n) => collect(n, acc, group)); return; }
  if (node.type === "StringLiteral") acc.push({ start: node.start + 1, end: node.end - 1, group });
  else if (node.type === "TemplateElement") acc.push({ start: node.start, end: node.end, group });
  let g = group;
  if (node.type === "JSXAttribute" || node.type === "ObjectProperty" || node.type === "VariableDeclarator" || node.type === "ReturnStatement") g = node;
  else if (node.type === "CallExpression" && node.callee?.type === "Identifier" && CLASS_FNS.has(node.callee.name)) g = node;
  for (const k of Object.keys(node)) {
    if (k === "loc" || k === "leadingComments" || k === "trailingComments") continue;
    const v = node[k]; if (v && typeof v === "object") collect(v, acc, g);
  }
}

function walkDir(dir, files = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkDir(p, files);
    else if (/\.(tsx?|jsx?)$/.test(e.name) && !/routeTree\.gen\.ts$/.test(e.name)) files.push(p);
  }
  return files;
}


const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const write = (p, s) => { if (!DRY) fs.writeFileSync(path.join(ROOT, p), s); };
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const notes = [];

/* ---------------------------------------------------------------------------
   Phase 2: banners. Surfaces that stay dark in both themes use the fixed
   brand-* tokens; portal banners use their own hue's -foreground token.
--------------------------------------------------------------------------- */
function brandify(t) {
  return t
    .replaceAll("bg-[#101d48]", "bg-brand")
    .replaceAll("from-[#111d48] via-[#1e3475] to-[#3158aa]", "from-brand via-brand-mid to-brand-soft")
    .replace(/\b(text|bg|border|ring)-white\b/g, "$1-brand-foreground")
    .replace(/\b(text|bg|border|ring)-white\//g, "$1-brand-foreground/")
    .replace(/\btext-(primary|info|success|warning|highlight)-foreground\b/g, "text-brand-foreground")
    .replace(/text-info(?=["\s])/g, "text-brand-accent")
    .replaceAll("bg-info/30", "bg-brand-accent/20")
    .replaceAll("from-info/20 via-primary/20 to-primary/20", "from-brand-accent via-brand-accent to-brand-foreground")
    .replaceAll("from-primary/60 to-info/20", "from-brand-soft to-brand-accent")
    .replace(/\bshadow-(primary|info)\/(\d+)/g, "shadow-brand/$2")
    .replaceAll("#4169e1", "var(--brand-glow)")
    .replaceAll("#0ea5e9", "var(--brand-soft)");
}

function bannerRange(lines, anchor, closer) {
  const a = lines.findIndex((l) => anchor.test(l));
  if (a < 0) return null;
  const indent = lines[a].length - lines[a].trimStart().length;
  let b = -1;
  for (let i = a + 1; i < lines.length; i++) {
    if (closer(lines[i]) && lines[i].length - lines[i].trimStart().length === indent) { b = i; break; }
  }
  return b < 0 ? null : [a, b];
}

function fixBanners() {
  // login hero (a <section> that closes at the same indentation)
  if (exists("routes/login.tsx")) {
    const lines = read("routes/login.tsx").split("\n");
    const r = bannerRange(lines, /bg-\[#101d48\]/, (l) => l.trim() === "</section>");
    if (r) { for (let i = r[0]; i <= r[1]; i++) lines[i] = brandify(lines[i]); write("routes/login.tsx", lines.join("\n")); }
    else if (/#101d48/.test(lines.join("\n"))) notes.push("routes/login.tsx: hero banner not found, convert its colours to brand-* tokens by hand.");
  }
  if (exists("routes/admin/dashboard.tsx")) {
    const lines = read("routes/admin/dashboard.tsx").split("\n");
    const r = bannerRange(lines, /from-\[#111d48\]/, (l) => l.trim() === "</section>");
    if (r) {
      for (let i = r[0]; i <= r[1]; i++) { if (!lines[i].includes("superadmin-button-secondary")) lines[i] = brandify(lines[i]); else lines[i] = lines[i].replaceAll("border-white/70", "border-brand-foreground/70"); }
      write("routes/admin/dashboard.tsx", lines.join("\n"));
    }
  }
  // portal banners: white overlays become the banner's own foreground token
  const HERO = { guardian: "primary-foreground", teacher: "primary-foreground", student: "highlight-foreground", accountant: "background" };
  const ACC = /text-(success|warning|info|highlight|primary|destructive)(?![-\w/])/g;
  for (const [name, fg] of Object.entries(HERO)) {
    const file = `components/portal/${name}-portal-workspace.tsx`;
    if (!exists(file)) continue;
    const lines = read(file).split("\n");
    const r = bannerRange(lines, /rounded-3xl bg-gradient-to-br from-/, (l) => l.trim().startsWith("</div>"));
    if (r) {
      for (let i = r[0]; i <= r[1]; i++) {
        lines[i] = lines[i].replace(/(className|class)="[^"]*"/g, (c) => {
          if (c.includes("bg-card")) return c;
          return c
            .replace(/\b(text|bg|border|ring)-white\b/g, `$1-${fg}`)
            .replace(/\b(text|bg|border|ring)-white\//g, `$1-${fg}/`)
            .replace(ACC, `text-${fg}`);
        });
        lines[i] = lines[i].replaceAll("hover:bg-white/20", `hover:bg-${fg}/20`);
      }
    }
    const chip = fg === "background" ? "success-foreground" : "primary-foreground";
    write(file, lines.join("\n").replaceAll('isActive ? "bg-white/20 text-white"', `isActive ? "bg-${chip}/20 text-${chip}"`));
  }
}

function replaceIn(file, pairs) {
  if (!exists(file)) return;
  let s = read(file);
  for (const [from, to] of pairs) s = s.replaceAll(from, to);
  write(file, s);
}

function fixSmall() {
  replaceIn("components/portal/portal-stat-card.tsx", [["text-white shadow-sm", "text-background shadow-sm"]]);
  replaceIn("components/ui/sidebar-user-menu.tsx", [["ring-black/5 backdrop-blur-xl dark:ring-foreground/5", "ring-foreground/5 backdrop-blur-xl"], ["ring-black/5", "ring-foreground/5"]]);
  for (const f of walkDir(ROOT)) {
    const rel = path.relative(ROOT, f).split(path.sep).join("/");
    const s = fs.readFileSync(f, "utf8");
    if (s.includes("bg-black/40")) write(rel, s.replaceAll("bg-black/40", "bg-overlay"));
  }
  replaceIn("routes/admin/profile.tsx", [["bg-white/10 ring-1 ring-white/20", "bg-primary-foreground/10 ring-1 ring-primary-foreground/20"]]);
  replaceIn("components/school/school-workspace-layout.tsx", [["bg-[#f7f8fc]", "bg-background"]]);
}

/* --------------------------------- run --------------------------------- */
const stats2 = { files: 0 };
let changedFiles = 0;
for (const file of walkDir(ROOT)) {
  const src = fs.readFileSync(file, "utf8");
  let ast;
  try { ast = parse(src, { sourceType: "module", plugins: ["typescript", "jsx"], errorRecovery: true }); }
  catch (e) { console.error("PARSE FAIL", file, e.message); continue; }
  const lits = []; collect(ast.program, lits, null);
  const CAND = /(?:bg|text|border|ring|divide|from|via|to|fill|stroke|shadow|outline|decoration|accent|caret|placeholder)-(?:white|black|[a-z]+-\d{2,3})/;
  const groups = new Map();
  for (const l of lits) { if (!l.group) continue; if (!groups.has(l.group)) groups.set(l.group, []); groups.get(l.group).push(l); }
  const edits = [];
  for (const ls of groups.values()) {
    if (!ls.some((l) => CAND.test(src.slice(l.start, l.end)))) continue;
    const texts = ls.map((l) => src.slice(l.start, l.end));
    const next = transformGroup(texts);
    ls.forEach((l, i) => { if (next[i] !== texts[i]) edits.push({ start: l.start, end: l.end, text: next[i] }); });
  }
  for (const l of lits) { if (l.group) continue; const t = src.slice(l.start, l.end); if (!CAND.test(t)) continue; const [n] = transformGroup([t]); if (n !== t) edits.push({ start: l.start, end: l.end, text: n }); }
  edits.sort((a, b) => b.start - a.start);
  let out = src;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  if (out !== src) { changedFiles++; if (!DRY) fs.writeFileSync(file, out); }
}
if (!DRY) { fixBanners(); fixSmall(); }

console.log(`${DRY ? "[dry run] " : ""}class strings rewritten in ${changedFiles} file(s): ${stats.mapped} classes mapped to tokens, ${stats.droppedDark} redundant dark: overrides removed.`);
const left = [...stats.leftover.entries()].sort((a, b) => b[1] - a[1]);
if (left.length && !DRY) console.log("Left for manual review (translucent white/black overlays):", left.map(([k, v]) => `${k} x${v}`).join(", "));
for (const n of notes) console.log("NOTE:", n);
console.log(DRY ? "" : "Next: pnpm --filter @schoolhub/web lint:theme  (lists anything still using raw colours)");
