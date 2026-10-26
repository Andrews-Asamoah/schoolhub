import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { FinanceApprovalService } from "./finance-approval.service.js";
import { canApproveFinancePolicy } from "./finance.permissions.js";
import { approvalPayloadHash } from "./finance-approval.service.js";

const payload = { gross: "500.00", tax: "12.00" };
const approval = {
  id: "approval-1", schoolId: "s1", subject: "PAYROLL_RUN", amount: new Prisma.Decimal("500"),
  requestedById: "preparer-1", status: "PENDING", payloadHash: approvalPayloadHash(payload),
};

function stub(permission: string, allowSelfApproval = false) {
  const updateMany = vi.fn(async () => ({ count: 1 }));
  const tx = {
    financeApprovalRequest: {
      findFirst: vi.fn(async () => approval), updateMany,
      findUniqueOrThrow: vi.fn(async () => ({ ...approval, status: "APPROVED" })),
    },
    financeApprovalPolicy: {
      findFirst: vi.fn(async () => ({ approverPermission: permission, requiredApprovals: 1 })),
    },
    financeSettings: { findUnique: vi.fn(async () => ({ allowSelfApproval })) },
  };
  const service = new FinanceApprovalService({
    client: { $transaction: async (fn: (tx: typeof tx) => Promise<unknown>) => fn(tx) },
  } as never);
  return { service, updateMany };
}

describe("P0 payroll approval permission controls", () => {
  it("only grants explicitly mapped approval permissions", () => {
    expect(canApproveFinancePolicy("PAYROLL_APPROVE", "accountant")).toBe(true);
    expect(canApproveFinancePolicy("PAYROLL_APPROVE", "owner")).toBe(true);
    expect(canApproveFinancePolicy("PAYROLL_APPROVE", "headteacher")).toBe(true);
    expect(canApproveFinancePolicy("PAYROLL_APPROVE", "admin")).toBe(false);
    expect(canApproveFinancePolicy("PAYROLL_APPROVE", undefined)).toBe(false);
    expect(canApproveFinancePolicy("UNKNOWN_POLICY", "accountant")).toBe(false);
  });

  it("refuses a caller without the policy permission", async () => {
    const { service, updateMany } = stub("PAYROLL_APPROVE");
    await expect(service.decide("s1", "approval-1", "checker-1", "APPROVED", payload, "Verified", "admin")).rejects.toThrow(/configured permission/);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("enforces maker-checker independently from permission grants", async () => {
    const { service, updateMany } = stub("PAYROLL_APPROVE");
    await expect(service.decide("s1", "approval-1", "preparer-1", "APPROVED", payload, "Verified", "accountant")).rejects.toThrow(/own financial change/);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("rejects a changed approval payload", async () => {
    const { service } = stub("PAYROLL_APPROVE");
    await expect(service.decide("s1", "approval-1", "checker-1", "APPROVED", { gross: "600" }, "Verified", "owner")).rejects.toThrow(/changed/);
  });

  it("allows an authorised independent decision", async () => {
    const { service, updateMany } = stub("PAYROLL_APPROVE");
    await service.decide("s1", "approval-1", "checker-1", "APPROVED", payload, "Verified", "headteacher");
    expect(updateMany).toHaveBeenCalledTimes(1);
  });
});
