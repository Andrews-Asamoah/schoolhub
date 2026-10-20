#!/usr/bin/env node
/**
 * Accessibility audit for the theme itself. Reads the tokens in src/index.css
 * and checks WCAG 2.2 contrast for every foreground/background pairing that
 * components rely on, in BOTH light and dark mode. Run after editing colours:
 *
 *   pnpm --filter @schoolhub/web audit:theme
 *
 * Text pairs must reach 4.5:1 (AA). Focus ring and brand banners need 3:1.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const css = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/index.css"),
  "utf8",
);

function block(selector) {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`Cannot find ${selector} block in index.css`);
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(start, i);
  }
  throw new Error(`Unclosed ${selector} block`);
}

function tokens(text) {
  const out = {};
  for (const m of text.matchAll(/--([a-z0-9-]+):\s*oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)/g)) {
    out[m[1]] = { L: +m[2], C: +m[3], h: +m[4], a: m[5] === undefined ? 1 : +m[5] };
  }
  return out;
}

const light = tokens(block(":root"));
const dark = { ...light, ...tokens(block(".dark")) };

// --- colour maths (OKLCH -> OKLab -> linear sRGB) -------------------------
const toLab = ({ L, C, h }) => ({ L, a: C * Math.cos((h * Math.PI) / 180), b: C * Math.sin((h * Math.PI) / 180) });
const mixLab = (x, y, t) => ({ L: x.L + (y.L - x.L) * t, a: x.a + (y.a - x.a) * t, b: x.b + (y.b - x.b) * t });
function labToLinear({ L, a, b }) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.min(1, Math.max(0, v)));
}
const luminance = (lab) => {
  const [r, g, b] = labToLinear(lab);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (x, y) => {
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
};

const PAIRS = [
  // [foreground, background, minimum, note]
  ["foreground", "background", 4.5],
  ["card-foreground", "card", 4.5],
  ["popover-foreground", "popover", 4.5],
  ["muted-foreground", "background", 4.5],
  ["muted-foreground", "card", 4.5],
  ["muted-foreground", "muted", 4.5],
  ["secondary-foreground", "secondary", 4.5],
  ["accent-foreground", "accent", 4.5],
  ["primary-foreground", "primary", 4.5],
  ["destructive-foreground", "destructive", 4.5],
  ["success-foreground", "success", 4.5],
  ["warning-foreground", "warning", 4.5],
  ["info-foreground", "info", 4.5],
  ["highlight-foreground", "highlight", 4.5],
  ["sidebar-foreground", "sidebar", 4.5],
  ["sidebar-accent-foreground", "sidebar-accent", 4.5],
  ["primary", "card", 4.5, "text-primary on cards"],
  ["primary", "background", 4.5, "text-primary on the page"],
  ["brand-foreground", "brand", 4.5],
  ["brand-foreground", "brand-soft", 3, "large text on the banner gradient end"],
  ["brand-accent", "brand", 4.5],
  ["ring", "background", 3, "focus ring"],
  ["ring", "card", 3, "focus ring"],
];
// Tinted chips: text-<role> on bg-<role>/10 over a card (e.g. status badges).
for (const role of ["primary", "success", "warning", "info", "highlight", "destructive"]) {
  PAIRS.push([role, `${role}/10@card`, 4.5, `text-${role} on bg-${role}/10`]);
}

function resolve(set, name) {
  const tint = /^(.+)\/(\d+)@(.+)$/.exec(name);
  if (tint) {
    const base = toLab(set[tint[3]]);
    return mixLab(base, toLab(set[tint[1]]), +tint[2] / 100);
  }
  if (!set[name]) throw new Error(`Token --${name} is missing`);
  return toLab(set[name]);
}

let failures = 0;
for (const [mode, set] of [["light", light], ["dark", dark]]) {
  console.log(`\n${mode.toUpperCase()} MODE`);
  for (const [fg, bg, min, note] of PAIRS) {
    const ratio = contrast(resolve(set, fg), resolve(set, bg));
    const ok = ratio >= min;
    if (!ok) failures++;
    console.log(`  ${ok ? "pass" : "FAIL"}  ${ratio.toFixed(2).padStart(5)}:1  (min ${min})  ${fg} on ${bg}${note ? "  - " + note : ""}`);
  }
}
console.log(failures ? `\n${failures} pairing(s) below the minimum.` : "\nAll token pairings meet their minimum contrast.");
process.exit(failures ? 1 : 0);
