import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(
  new URL("../src/theme/palette.ts", import.meta.url),
  "utf8",
);
const code = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { modulePalette, hueValues, neutrals, contrast, brandPalette, blend } =
  await import(
    "data:text/javascript;base64," + Buffer.from(code).toString("base64")
  );
const tokenSource = readFileSync(
  new URL("../src/theme/tokens.generated.ts", import.meta.url),
  "utf8",
);
const tokenCode = ts.transpileModule(tokenSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const tokens = await import(
  "data:text/javascript;base64," + Buffer.from(tokenCode).toString("base64")
);
let count = 0;
const failures = [];
function check(name, fg, bg, min = 4.5) {
  count++;
  const ratio = contrast(fg, bg);
  if (ratio < min) failures.push(`${name}: ${ratio.toFixed(2)} < ${min}`);
}
for (const scheme of ["light", "dark"]) {
  const n = neutrals[scheme];
  const c = tokens[scheme + "Tokens"];
  for (const name of [
    "primary",
    "secondary",
    "accent",
    "destructive",
    "success",
    "warning",
    "info",
    "highlight",
  ])
    check(`${scheme} semantic ${name}`, c[name + "Foreground"], c[name]);
  for (const name of ["destructive", "success", "warning", "info"])
    check(`${scheme} semantic ${name} text`, c[name], n.card);

  for (const surface of [n.background, n.card, n.elevated])
    for (const fg of [n.foreground, n.mutedForeground])
      check(`${scheme} neutral`, fg, surface);
  for (const hue of Object.keys(hueValues)) {
    const p = modulePalette(hue, scheme);
    for (const surface of [n.card, n.elevated, p.tint])
      check(`${scheme} ${hue} ink`, p.ink, surface);
    check(`${scheme} ${hue} pill`, p.onSolid, p.solid);
    for (let i = 0; i <= 20; i++)
      check(
        `${scheme} ${hue} gradient`,
        p.onSolid,
        blend(...p.gradient, i / 20),
      );
    check(`${scheme} ${hue} chart`, p.ink, n.card, 3);
  }
  // Include hostile tenant colours; gradients, focus, and chrome compositing.
  for (const primary of [
    "#fff",
    "#000",
    "#ff0",
    "#0ff",
    "#f00",
    "#4338CA",
    "#808080",
    "invalid",
  ]) {
    const b = brandPalette(primary, "#00FFFF", scheme);
    check(`${scheme} focus`, b.focus, n.card, 3);
    // Worst overlapping static backdrop blobs at each opaque gradient stop.
    const a = scheme === "dark" ? 0.06 : 0.025,
      z = scheme === "dark" ? 0.04 : 0.02;
    for (const stop of [
      n.background,
      blend(n.background, b.focus, a),
      blend(n.background, b.gradient[1], z),
    ]) {
      const bg = blend(blend(stop, b.focus, a), b.gradient[1], z);
      check(`${scheme} backdrop body`, n.foreground, bg);
      check(`${scheme} backdrop muted`, n.mutedForeground, bg);
    }

    for (let i = 0; i <= 20; i++) {
      const bg = blend(...b.gradient, i / 20);
      check(`${scheme} hero`, b.onSolid, bg);
      const glass = blend(bg, n.card, 0.94);
      check(`${scheme} chrome body`, n.foreground, glass);
      check(`${scheme} chrome muted`, n.mutedForeground, glass);
    }
  }
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `PASS: ${count} text, icon, gradient and composited chrome contrast pairs across light/dark themes.`,
  );
