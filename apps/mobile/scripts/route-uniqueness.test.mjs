import { strict as assert } from "node:assert";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getExactRoutes } from "expo-router/build/getRoutes";
import test from "node:test";

const appRoot = fileURLToPath(new URL("../app", import.meta.url));

function routeFiles(folder, prefix = ".") {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const absolute = resolve(folder, entry.name);
    const key = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) return routeFiles(absolute, key);
    return /\.[jt]sx?$/.test(entry.name) ? [key] : [];
  });
}

function routeUrl(contextKey) {
  const file = contextKey.replace(/^\.\//, "").replace(/\.[jt]sx?$/, "");
  const segments = file
    .split("/")
    .filter((segment) => !/^\([^/]+\)$/.test(segment));
  if (segments.at(-1) === "index") segments.pop();
  return segments.join("/");
}

function collectRoutes(node, routes = []) {
  if (!node) return routes;
  if (
    (node.type === "route" || node.type === "redirect") &&
    !node.generated &&
    !/(?:^|\/)index\.[jt]sx?$/.test(node.contextKey)
  ) {
    routes.push({ url: routeUrl(node.contextKey), source: node.contextKey });
  }
  for (const child of node.children ?? []) collectRoutes(child, routes);
  return routes;
}

test("Expo Router has no duplicate non-index URLs after removing route groups", () => {
  const context = () => ({});
  context.keys = () => routeFiles(appRoot);
  const tree = getExactRoutes(context, {
    ignoreRequireErrors: true,
    internal_stripLoadRoute: true,
    ignoreEntryPoints: true,
  });
  const routes = collectRoutes(tree);
  const byUrl = new Map();
  for (const route of routes) {
    const sources = byUrl.get(route.url) ?? [];
    sources.push(route.source);
    byUrl.set(route.url, sources);
  }
  const duplicates = [...byUrl]
    .filter(([, sources]) => sources.length > 1)
    .map(([url, sources]) => `${url}: ${sources.join(", ")}`);

  assert.deepEqual(
    duplicates,
    [],
    `Duplicate Expo Router URLs:\n${duplicates.join("\n")}`,
  );
  assert.deepEqual(byUrl.get("login"), ["./(auth)/login.tsx"]);
  assert.deepEqual(byUrl.get("school"), ["./(auth)/school.tsx"]);
});
