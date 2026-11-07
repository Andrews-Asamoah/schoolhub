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

describe("all-role portal boundaries", () => {
  it.each(["owner", "admin", "headteacher", "teacher", "accountant", "staff"])("keeps personal family/student pages out of %s", role => {
    const pages = getSchoolNavGroupsForRole(role).flatMap(group => group.items.map(item => item.id));
    for (const page of ["guardian-fees", "guardian-reports", "classmates", "student-portal"]) {
      expect(pages).not.toContain(page);
      expect(canRoleAccessPage(role, page)).toBe(false);
    }
  });
  it("denies unknown and unresolved roles", () => {
    expect(getSchoolNavGroupsForRole("unexpected")).toEqual([]);
    expect(canRoleAccessPage(null, "students")).toBe(false);
  });
  it("keeps every examination page under Academics, with no separate Examinations group", () => {
    const groups = getSchoolNavGroupsForRole("headteacher");
    expect(groups.some((group) => group.label === "Examinations")).toBe(false);
    const academics = groups.find((group) => group.label === "Academics")!;
    for (const id of ["assessments", "mock-analysis", "external-exams"]) expect(academics.items.map((item) => item.id)).toContain(id);
    expect(canRoleAccessPage("teacher", "mock-analysis")).toBe(true);
    expect(canRoleAccessPage("guardian", "mock-analysis")).toBe(false);
    expect(canRoleAccessPage("student", "mock-analysis")).toBe(false);
  });
  it("permits the learner and family destinations only in their own role", () => {
    expect(canRoleAccessPage("guardian", "guardian-fees")).toBe(true);
    expect(canRoleAccessPage("student", "classmates")).toBe(true);
    expect(canRoleAccessPage("guardian", "external-exams")).toBe(false);
    expect(canRoleAccessPage("student", "external-exams")).toBe(false);
  });
});
