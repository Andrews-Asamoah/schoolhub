import { describe, expect, it } from "vitest";
import { resolveTenantSubdomain } from "./tenant-subdomain";

describe("tenant resolution for branding and API headers", () => {
  it.each(["127.0.0.1", "192.168.1.10", "[::1]", "localhost", "schoolhub.gh"])(
    "treats %s as a central host", (host) => expect(resolveTenantSubdomain(host)).toBeNull(),
  );
  it.each(["www", "app", "api", "admin", "staging", "demo", "mail", "docs"])(
    "reserves %s in both URLs and overrides", (name) => {
      expect(resolveTenantSubdomain(`${name}.schoolhub.gh`)).toBeNull();
      expect(resolveTenantSubdomain("localhost", `?school=${name}`)).toBeNull();
    },
  );
  it("resolves school hosts and explicit local overrides", () => {
    expect(resolveTenantSubdomain("Wesley.localhost")).toBe("wesley");
    expect(resolveTenantSubdomain("wesley.schoolhub.gh")).toBe("wesley");
    expect(resolveTenantSubdomain("127.0.0.1", "?school=%20Wesley%20")).toBe("wesley");
    expect(resolveTenantSubdomain("localhost", "?subdomain=heavens-dew")).toBe("heavens-dew");
    expect(resolveTenantSubdomain("localhost", "?school=bad/name")).toBeNull();
  });
});
