import { describe, expect, it } from "vitest";
import {
  FINANCE_APPROVAL_CONTROLS, approvalSettingInputSchema, effectiveSetting, loadApprovalSetting, mayApproveStep, mayDecide,
} from "./finance-approval-settings.js";

const actor = (role: string | undefined, isSuperAdmin = false) => ({ id: "u1", role, isSuperAdmin });

describe("finance approval settings", () => {
  it("treats a school with no saved row as having second approval switched off", () => {
    expect(effectiveSetting("MANUAL_JOURNAL", null)).toEqual({
      control: "MANUAL_JOURNAL", required: false, approverRoles: [], configured: false,
    });
  });

  it("returns the saved approvers only while approval is required", () => {
    expect(effectiveSetting("MANUAL_JOURNAL", { required: true, approverRoles: ["owner"] }))
      .toMatchObject({ required: true, approverRoles: ["owner"], configured: true });
    expect(effectiveSetting("MANUAL_JOURNAL", { required: false, approverRoles: ["owner"] }).approverRoles).toEqual([]);
  });

  it("lets only the chosen roles decide when approval is required", () => {
    const setting = effectiveSetting("PERIOD_CONTROL", { required: true, approverRoles: ["owner"] });
    expect(mayDecide(setting, actor("owner"))).toBe(true);
    expect(mayDecide(setting, actor("headteacher"))).toBe(false);
    expect(mayDecide(setting, actor("accountant"))).toBe(false);
    expect(mayDecide(setting, actor("admin"))).toBe(false);
    expect(mayDecide(setting, actor(undefined))).toBe(false);
    expect(mayDecide(setting, actor(undefined, true))).toBe(true);
  });

  it("keeps items submitted earlier decidable by owner or headteacher after approval is switched off", () => {
    const off = effectiveSetting("PERIOD_CONTROL", { required: false, approverRoles: [] });
    expect(mayDecide(off, actor("owner"))).toBe(true);
    expect(mayDecide(off, actor("headteacher"))).toBe(true);
    expect(mayDecide(off, actor("accountant"))).toBe(false);
    expect(mayDecide(off, actor("teacher"))).toBe(false);
  });

  it("lets the accountant complete a separate approval step only when approval is off", () => {
    const off = effectiveSetting("ACCOUNT_MAPPING", null);
    const on = effectiveSetting("ACCOUNT_MAPPING", { required: true, approverRoles: ["owner", "headteacher"] });
    expect(mayApproveStep(off, actor("accountant"))).toBe(true);
    expect(mayApproveStep(on, actor("accountant"))).toBe(false);
    expect(mayApproveStep(off, actor("teacher"))).toBe(false);
    expect(mayApproveStep(on, actor("owner"))).toBe(true);
  });

  it("requires at least one approver role when approval is required, and only owner or headteacher roles", () => {
    expect(approvalSettingInputSchema.safeParse({ required: true, approverRoles: [] }).success).toBe(false);
    expect(approvalSettingInputSchema.safeParse({ required: true, approverRoles: ["accountant"] }).success).toBe(false);
    expect(approvalSettingInputSchema.safeParse({ required: true, approverRoles: ["admin"] }).success).toBe(false);
    expect(approvalSettingInputSchema.safeParse({ required: true, approverRoles: ["owner", "headteacher"] }).success).toBe(true);
    expect(approvalSettingInputSchema.safeParse({ required: false }).success).toBe(true);
  });

  it("covers all six controls", async () => {
    expect([...FINANCE_APPROVAL_CONTROLS].sort()).toEqual([
      "ACCOUNT_MAPPING", "BANK_RECONCILIATION", "INVOICE_ADJUSTMENT", "MANUAL_JOURNAL", "PAYROLL_SETTINGS", "PERIOD_CONTROL",
    ]);
    const db = { financeApprovalSetting: { findUnique: async () => null } };
    expect((await loadApprovalSetting(db as never, "s1", "MANUAL_JOURNAL")).required).toBe(false);
  });
});
