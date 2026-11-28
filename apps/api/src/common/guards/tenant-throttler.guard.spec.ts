import "reflect-metadata";
import { Controller, Get, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { describe, expect, it } from "vitest";
import { TenantThrottlerGuard } from "./tenant-throttler.guard.js";

@Controller("own")
@UseGuards(ThrottlerGuard)
class OwnGuardController {
  @Get() ok() { return "ok"; }
}

describe("TenantThrottlerGuard tracker", () => {
  const guard = Object.create(TenantThrottlerGuard.prototype) as unknown as {
    getTracker(req: Record<string, unknown>): Promise<string>;
  };

  it("separates users who share one school IP", async () => {
    const a = await guard.getTracker({ ip: "1.1.1.1", headers: { "x-school-subdomain": "wesley", cookie: "better-auth.session_token=aaa" } });
    const b = await guard.getTracker({ ip: "1.1.1.1", headers: { "x-school-subdomain": "wesley", cookie: "better-auth.session_token=bbb" } });
    expect(a).not.toBe(b);
  });

  it("separates tenants and falls back to IP when anonymous", async () => {
    const a = await guard.getTracker({ ip: "2.2.2.2", headers: { "x-school-subdomain": "wesley" } });
    const b = await guard.getTracker({ ip: "2.2.2.2", headers: { "x-school-subdomain": "other" } });
    expect(a).toBe("wesley:ip-2.2.2.2");
    expect(a).not.toBe(b);
  });

  it("never puts the raw token in the key", async () => {
    const key = await guard.getTracker({ ip: "3.3.3.3", headers: { authorization: "Bearer secret-token" } });
    expect(key).not.toContain("secret-token");
  });
});

describe("TenantThrottlerGuard skip rule", () => {
  it("skips controllers that declare their own ThrottlerGuard", async () => {
    const guard = Object.create(TenantThrottlerGuard.prototype) as unknown as {
      shouldSkip(ctx: unknown): Promise<boolean>;
    };
    const ctx = (cls: new () => unknown, handler: () => unknown) => ({
      getClass: () => cls, getHandler: () => handler,
      getType: () => "http", switchToHttp: () => ({ getRequest: () => ({}) }),
    });
    expect(await guard.shouldSkip(ctx(OwnGuardController, OwnGuardController.prototype.ok))).toBe(true);
  });
});
