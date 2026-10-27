import { describe, expect, it } from "vitest";
import { getMigrationCheckStatus } from "./operations-health-status";

describe("getMigrationCheckStatus", () => {
  it("marks a verified current migration baseline healthy", () => {
    expect(getMigrationCheckStatus("current")).toBe("healthy");
  });

  it.each(["mismatch", "incomplete", "not_configured", "unavailable"] as const)(
    "marks %s migration status degraded",
    (status) => {
      expect(getMigrationCheckStatus(status)).toBe("degraded");
    },
  );

  it("does not claim health when no migration status is available", () => {
    expect(getMigrationCheckStatus(undefined)).toBe("unavailable");
    expect(getMigrationCheckStatus(null)).toBe("unavailable");
  });
});
