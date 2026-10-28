import { describe, expect, it, vi } from "vitest";
import { ServiceUnavailableException } from "@nestjs/common";

vi.mock("./prisma/prisma.service.js", () => ({ PrismaService: class PrismaService {} }));

import { HealthController, buildVersion, databaseIsReachable } from "./health.controller.js";
import type { PrismaService } from "./prisma/prisma.service.js";

const prismaWith = (queryRaw: () => Promise<unknown>) =>
  ({ client: { $queryRaw: queryRaw } }) as unknown as PrismaService;

describe("health probes", () => {
  it("keeps the legacy /health response", () => {
    expect(new HealthController(prismaWith(vi.fn())).health()).toEqual({ ok: true });
  });

  it("liveness never touches the database", () => {
    const query = vi.fn();
    const result = new HealthController(prismaWith(query)).live();
    expect(result.status).toBe("ok");
    expect(query).not.toHaveBeenCalled();
  });

  it("readiness succeeds when the database answers", async () => {
    const controller = new HealthController(prismaWith(vi.fn().mockResolvedValue([{ "?column?": 1 }])));
    await expect(controller.ready()).resolves.toMatchObject({ status: "ready", database: "up" });
  });

  it("readiness returns 503 without leaking error details when the database is down", async () => {
    const controller = new HealthController(prismaWith(vi.fn().mockRejectedValue(new Error("password authentication failed for user x"))));
    const error = await controller.ready().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(JSON.stringify((error as ServiceUnavailableException).getResponse())).not.toContain("password");
  });

  it("treats a hung database as unreachable instead of hanging the probe", async () => {
    const never = () => new Promise<unknown>(() => undefined);
    await expect(databaseIsReachable(never, 20)).resolves.toBe(false);
  });

  it("reports the build version with the same precedence as the operations report", () => {
    expect(buildVersion({ BUILD_SHA: "a", GIT_SHA: "b", SOURCE_VERSION: "c" } as NodeJS.ProcessEnv)).toBe("a");
    expect(buildVersion({ GIT_SHA: "b" } as NodeJS.ProcessEnv)).toBe("b");
    expect(buildVersion({} as NodeJS.ProcessEnv)).toBe("unknown");
  });
});
