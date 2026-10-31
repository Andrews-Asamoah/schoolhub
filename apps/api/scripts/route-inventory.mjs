import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const controllers = [];
function walk(directory) { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
  const file = path.join(directory, entry.name);
  if (entry.isDirectory()) walk(file); else if (entry.name.endsWith(".controller.ts")) controllers.push(file);
} }
walk(path.join(root, "apps/api/src"));
function decorators(node) {
  return (ts.canHaveDecorators(node) ? ts.getDecorators(node) ?? [] : []).map(item => {
    const expr = item.expression;
    return ts.isCallExpression(expr) ? { name: expr.expression.getText(), args: expr.arguments.map(arg => ts.isStringLiteral(arg) ? arg.text : arg.getText()) } : { name: expr.getText(), args: [] };
  });
}
const routes = [];
for (const file of controllers.sort()) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  for (const item of source.statements) {
    if (!ts.isClassDeclaration(item)) continue;
    const classDecorators = decorators(item);
    const controller = classDecorators.find(item => item.name === "Controller");
    if (!controller) continue;
    for (const method of item.members) {
      if (!ts.isMethodDeclaration(method)) continue;
      const local = decorators(method);
      for (const verb of local.filter(item => ["Get", "Post", "Put", "Patch", "Delete", "All"].includes(item.name))) {
        const guards = [...classDecorators, ...local].filter(item => item.name === "UseGuards").flatMap(item => item.args);
        const roles = (local.find(item => item.name === "Roles") ?? classDecorators.find(item => item.name === "Roles"))?.args ?? [];
        routes.push({ method: verb.name.toUpperCase(), path: "/api/" + [controller.args[0], verb.args[0]].filter(Boolean).join("/"),
          handler: `${item.name?.text}.${method.name.getText()}`, file: path.relative(root, file).split(path.sep).join("/"),
          tenantGuard: guards.includes("SchoolTenantGuard"), platformGuard: guards.includes("SuperAdminGuard"), guards, roles,
          resourceScope: "REQUIRES_SERVICE_REVIEW", audit: "REQUIRES_SERVICE_REVIEW",
          annotations: local.filter(item => ["AllowAnonymous", "AllowInactiveSubscription"].includes(item.name)).map(item => item.name) });
      }
    }
  }
}
routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
const output = path.join(root, "docs/architecture/route-inventory.json");
const content = JSON.stringify({ note: "Static controller inventory only. Guards do not prove resource scope, authentication or audit coverage. Better Auth plugin endpoints are separately tested and are not controller routes.", routes }) + "\n";
if (process.argv.includes("--check")) {
  if (!fs.existsSync(output) || fs.readFileSync(output, "utf8") !== content) { console.error("Route inventory is stale: run node apps/api/scripts/route-inventory.mjs"); process.exitCode = 1; }
} else { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, content); console.log(`Inventoried ${routes.length} controller routes.`); }
