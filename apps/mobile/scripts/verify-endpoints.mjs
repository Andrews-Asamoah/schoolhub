import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, relative, join } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const mobile = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceRoot = resolve(process.argv[2] ?? join(mobile, "src"));
const inventory = JSON.parse(
  readFileSync(
    resolve(mobile, "../../docs/architecture/route-inventory.json"),
    "utf8",
  ),
).routes;
const allowed = new Set(["teacher", "student", "guardian"]);
const normalise = (path) =>
  path.replace(/:[^/]+/g, ":param").replace(/\/+$/, "");
let count = 0;
function fail(file, message) {
  throw new Error(`${relative(sourceRoot, file)}: ${message}`);
}
function walk(folder) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const file = join(folder, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "test" && entry.name !== "__tests__") walk(file);
      continue;
    }
    if (!/\.[tj]sx?$/.test(entry.name) || /\.test\.[tj]sx?$/.test(entry.name))
      continue;
    const ast = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const rel = relative(sourceRoot, file).replaceAll("\\", "/");
    const transport = rel === "lib/api.ts" || rel === "api/endpoint.ts";
    function visit(node) {
      if (
        ts.isImportSpecifier(node) &&
        [
          "apiFetch",
          "apiBytes",
          "publicFetch",
          "defineEndpoint",
          "defineDownload",
          "defineUpload",
        ].includes(node.propertyName?.text) &&
        node.propertyName.text !== node.name.text
      )
        fail(file, "Adapter aliases are not verifiable.");
      if (
        ts.isImportSpecifier(node) &&
        ["apiFetch", "publicFetch"].includes(node.name.text) &&
        !transport
      )
        fail(file, "Import a declared endpoint instead of the raw transport.");
      if (ts.isCallExpression(node)) {
        const name = node.expression.getText(ast);
        if (
          ["apiFetch", "publicFetch", "fetch", "globalThis.fetch"].includes(
            name,
          ) &&
          !transport
        )
          fail(file, "Undeclared network call. Use src/api endpoint adapters.");
        if (
          name === "defineEndpoint" ||
          name === "defineDownload" ||
          name === "defineUpload"
        ) {
          const config = node.arguments[0];
          if (!config || !ts.isObjectLiteralExpression(config))
            fail(file, "Endpoint metadata must be a literal object.");
          const properties = new Map(
            config.properties
              .filter(ts.isPropertyAssignment)
              .map((p) => [
                p.name.getText(ast).replaceAll(/["']/g, ""),
                p.initializer,
              ]),
          );
          function literal(name) {
            const field = properties.get(name);
            if (!field || !ts.isStringLiteral(field))
              fail(file, `${name} must be a string literal.`);
            return field.text;
          }
          const method = literal("method");
          const path = literal("path");
          if (name === "defineDownload" && method !== "GET")
            fail(file, "Downloads must use GET.");
          if (name === "defineUpload" && method !== "PUT")
            fail(file, "Uploads must use PUT.");
          if (
            !path.startsWith("/") ||
            path.startsWith("/api/") ||
            /[?#]/.test(path)
          )
            fail(
              file,
              "Use an API-relative path template, without query strings.",
            );
          const scopeNode = properties.get("scope");
          if (scopeNode && !ts.isStringLiteral(scopeNode))
            fail(file, "scope must be a string literal.");
          const scope = scopeNode?.text;
          if (/(?:^|\/)(?:external-exams|bece)(?:\/|$)/.test(path))
            fail(file, "External examinations are out of mobile v1 scope.");
          const rolesNode = properties.get("roles");
          if (
            !rolesNode ||
            !ts.isArrayLiteralExpression(rolesNode) ||
            !rolesNode.elements.every(ts.isStringLiteral)
          )
            fail(file, "roles must be a literal array.");
          const roles = rolesNode.elements.map((n) => n.text);
          if (roles.some((role) => !allowed.has(role)))
            fail(file, "Unsupported mobile role.");
          const route = inventory.find(
            (route) =>
              route.method === method &&
              normalise(route.path) === normalise("/api" + path),
          );
          if (!route)
            fail(file, `Missing inventory endpoint: ${method} ${path}`);
          if (scope === "tenant") {
            if (!route.tenantGuard || route.platformGuard || !roles.length)
              fail(
                file,
                "Tenant-scoped endpoints require a tenant guard and mobile roles.",
              );
            const routeRoles = route.roles.flatMap((role) =>
              role === "...roles" || role === "...schoolRoles"
                ? [...allowed]
                : [role],
            );
            if (
              routeRoles.length &&
              roles.some((role) => !routeRoles.includes(role))
            )
              fail(
                file,
                "Declared role is not allowed by the route inventory.",
              );
          } else if (route.roles.length) {
            if (
              !roles.length ||
              roles.some((role) => {
                const routeRoles =
                  route.roles.includes("...roles") ||
                  route.roles.includes("...schoolRoles")
                    ? [...allowed]
                    : route.roles;
                return !routeRoles.includes(role);
              })
            )
              fail(
                file,
                "Declared role is not allowed by the route inventory.",
              );
            if (scope)
              fail(file, "Role-scoped routes cannot use a special scope.");
          } else {
            const key = `${method} ${path}`;
            const allowedPublic = new Set([
              "GET /schools/public/:subdomain",
              "POST /schools/public/:subdomain/resolve-login",
              "POST /account/password-recovery/request",
              "POST /account/password-recovery/complete",
            ]);
            const explicitScope =
              (scope === "discovery" &&
                key === "GET /schools/roles" &&
                route.tenantGuard) ||
              (scope === "public" &&
                allowedPublic.has(key) &&
                !route.tenantGuard &&
                !route.platformGuard) ||
              (scope === "session" &&
                ["GET /me", "POST /account/change-password"].includes(key) &&
                !route.tenantGuard &&
                !route.platformGuard) ||
              (scope === "tenant" &&
                route.tenantGuard &&
                !route.platformGuard &&
                roles.length > 0);
            if (!explicitScope || (scope !== "discovery" && roles.length))
              fail(
                file,
                "Route without role metadata needs an explicit supported scope.",
              );
          }
          count++;
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
}
walk(sourceRoot);
if (!process.argv[2]) walk(join(mobile, "app"));
if (!count) throw new Error("No declared endpoints were verified.");
console.log(
  `PASS: ${count} endpoint declarations match inventory methods, paths and mobile roles.`,
);
