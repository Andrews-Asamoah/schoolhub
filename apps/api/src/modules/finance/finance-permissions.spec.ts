import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { FINANCE_PAYROLL_EXPORT_ROLES, FINANCE_READ_ROLES, FINANCE_WRITE_ROLES, PAYROLL_SETTINGS_APPROVE_ROLES, canExportFinancePayroll, isFinancePayrollExportRole } from "./finance.permissions.js";

const here = dirname(fileURLToPath(import.meta.url));
// Normalise line endings so the checks behave the same on Windows (CRLF) checkouts.
const controllerSource = readFileSync(join(here, "finance.controller.ts"), "utf8").replace(/\r\n/g, "\n");

function check(requiredRoles: readonly string[], user: { role?: string }, schoolRole?: string, membershipRole = schoolRole) {
  const guard = new RolesGuard({ getAllAndOverride: () => requiredRoles } as never);
  const request = {
    session: { user },
    membership: membershipRole ? { role: membershipRole } : undefined,
    schoolRole,
  };
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return () => guard.canActivate(context);
}

describe("finance policy constants", () => {
  it("only the accountant role may write financial data", () => {
    expect([...FINANCE_WRITE_ROLES]).toEqual(["accountant"]);
  });

  it("restricts salary and payroll exports to accountant, owner and headteacher", () => {
    expect([...FINANCE_PAYROLL_EXPORT_ROLES]).toEqual(["accountant", "owner", "headteacher"]);
  });

  it("does not accept admin, teacher, staff, guardian, student or platform superAdmin for payroll exports", () => {
    for (const role of ["admin", "teacher", "staff", "guardian", "student", "superAdmin", "", null, undefined]) {
      expect(isFinancePayrollExportRole(role)).toBe(false);
    }
    for (const role of FINANCE_PAYROLL_EXPORT_ROLES) expect(isFinancePayrollExportRole(role)).toBe(true);
  });

  it("rejects the platform superAdmin even if a client requests an allowed school role", () => {
    expect(canExportFinancePayroll("superAdmin", "accountant")).toBe(false);
    expect(canExportFinancePayroll("user", "accountant")).toBe(true);
    expect(canExportFinancePayroll("user", "owner")).toBe(true);
    expect(canExportFinancePayroll("user", "headteacher")).toBe(true);
    expect(canExportFinancePayroll("user", "admin")).toBe(false);
  });
});

describe("RolesGuard with the finance write policy", () => {
  it("allows an accountant", () => {
    expect(check(FINANCE_WRITE_ROLES, { role: "user" }, "accountant")()).toBe(true);
  });
  it("allows the platform superAdmin", () => {
    expect(check(FINANCE_WRITE_ROLES, { role: "superAdmin" })()).toBe(true);
  });
  it.each(["owner", "admin", "headteacher", "teacher", "student", "guardian", "staff"])(
    "rejects a school %s",
    (role) => {
      expect(check(FINANCE_WRITE_ROLES, { role: "user" }, role)).toThrow();
    },
  );
  it("allows a headteacher only when acting under the accountant role", () => {
    expect(check(FINANCE_WRITE_ROLES, { role: "user" }, "accountant", "headteacher")()).toBe(true);
  });
  it("still lets owners and admins read finance data", () => {
    expect(check(FINANCE_READ_ROLES, { role: "user" }, "owner")()).toBe(true);
    expect(check(FINANCE_READ_ROLES, { role: "user" }, "admin")()).toBe(true);
    expect(check(FINANCE_READ_ROLES, { role: "user" }, "teacher")).toThrow();
  });
});

describe("finance controller routes", () => {
  const routes = [...controllerSource.matchAll(/@(Get|Post|Patch|Put|Delete)\(([^)]*)\)((?:\n\s*@\w+(?:\([^)]*\))?)*)/g)].map(
    (match) => ({ verb: match[1], route: match[2], decorators: match[3] ?? "" }),
  );

  it("finds the routes", () => {
    expect(routes.length).toBeGreaterThanOrEqual(30);
  });
  it("never hard-codes role names in a route", () => {
    expect(controllerSource).not.toMatch(/@Roles\(\s*"/);
  });
  it("gives every write route (POST/PATCH/PUT/DELETE) the finance write roles", () => {
    const approvals = (r: { route: string }) => /payroll\/settings\/:kind\/:id\/(activate|end)/.test(r.route);
    for (const route of routes.filter((r) => r.verb !== "Get" && !approvals(r))) {
      expect(route.decorators, `${route.verb} ${route.route}`).toContain("@Roles(...FINANCE_WRITE_ROLES)");
    }
  });
  it("gives statutory payroll setting approval to owner and headteacher only, never the preparer role", () => {
    expect([...PAYROLL_SETTINGS_APPROVE_ROLES]).toEqual(["owner", "headteacher"]);
    const approvals = routes.filter((r) => /payroll\/settings\/:kind\/:id\/(activate|end)/.test(r.route));
    expect(approvals).toHaveLength(2);
    for (const route of approvals) expect(route.decorators, route.route).toContain("@Roles(...PAYROLL_SETTINGS_APPROVE_ROLES)");
    expect(check(PAYROLL_SETTINGS_APPROVE_ROLES, { role: "user" }, "accountant")).toThrow();
    expect(check(PAYROLL_SETTINGS_APPROVE_ROLES, { role: "user" }, "owner")()).toBe(true);
    expect(check(PAYROLL_SETTINGS_APPROVE_ROLES, { role: "user" }, "headteacher")()).toBe(true);
  });
  it("gives payroll and salary exports the stricter export roles", () => {
    for (const route of routes.filter((r) => r.verb === "Get" && (
      r.route.includes("exports/payroll.xlsx") ||
      r.route.includes("exports/salaries.xlsx") ||
      r.route.includes("payslips.pdf") ||
      r.route.includes("payslips/:payslipId.pdf") ||
      r.route === '"payroll"' ||
      r.route === '"payroll/salaries"'
    ))) {
      expect(route.decorators, `GET ${route.route}`).toContain("@Roles(...FINANCE_PAYROLL_EXPORT_ROLES)");
    }
  });

  it("gives every other GET route the finance read roles", () => {
    for (const route of routes.filter((r) => r.verb === "Get" && !(
      r.route.includes("exports/payroll.xlsx") ||
      r.route.includes("exports/salaries.xlsx") ||
      r.route.includes("payslips.pdf") ||
      r.route.includes("payslips/:payslipId.pdf") ||
      r.route === '"payroll"' ||
      r.route === '"payroll/salaries"'
    ))) {
      expect(route.decorators, `GET ${route.route}`).toContain("@Roles(...FINANCE_READ_ROLES)");
    }
  });
  it("protects the payroll and salary JSON endpoints with explicit school-role checks", () => {
    for (const name of ["listPayrollRecords", "listPayrollSalaryRegister"]) {
      const method = controllerSource.slice(controllerSource.indexOf(name + "("), controllerSource.indexOf("\n  }", controllerSource.indexOf(name + "(")) + 4);
      expect(method).toContain("this.assertPayrollExportAllowed(user, schoolRole)");
    }
  });
  it("audits every request through the finance audit interceptor", () => {
    expect(controllerSource).toContain("@UseInterceptors(FinanceAuditInterceptor)");
  });
});
