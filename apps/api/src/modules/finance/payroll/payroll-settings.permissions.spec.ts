import { describe, expect, it } from "vitest";
import { isPayrollSettingsApproverRole, PAYROLL_SETTINGS_APPROVER_ROLES } from "../finance.permissions.js";

describe("payroll statutory settings approval policy", () => {
  it("allows only owner and headteacher membership roles", () => {
    expect(PAYROLL_SETTINGS_APPROVER_ROLES).toEqual(["owner", "headteacher"]);
    expect(isPayrollSettingsApproverRole("owner")).toBe(true);
    expect(isPayrollSettingsApproverRole("headteacher")).toBe(true);
    expect(isPayrollSettingsApproverRole("admin")).toBe(false);
    expect(isPayrollSettingsApproverRole("accountant")).toBe(false);
    expect(isPayrollSettingsApproverRole("superAdmin")).toBe(false);
    expect(isPayrollSettingsApproverRole(undefined)).toBe(false);
  });
});
