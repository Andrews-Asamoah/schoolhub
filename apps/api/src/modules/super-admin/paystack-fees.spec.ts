import { describe, expect, it } from "vitest";
import {
  calculatePaystackFeeBreakdown,
  estimatePaystackFeePesewas,
  PAYSTACK_GHANA_FEE_BASIS_POINTS,
} from "./paystack-fees.js";

describe("Paystack Ghana fee calculation", () => {
  it("defaults to the published standard Ghana rate", () => {
    expect(PAYSTACK_GHANA_FEE_BASIS_POINTS).toBe(195);
  });

  it("adds a fee that leaves the full GHS 100 subscription price covered", () => {
    const result = calculatePaystackFeeBreakdown(10_000);
    expect(result.subscriptionAmountPesewas).toBe(10_000);
    expect(result.amountDuePesewas).toBe(10_199);
    expect(result.estimatedPaystackFeePesewas).toBe(199);
    expect(result.amountDuePesewas - result.estimatedPaystackFeePesewas).toBe(10_000);
  });

  it("returns a zero breakdown for a free plan", () => {
    expect(calculatePaystackFeeBreakdown(0)).toEqual({
      currency: "GHS",
      subscriptionAmountPesewas: 0,
      estimatedPaystackFeePesewas: 0,
      amountDuePesewas: 0,
      feeRateBasisPoints: 195,
    });
  });

  it("supports an explicitly configured merchant fee rate", () => {
    const result = calculatePaystackFeeBreakdown(10_000, 250);
    expect(result.amountDuePesewas - result.estimatedPaystackFeePesewas).toBeGreaterThanOrEqual(10_000);
    expect(result.feeRateBasisPoints).toBe(250);
  });

  it("rejects invalid amounts and rates", () => {
    expect(() => estimatePaystackFeePesewas(-1)).toThrow(RangeError);
    expect(() => calculatePaystackFeeBreakdown(1.5)).toThrow(RangeError);
    expect(() => calculatePaystackFeeBreakdown(100, 10_000)).toThrow(RangeError);
  });
});
