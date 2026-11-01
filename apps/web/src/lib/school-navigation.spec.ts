import { describe, expect, it } from "vitest";
import { canRoleAccessPage, getOwnPortalItem, getSchoolNavGroupsForRole, schoolNavItems } from "./school-navigation";

const idsFor = (role: string) => getSchoolNavGroupsForRole(role).flatMap((group) => group.items.map((item) => item.id));

describe("role navigation", () => {
  it("lets teachers and staff reach announcements", () => {
    expect(idsFor("teacher")).toContain("announcements");
    expect(idsFor("staff")).toContain("announcements");
    expect(canRoleAccessPage("teacher", "announcements")).toBe(true);
    expect(canRoleAccessPage("staff", "announcements")).toBe(true);
  });

  it("does not offer school-wide reports to teachers", () => {
    expect(idsFor("teacher")).not.toContain("reports");
  });

  it("keeps guardians on their family pages", () => {
    const ids = idsFor("guardian");
    expect(ids).toEqual(expect.arrayContaining(["guardian-attendance", "guardian-timetable", "guardian-fees"]));
    expect(canRoleAccessPage("guardian", "payments")).toBe(false);
  });

  it("no longer defines duplicate portal pages", () => {
    const ids = schoolNavItems.map((item) => item.id);
    for (const id of ["teacher-portal", "student-portal", "guardian-portal", "accountant-portal"]) expect(ids).not.toContain(id);
    expect(getOwnPortalItem("accountant")).toBeUndefined();
    expect(getOwnPortalItem("teacher")).toBeUndefined();
  });

  it("keeps the duplicate Reports page and student-only pages out of leadership's sidebar", () => {
    for (const role of ["owner", "admin", "headteacher"]) {
      expect(idsFor(role)).not.toContain("reports");
      expect(idsFor(role)).not.toContain("classmates");
      expect(idsFor(role)).toContain("students");
    }
  });

  it("does not list the removed accountant portal for accountants", () => {
    expect(idsFor("accountant")).not.toContain("accountant-portal");
    expect(idsFor("accountant")).toContain("payments");
  });
});
