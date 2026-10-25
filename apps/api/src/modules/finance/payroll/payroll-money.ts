/**
 * Exact money arithmetic for payroll.
 *
 * Amounts are held as integer pesewas (bigint) and rates as percentages scaled
 * by 10^4 (so "5.5" is 55_000n). There is no floating point anywhere, which
 * means results are reproducible and rounding is an explicit, configurable rule.
 */

export type RoundingMode = "HALF_UP" | "HALF_EVEN" | "UP" | "DOWN";

export const ROUNDING_MODES: readonly RoundingMode[] = ["HALF_UP", "HALF_EVEN", "UP", "DOWN"];

/** percent × 10^4 → denominator for (pesewas × rateScaled) is 100 × 10^4. */
export const RATE_DENOMINATOR = 1_000_000n;

export class PayrollCalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayrollCalculationError";
  }
}

const MONEY_PATTERN = /^\d{1,13}(\.\d{1,2})?$/;
const RATE_PATTERN = /^\d{1,3}(\.\d{1,4})?$/;

/** Parses a non-negative money amount with at most 2 decimals, e.g. "4845.25". */
export function parseMoney(value: string | number | { toString(): string }, label = "amount"): bigint {
  const text = typeof value === "string" ? value.trim() : String(value);
  if (!MONEY_PATTERN.test(text)) {
    throw new PayrollCalculationError(`${label} must be a non-negative amount with at most 2 decimal places (received "${text}").`);
  }
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
}

/** Parses a percentage between 0 and 100 with at most 4 decimals, e.g. "17.5". */
export function parseRate(value: string | number | { toString(): string }, label = "rate"): bigint {
  const text = typeof value === "string" ? value.trim() : String(value);
  if (!RATE_PATTERN.test(text)) {
    throw new PayrollCalculationError(`${label} must be a percentage with at most 4 decimal places (received "${text}").`);
  }
  const [whole, fraction = ""] = text.split(".");
  const scaled = BigInt(whole!) * 10_000n + BigInt(fraction.padEnd(4, "0"));
  if (scaled > 1_000_000n) throw new PayrollCalculationError(`${label} cannot exceed 100% (received "${text}").`);
  return scaled;
}

/** Formats integer pesewas as a plain decimal string, e.g. 484525n → "4845.25". */
export function formatMoney(pesewas: bigint): string {
  const negative = pesewas < 0n;
  const abs = negative ? -pesewas : pesewas;
  const whole = abs / 100n;
  const fraction = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/** Integer division of non-negative values using the chosen rounding rule. */
export function divideRounded(numerator: bigint, denominator: bigint, mode: RoundingMode): bigint {
  if (numerator < 0n || denominator <= 0n) throw new PayrollCalculationError("Rounding is only defined for non-negative amounts.");
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder === 0n) return quotient;
  switch (mode) {
    case "DOWN":
      return quotient;
    case "UP":
      return quotient + 1n;
    case "HALF_UP":
      return remainder * 2n >= denominator ? quotient + 1n : quotient;
    case "HALF_EVEN": {
      const twice = remainder * 2n;
      if (twice > denominator) return quotient + 1n;
      if (twice < denominator) return quotient;
      return quotient % 2n === 1n ? quotient + 1n : quotient;
    }
  }
}

/** pesewas × percentage, rounded once to whole pesewas. */
export function applyRate(pesewas: bigint, rateScaled: bigint, mode: RoundingMode): bigint {
  return divideRounded(pesewas * rateScaled, RATE_DENOMINATOR, mode);
}

export function minBig(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

export function maxBig(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}
