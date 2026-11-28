import { describe, expect, it } from "vitest";
import { resolveApproval } from "./finance-approval";

describe("resolveApproval", () => {
  it("assumes a second approver is required until the setting has loaded", () => {
    const result = resolveApproval(undefined, "MANUAL_JOURNAL");
    expect(result.required).toBe(true);
    expect(result.canDecide("owner")).toBe(true);
    expect(result.canDecide("accountant")).toBe(false);
  });

  it("uses only the configured approver roles while approval is required", () => {
    const result = resolveApproval([{ control: "BANK_RECONCILIATION", required: true, approverRoles: ["owner"] }], "BANK_RECONCILIATION");
    expect(result.canDecide("owner")).toBe(true);
    expect(result.canDecide("headteacher")).toBe(false);
  });

  it("reports approval off, and still lets owner or headteacher clear items left pending", () => {
    const result = resolveApproval([{ control: "MANUAL_JOURNAL", required: false, approverRoles: [] }], "MANUAL_JOURNAL");
    expect(result.required).toBe(false);
    expect(result.canDecide("owner")).toBe(true);
    expect(result.canDecide("headteacher")).toBe(true);
    expect(result.canDecide("accountant")).toBe(false);
    expect(result.canDecide(undefined)).toBe(false);
  });

  it("reads the row for the control asked about", () => {
    const rows = [
      { control: "MANUAL_JOURNAL", required: false, approverRoles: [] },
      { control: "PERIOD_CONTROL", required: true, approverRoles: ["headteacher"] },
    ];
    expect(resolveApproval(rows, "PERIOD_CONTROL").canDecide("headteacher")).toBe(true);
    expect(resolveApproval(rows, "PERIOD_CONTROL").canDecide("owner")).toBe(false);
    expect(resolveApproval(rows, "MANUAL_JOURNAL").required).toBe(false);
  });
});
