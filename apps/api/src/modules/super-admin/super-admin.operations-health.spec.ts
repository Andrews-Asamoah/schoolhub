import { afterEach, describe, expect, it, vi } from "vitest";
import { SuperAdminService } from "./super-admin.service.js";
import type { PrismaService } from "../../prisma/prisma.service.js";
import type { CredentialsService } from "../accounts/credentials.service.js";

describe("SuperAdminService operations health", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it("reports only verified database health and marks uninstrumented dependencies honestly", async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ "?column?": 1 }]);
    const service = new SuperAdminService(
      { client: { $queryRaw: queryRaw } } as unknown as PrismaService,
      {} as CredentialsService,
    );

    const result = await service.getOperationsHealth();

    expect(result.status).toBe("degraded");
    expect(result.migrations.status).toBe("not_configured");
    expect(result.dependencies.database.status).toBe("healthy");
    expect(result.dependencies.database.latencyMs).toEqual(expect.any(Number));
    expect(result.dependencies.storage.status).toBe("not_instrumented");
    expect(result.dependencies.notifications.status).toBe("not_instrumented");
    expect(result.dependencies.backgroundJobs.status).toBe("not_instrumented");
    expect(result.checkedAt).toEqual(expect.any(String));
    // One query verifies database connectivity; the second checks Prisma migration status.
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it("reports healthy only when the configured migration baseline matches", async () => {
    vi.stubEnv("EXPECTED_MIGRATION_NAME", "20261026090000_init");
    const queryRaw = vi.fn()
      .mockResolvedValueOnce([{ "?column?": 1 }])
      .mockResolvedValueOnce([{ latest_migration: "20261026090000_init", unfinished_count: 0 }]);
    const service = new SuperAdminService(
      { client: { $queryRaw: queryRaw } } as unknown as PrismaService,
      {} as CredentialsService,
    );

    const result = await service.getOperationsHealth();

    expect(result.status).toBe("healthy");
    expect(result.migrations).toMatchObject({
      status: "current",
      latestApplied: "20261026090000_init",
      unfinishedCount: 0,
    });
  });

  it("degrades the overall status when the expected migration does not match", async () => {
    vi.stubEnv("EXPECTED_MIGRATION_NAME", "20261027090000_new_release");
    const queryRaw = vi.fn()
      .mockResolvedValueOnce([{ "?column?": 1 }])
      .mockResolvedValueOnce([{ latest_migration: "20261026090000_init", unfinished_count: 0 }]);
    const service = new SuperAdminService(
      { client: { $queryRaw: queryRaw } } as unknown as PrismaService,
      {} as CredentialsService,
    );

    const result = await service.getOperationsHealth();

    expect(result.status).toBe("degraded");
    expect(result.migrations.status).toBe("mismatch");
  });

  it("degrades the overall status when the database check fails", async () => {
    const queryRaw = vi.fn().mockRejectedValue(new Error("database unavailable"));
    const service = new SuperAdminService(
      { client: { $queryRaw: queryRaw } } as unknown as PrismaService,
      {} as CredentialsService,
    );

    const result = await service.getOperationsHealth();

    expect(result.status).toBe("degraded");
    expect(result.dependencies.database).toEqual({ status: "unavailable", latencyMs: null });
    // Do not return driver errors or connection details to the client.
    expect(JSON.stringify(result)).not.toContain("database unavailable");
  });
});
