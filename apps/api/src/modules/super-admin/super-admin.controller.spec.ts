import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import request from "supertest";
import { SuperAdminController } from "./super-admin.controller.js";
import { SuperAdminService } from "./super-admin.service.js";

/** Boots the real controller + guards (throttler, super-admin) with a stubbed service and fake session. */
describe("SuperAdminController (HTTP)", () => {
  let app: INestApplication;
  let sessionUser: Record<string, unknown> | undefined;
  const service = {
    listSchools: vi.fn(async (q: unknown) => ({ data: [], meta: q })),
    listUsers: vi.fn(async () => ({ data: [], meta: {} })),
    listAuditLogs: vi.fn(async () => ({ data: [], meta: {} })),
    updateSubscription: vi.fn(async () => ({ ok: true })),
    getPlatformStats: vi.fn(async () => ({ totalSchools: 0 })),
    getOperationsHealth: vi.fn(async () => ({ status: "degraded", migrations: { status: "not_configured" } })),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 1000 }])],
      controllers: [SuperAdminController],
      providers: [{ provide: SuperAdminService, useValue: service }],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use((req: any, _res: unknown, next: () => void) => {
      if (sessionUser) req.session = { user: sessionUser };
      next();
    });
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  const asSuperAdmin = () => {
    sessionUser = { id: "sa1", role: "superAdmin", twoFactorEnabled: true };
  };

  it("401 for anonymous, 403 for school owners and admins", async () => {
    sessionUser = undefined;
    await request(app.getHttpServer()).get("/super-admin/stats").expect(401);
    sessionUser = { id: "u1", role: "owner" };
    await request(app.getHttpServer()).get("/super-admin/stats").expect(403);
    sessionUser = { id: "u2", role: "user" };
    await request(app.getHttpServer()).get("/super-admin/audit-logs").expect(403);
    expect(service.getPlatformStats).not.toHaveBeenCalled();
    expect(service.listAuditLogs).not.toHaveBeenCalled();
  });

  it("blocks banned super admins and accounts that must change temporary passwords", async () => {
    const http = request(app.getHttpServer());

    sessionUser = { id: "sa1", role: "superAdmin", twoFactorEnabled: true, banned: true };
    const banned = await http.get("/super-admin/stats").expect(403);
    expect(banned.body.message).toContain("suspended");

    sessionUser = { id: "sa1", role: "superAdmin", twoFactorEnabled: true, mustChangePassword: true };
    const passwordChange = await http.get("/super-admin/stats").expect(403);
    expect(passwordChange.body.error).toBe("PASSWORD_CHANGE_REQUIRED");
    expect(service.getPlatformStats).not.toHaveBeenCalled();
  });

  it("rejects a super admin who has not enrolled in two-factor, on every route", async () => {
    sessionUser = { id: "sa1", role: "superAdmin", twoFactorEnabled: false };
    const http = request(app.getHttpServer());
    const res = await http.get("/super-admin/stats").expect(403);
    expect(res.body.error).toBe("TWO_FACTOR_REQUIRED");
    await http.post("/super-admin/schools/s1/admins/u1/reset-two-factor").send({}).expect(403);
    await http.patch("/super-admin/schools/s1/subscription").send({ status: "ACTIVE" }).expect(403);
    expect(service.getPlatformStats).not.toHaveBeenCalled();
  });

  it("every route is protected, including writes", async () => {
    sessionUser = { id: "u1", role: "admin" };
    const http = request(app.getHttpServer());
    await http.post("/super-admin/schools").send({}).expect(403);
    await http.patch("/super-admin/schools/s1/subscription").send({ status: "ACTIVE" }).expect(403);
    await http.delete("/super-admin/schools/s1/admins/u1").expect(403);
    expect(service.updateSubscription).not.toHaveBeenCalled();
  });

  it("coerces and bounds list queries instead of trusting raw strings", async () => {
    asSuperAdmin();
    await request(app.getHttpServer()).get("/super-admin/schools?page=2&limit=50&status=ACTIVE&q=%20ach%20").expect(200);
    expect(service.listSchools).toHaveBeenLastCalledWith({ page: 2, limit: 50, status: "ACTIVE", q: "ach" });
    await request(app.getHttpServer()).get("/super-admin/schools").expect(200);
    expect(service.listSchools).toHaveBeenLastCalledWith({ page: 1, limit: 20 });
  });

  it("rejects negative, oversized and malformed pagination with 400", async () => {
    asSuperAdmin();
    for (const qs of ["limit=-5", "limit=101", "page=0", "limit=abc", "status=HACKED", "expiry=never"]) {
      await request(app.getHttpServer()).get(`/super-admin/schools?${qs}`).expect(400);
    }
  });

  it("validates the subscription body (unknown status, bad date) before the service runs", async () => {
    asSuperAdmin();
    service.updateSubscription.mockClear();
    await request(app.getHttpServer()).patch("/super-admin/schools/s1/subscription").send({ status: "CANCELED" }).expect(400);
    await request(app.getHttpServer()).patch("/super-admin/schools/s1/subscription").send({ status: "ACTIVE", expiresAt: "tomorrow-ish" }).expect(400);
    await request(app.getHttpServer()).patch("/super-admin/schools/s1/subscription").send({ status: "ACTIVE", expiresAt: null, note: "ok" }).expect(200);
    expect(service.updateSubscription).toHaveBeenCalledTimes(1);
    const [, , actor] = service.updateSubscription.mock.calls[0] as unknown as [string, unknown, { id: string }];
    expect(actor.id).toBe("sa1");
  });

  it("never lets operational health responses be cached", async () => {
    asSuperAdmin();
    const res = await request(app.getHttpServer()).get("/super-admin/operations/health").expect(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.status).toBe("degraded");
    expect(service.getOperationsHealth).toHaveBeenCalledTimes(1);
  });

  it("never lets the audit log response be cached", async () => {
    asSuperAdmin();
    const res = await request(app.getHttpServer()).get("/super-admin/audit-logs").expect(200);
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

describe("SuperAdminController write throttling", () => {
  it("returns 429 once a client exceeds the write budget", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 1000 }])],
      controllers: [SuperAdminController],
      providers: [{ provide: SuperAdminService, useValue: { updateSubscription: vi.fn(async () => ({})) } }],
    }).compile();
    const app = moduleRef.createNestApplication();
    app.use((req: any, _res: unknown, next: () => void) => {
      req.session = { user: { id: "sa1", role: "superAdmin", twoFactorEnabled: true } };
      next();
    });
    await app.init();
    const statuses: number[] = [];
    for (let i = 0; i < 35; i += 1) {
      const res = await request(app.getHttpServer()).patch("/super-admin/schools/s1/subscription").send({ status: "ACTIVE" });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(30).every((s) => s === 429)).toBe(true);
    await app.close();
  });
});
