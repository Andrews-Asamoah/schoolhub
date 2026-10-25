import { evaluateSubscriptionAccess } from "@schoolhub/shared";

/** "in 12 days", "today", "3 days ago": a human sentence for an expiry date. */
export function describeExpiry(expiresAt: string | null | undefined, now = new Date()): string {
  if (!expiresAt) return "No expiry set";
  const days = evaluateSubscriptionAccess("ACTIVE", expiresAt, now).daysRemaining;
  if (days === null) return "No expiry set";
  if (days > 1) return `in ${days} days`;
  if (days === 1) return "tomorrow";
  if (days === 0) return "today";
  const ago = Math.abs(days);
  return ago === 1 ? "yesterday" : `${ago} days ago`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
