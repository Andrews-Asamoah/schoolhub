// Fails the build when the JavaScript every visitor downloads first grows past the budget.
// "Shell" = the entry script, its modulepreloads and everything they import statically.
// Lazy routes and dynamic imports (charts, spreadsheets, PDF) are not counted.
import { existsSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const DIST = new URL("../dist/", import.meta.url).pathname;
const BUDGET_KB = Number(process.env.SHELL_BUDGET_KB ?? 250);
const HEAVY = /^(recharts|exceljs|jspdf|html2canvas)/; // must never be in the shell

if (!existsSync(`${DIST}index.html`)) {
  console.error("Run `pnpm build` first (dist/index.html not found).");
  process.exit(1);
}
const html = readFileSync(`${DIST}index.html`, "utf8");
const roots = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((match) => match[1]);

const shell = new Set();
const visit = (file) => {
  if (shell.has(file) || !existsSync(DIST + file)) return;
  shell.add(file);
  const code = readFileSync(DIST + file, "utf8").replace(/import\("\.\/[^"]+"\)/g, "");
  for (const [, dep] of code.matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)) visit(`assets/${dep}`);
};
roots.forEach(visit);

const kb = [...shell].reduce((sum, file) => sum + gzipSync(readFileSync(DIST + file), { level: 6 }).length, 0) / 1024;
const heavy = [...shell].filter((file) => HEAVY.test(file.replace("assets/", "")));
console.log(`First-load JS: ${kb.toFixed(1)} KB gzip across ${shell.size} files (budget ${BUDGET_KB} KB).`);

if (heavy.length || kb > BUDGET_KB) {
  if (heavy.length) console.error(`Heavy libraries are in the first load: ${heavy.join(", ")}. Load them with import() or React.lazy.`);
  if (kb > BUDGET_KB) console.error(`Over budget by ${(kb - BUDGET_KB).toFixed(1)} KB.`);
  process.exit(1);
}
