/** One Ghana cedi formatter for the whole app, so every table and card shows money the same way. */
export const ghsFormat = new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" });

export function formatGhs(value: number | string | null | undefined): string {
  const amount = Number(value);
  return ghsFormat.format(Number.isFinite(amount) ? amount : 0);
}
