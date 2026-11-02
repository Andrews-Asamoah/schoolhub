import { describe, expect, it } from "vitest";
import { canRoleAccessPage, getSchoolNavGroupsForRole } from "./school-navigation";

describe("administrator finance navigation", () => {
  it("keeps the administrator's detailed finance pages out of navigation and direct access", () => {
    const groups = getSchoolNavGroupsForRole("admin");
    const pageIds = groups.flatMap((group) => group.items.map((item) => item.id));

    for (const page of ["accountant-portal", "payments", "invoices", "expenses", "payroll", "finance-reports", "finance-audit"]) {
      expect(pageIds).not.toContain(page);
      expect(canRoleAccessPage("admin", page)).toBe(false);
    }
    expect(canRoleAccessPage("admin", "inventory")).toBe(true);
  });

  it("preserves detailed finance access for the accountant and school owner", () => {
    expect(canRoleAccessPage("accountant", "finance-reports")).toBe(true);
    expect(canRoleAccessPage("owner", "finance-reports")).toBe(true);
  });
});
