import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const dev = process.argv.includes("--dev");
const result = spawnSync(
  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  dev ? ["exec", "vite"] : ["build"],
  {
    stdio: "inherit",
    env: { ...process.env, VITE_TARGET: "desktop" },
    shell: process.platform === "win32",
  },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

function fullPaths(file) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const routes = source.match(/interface FileRoutesByFullPath\s*\{([\s\S]*?)\n\}/)?.[1];
  if (!routes) throw new Error(`Could not read the generated routes in ${file}`);
  return [...routes.matchAll(/^\s+['"]([^'"]+)['"]:/gm)].map(([, path]) => path);
}

if (!dev) {
  const webRoutes = fullPaths("../src/routeTree.gen.ts");
  const desktopRoutes = new Set(fullPaths("../src/generated/routeTree.desktop.gen.ts"));
  const sharedPaths = webRoutes.filter((path) => !/^\/(admin|apply)(\/|$)/.test(path));
  const missing = sharedPaths.filter((path) => !desktopRoutes.has(path));
  if (missing.length) throw new Error(`Web routes missing from desktop: ${missing.join(", ")}`);
  console.log(`Desktop includes all ${sharedPaths.length} shared web routes.`);
}
