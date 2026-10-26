import { describe, expect, it, vi } from "vitest";
import { FinanceApprovalService } from "./finance-approval.service.js";

const payload = { billId: "bill1", amount: "12.00" };
function fixture({ maker = "maker", approver = "maker", status = "PENDING" } = {}) {
  const approval = {
    id: "approval1", schoolId: "school1", requestedById: maker,
    decidedById: approver, status, payloadHash: "",
  };
  const tx = {
    financeApprovalRequest: {
      findFirst: vi.fn(),
      updateMany: vi.fn(async () => ({ count: 1 })),
      findUniqueOrThrow: vi.fn(async () => approval),
    },
    financeSettings: { findUnique: vi.fn(async () => ({ allowSelfApproval: true })) },
  };
  const db = { ...tx, $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)) };
  const service = new FinanceApprovalService({ client: db } as never);
  return { tx, db, approval, service };
}

describe("finance independent approval", () => {
  it("rejects maker decisions even when historical school allowSelfApproval is true", async () => {
    const { tx, service, approval } = fixture();
    const { approvalPayloadHash } = await import("./finance-approval.service.js");
    tx.financeApprovalRequest.findFirst.mockResolvedValue({ ...approval, payloadHash: approvalPayloadHash(payload) });
    await expect(service.decide("school1", "approval1", "maker", "APPROVED", payload, "Independent review"))
      .rejects.toThrow(/requester cannot approve/i);
    expect(tx.financeApprovalRequest.updateMany).not.toHaveBeenCalled();
    expect(tx.financeSettings.findUnique).not.toHaveBeenCalled();
  });

  it("rejects previously self-approved or incomplete decisions at consumption", async () => {
    const { tx, service, approval } = fixture({ status: "APPROVED" });
    tx.financeApprovalRequest.findFirst.mockResolvedValue(approval);
    await expect(service.assertApproved("school1", "TEST", "item1", payload))
      .rejects.toThrow(/distinct reviewer/i);
    tx.financeApprovalRequest.findFirst.mockResolvedValue({ ...approval, decidedById: null });
    await expect(service.assertApproved("school1", "TEST", "item1", payload))
      .rejects.toThrow(/distinct reviewer/i);
  });

  it("permits independently approved and payload-matched decisions", async () => {
    const { tx, service, approval } = fixture({ status: "APPROVED", approver: "reviewer" });
    tx.financeApprovalRequest.findFirst.mockResolvedValue(approval);
    await expect(service.assertApproved("school1", "TEST", "item1", payload)).resolves.toBe(approval);
  });
});
