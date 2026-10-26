import { describe, expect, it } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import { FinanceWriteRateLimitGuard, InMemoryFinanceRateLimitStore, SlidingWindowLimiter, SuperAdminReasonGuard } from "./finance-safeguards.js";

function context(request: Record<string, unknown>) {
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe("SlidingWindowLimiter", () => {
  it("allows up to the limit, then reports how long to wait", () => {
    let now = 0;
    const limiter = new SlidingWindowLimiter(3, 1000, () => now);
    expect(limiter.hit("a")).toBe(0);
    expect(limiter.hit("a")).toBe(0);
    expect(limiter.hit("a")).toBe(0);
    expect(limiter.hit("a")).toBeGreaterThan(0);
  });
  it("frees capacity as the window slides", () => {
    let now = 0;
    const limiter = new SlidingWindowLimiter(1, 1000, () => now);
    expect(limiter.hit("a")).toBe(0);
    expect(limiter.hit("a")).toBeGreaterThan(0);
    now = 1001;
    expect(limiter.hit("a")).toBe(0);
  });
  it("counts each caller separately", () => {
    const limiter = new SlidingWindowLimiter(1, 1000, () => 0);
    expect(limiter.hit("a")).toBe(0);
    expect(limiter.hit("b")).toBe(0);
  });
});

describe("FinanceWriteRateLimitGuard", () => {
  it("never limits reads", async () => {
    const guard = new FinanceWriteRateLimitGuard(new InMemoryFinanceRateLimitStore());
    for (let i = 0; i < 500; i += 1) {
      expect(await guard.canActivate(context({ method: "GET", session: { user: { id: "read-user" } } }))).toBe(true);
    }
  });
  it("returns 429 once a user exceeds the write limit", async () => {
    const guard = new FinanceWriteRateLimitGuard(new InMemoryFinanceRateLimitStore());
    const request = { method: "POST", session: { user: { id: "burst-user" } }, school: { id: "s1" } };
    let status: number | undefined;
    for (let i = 0; i < 61; i += 1) {
      try {
        await guard.canActivate(context(request));
      } catch (error) {
        status = (error as { getStatus: () => number }).getStatus();
      }
    }
    expect(status).toBe(429);
  });
});

describe("SuperAdminReasonGuard", () => {
  const guard = new SuperAdminReasonGuard();
  const superAdmin = { role: "superAdmin" };
  it("lets platform admins read without a reason", () => {
    expect(guard.canActivate(context({ method: "GET", session: { user: superAdmin }, headers: {} }))).toBe(true);
  });
  it("requires a reason for platform admin writes", () => {
    expect(() => guard.canActivate(context({ method: "POST", session: { user: superAdmin }, headers: {} }))).toThrow();
    expect(() =>
      guard.canActivate(context({ method: "POST", session: { user: superAdmin }, headers: { "x-support-reason": "short" } })),
    ).toThrow();
  });
  it("accepts and records a proper reason", () => {
    const request: Record<string, unknown> = {
      method: "PATCH",
      session: { user: superAdmin },
      headers: { "x-support-reason": "  School requested correction, ticket #214  " },
    };
    expect(guard.canActivate(context(request))).toBe(true);
    expect(request.supportReason).toBe("School requested correction, ticket #214");
  });
  it("does not affect school users", () => {
    expect(guard.canActivate(context({ method: "POST", session: { user: { role: "user" } }, headers: {} }))).toBe(true);
  });
});
