import { readdir, readFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";

const root = resolve(process.argv[2] ?? "dist");
const forbidden = /(?:^|\/)app\/(?:dev-gallery[.]|dev-tabs\/|\(tabs\)\/|\(workspace\)\/|\(superadmin\)\/)/;
let maps = 0;
let appSources = 0;

function inspect(map) {
  for (const source of map.sources ?? []) {
    const path = source.replaceAll("\\", "/");
    if (/(?:^|\/)app\//.test(path)) appSources++;
    if (forbidden.test(path)) throw new Error(`Forbidden release route: ${path}`);
  }
  for (const section of map.sections ?? []) inspect(section.map);
}

async function scan(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const file = join(folder, entry.name);
    if (entry.isDirectory()) await scan(file);
    else if (entry.name.endsWith(".map")) {
      maps++;
      inspect(JSON.parse(await readFile(file, "utf8")));
    } else if (entry.name.endsWith(".hbc")) {
      console.log(`${entry.name}: ${(await stat(file)).size} bytes (Hermes)`);
    }
  }
}

await scan(root);
if (!maps || !appSources) throw new Error("No app source maps found. Export with --source-maps before verifying.");
console.log(`PASS: ${maps} source map(s), ${appSources} app sources; no development, mock or Super Admin routes.`);
