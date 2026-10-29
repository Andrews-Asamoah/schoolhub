import { describe, expect, it } from "vitest";
import { originPolicy } from "./origin-policy.js";
describe("production origin policy", () => {
  const policy = originPolicy({ NODE_ENV: "production", WEB_ORIGIN: "https://app.school.test", TENANT_ROOT_DOMAINS: "school.test" });
  it("allows configured HTTPS origins and rejects development/lookalike origins", () => {
    for (const origin of ["https://app.school.test", "https://wis.school.test", "https://school.test", undefined]) expect(policy.allows(origin)).toBe(true);
    for (const origin of ["http://wis.school.test", "http://localhost:5173", "https://school.test.evil.test", "https://a.b.school.test", "https://wis.school.test:444", "null"]) expect(policy.allows(origin)).toBe(false);
    expect(policy.trustedOrigins).not.toContain("http://localhost:5173");
  });
  it("fails closed for malformed deployment configuration", () => {
    expect(() => originPolicy({ NODE_ENV: "production", WEB_ORIGIN: "http://app.school.test" })).toThrow();
    expect(() => originPolicy({ TENANT_ROOT_DOMAINS: "*.school.test" })).toThrow();
  });
  it("retains local subdomain development without trusting arbitrary localhost ports", () => {
    const development = originPolicy({ NODE_ENV: "development" });
    expect(development.allows("http://wis.localhost:5173")).toBe(true);
    expect(development.allows("http://wis.localhost:1234")).toBe(false);
  });
});
