/**
 * Estimate Paystack fees for Ghana-based GHS subscription checkout.
 * All calculations use integer pesewas; this is a checkout estimate, not
 * authoritative settlement data. Keep the rate configurable for negotiated
 * merchant pricing and provider changes.
 */
export const PAYSTACK_GHANA_FEE_BASIS_POINTS = 195;
const BASIS_POINT_DENOMINATOR = 10_000;

export interface PaystackFeeBreakdown {
  currency: "GHS";
  subscriptionAmountPesewas: number;
  estimatedPaystackFeePesewas: number;
  amountDuePesewas: number;
  feeRateBasisPoints: number;
}

function assertPesewas(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError("Amount must be a non-negative safe integer in pesewas");
  }
}

export function estimatePaystackFeePesewas(
  chargeAmountPesewas: number,
  feeRateBasisPoints = PAYSTACK_GHANA_FEE_BASIS_POINTS,
): number {
  assertPesewas(chargeAmountPesewas);
  if (
    !Number.isSafeInteger(feeRateBasisPoints) ||
    feeRateBasisPoints < 0 ||
    feeRateBasisPoints >= BASIS_POINT_DENOMINATOR
  ) {
    throw new RangeError("Fee rate must be an integer from 0 to 9,999 basis points");
  }
  return Math.floor(
    (chargeAmountPesewas * feeRateBasisPoints + BASIS_POINT_DENOMINATOR / 2) /
      BASIS_POINT_DENOMINATOR,
  );
}

/**
 * Find the smallest gross charge where the estimated processing fee can be
 * deducted and the configured subscription price remains covered.
 */
export function calculatePaystackFeeBreakdown(
  subscriptionAmountPesewas: number,
  feeRateBasisPoints = PAYSTACK_GHANA_FEE_BASIS_POINTS,
): PaystackFeeBreakdown {
  assertPesewas(subscriptionAmountPesewas);
  // Validate rate even when the plan is free.
  estimatePaystackFeePesewas(0, feeRateBasisPoints);

  if (subscriptionAmountPesewas === 0) {
    return {
      currency: "GHS",
      subscriptionAmountPesewas: 0,
      estimatedPaystackFeePesewas: 0,
      amountDuePesewas: 0,
      feeRateBasisPoints,
    };
  }

  let amountDuePesewas = subscriptionAmountPesewas;
  while (
    amountDuePesewas -
      estimatePaystackFeePesewas(amountDuePesewas, feeRateBasisPoints) <
    subscriptionAmountPesewas
  ) {
    amountDuePesewas += 1;
    if (!Number.isSafeInteger(amountDuePesewas)) {
      throw new RangeError("Amount is too large to calculate safely");
    }
  }

  return {
    currency: "GHS",
    subscriptionAmountPesewas,
    estimatedPaystackFeePesewas: estimatePaystackFeePesewas(
      amountDuePesewas,
      feeRateBasisPoints,
    ),
    amountDuePesewas,
    feeRateBasisPoints,
  };
}
