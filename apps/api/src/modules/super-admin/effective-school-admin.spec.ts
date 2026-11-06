import { describe, expect, it } from "vitest";
import { hasSchoolAdministrationRole } from "@schoolhub/shared";

describe("effective school administrator membership", () => {
  it.each(["owner", "admin", "headteacher"])("recognizes primary and additional %s", role => {
    expect(hasSchoolAdministrationRole({ role })).toBe(true);
    expect(hasSchoolAdministrationRole({ role:"teacher", roles:[role] })).toBe(true);
  });
  it("does not mistake a teacher or accountant for a school administrator", () => {
    expect(hasSchoolAdministrationRole({ role:"teacher", roles:["accountant"] })).toBe(false);
  });
});
