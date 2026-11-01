import { describe, expect, it } from "vitest";
import { canRoleAccessPage, getSchoolNavGroupsForRole } from "./school-navigation";

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
});
