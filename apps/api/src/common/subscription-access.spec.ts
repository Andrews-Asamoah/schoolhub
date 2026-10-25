import { describe, expect, it } from "vitest";
import { evaluateSubscriptionAccess, SUBSCRIPTION_GRACE_DAYS } from "@schoolhub/shared";

const now = new Date("2026-10-25T12:00:00Z");
const days = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

describe("evaluateSubscriptionAccess", () => {
  it("allows active and trialing schools before expiry", () => {
    expect(evaluateSubscriptionAccess("ACTIVE", days(30), now)).toMatchObject({ allowed: true, reason: "OK", daysRemaining: 30 });
    expect(evaluateSubscriptionAccess("TRIALING", days(1), now)).toMatchObject({ allowed: true, reason: "OK" });
  });

  it("allows schools with no expiry date", () => {
    expect(evaluateSubscriptionAccess("ACTIVE", null, now)).toEqual({ allowed: true, reason: "OK", daysRemaining: null });
  });

  it("blocks suspended and cancelled schools immediately, whatever the expiry", () => {
    expect(evaluateSubscriptionAccess("SUSPENDED", days(300), now)).toMatchObject({ allowed: false, reason: "SUSPENDED" });
    expect(evaluateSubscriptionAccess("CANCELLED", days(300), now)).toMatchObject({ allowed: false, reason: "CANCELLED" });
    expect(evaluateSubscriptionAccess("CANCELED", null, now)).toMatchObject({ allowed: false, reason: "CANCELLED" });
  });

  it("keeps a lapsed school working through the grace period, then blocks it", () => {
    expect(evaluateSubscriptionAccess("ACTIVE", days(-1), now)).toMatchObject({ allowed: true, reason: "GRACE_PERIOD" });
    expect(evaluateSubscriptionAccess("ACTIVE", days(-(SUBSCRIPTION_GRACE_DAYS - 1)), now).allowed).toBe(true);
    expect(evaluateSubscriptionAccess("ACTIVE", days(-(SUBSCRIPTION_GRACE_DAYS + 1)), now)).toMatchObject({ allowed: false, reason: "EXPIRED" });
    expect(evaluateSubscriptionAccess("TRIALING", days(-30), now)).toMatchObject({ allowed: false, reason: "EXPIRED" });
  });

  it("treats PAST_DUE as allowed but flagged, until the grace period ends", () => {
    expect(evaluateSubscriptionAccess("PAST_DUE", days(5), now)).toMatchObject({ allowed: true, reason: "PAST_DUE" });
    expect(evaluateSubscriptionAccess("PAST_DUE", days(-30), now).allowed).toBe(false);
  });

  it("fails closed on unknown or missing status values", () => {
    expect(evaluateSubscriptionAccess("WHATEVER", days(10), now).allowed).toBe(false);
    expect(evaluateSubscriptionAccess(undefined, null, now).allowed).toBe(false);
  });

  it("ignores an unparseable expiry rather than crashing", () => {
    expect(evaluateSubscriptionAccess("ACTIVE", "not-a-date", now)).toMatchObject({ allowed: true, daysRemaining: null });
  });
});
