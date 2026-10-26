import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { assertValidTaxBands } from "./payroll-settings.js";
import { PayrollSettingsService } from "./payroll-settings.service.js";

const D = (v: string) => new Prisma.Decimal(v);

describe("assertValidTaxBands", () => {
  it("accepts bounded bands followed by one open-ended band", () => {
    expect(assertValidTaxBands([{ position: 0, width: D("490"), rate: D("0") }, { position: 1, width: null, rate: D("35") }])).toHaveLength(2);
  });
  it.each([
    ["no bands", []],
    ["last band bounded", [{ position: 0, width: D("490"), rate: D("0") }]],
    ["open band in the middle", [{ position: 0, width: null, rate: D("0") }, { position: 1, width: null, rate: D("5") }]],
    ["gap in positions", [{ position: 0, width: D("1"), rate: D("0") }, { position: 2, width: null, rate: D("5") }]],
    ["rate over 100", [{ position: 0, width: null, rate: D("101") }]],
    ["zero width", [{ position: 0, width: D("0"), rate: D("0") }, { position: 1, width: null, rate: D("5") }]],
  ])("rejects %s", (_name, bands) => {
    expect(() => assertValidTaxBands(bands as never)).toThrow(/invalid bands/);
  });
});

describe("PayrollSettingsService", () => {
  const input = { name: "2027 PAYE", effectiveFrom: "2027-01-01", nonResidentRate: "25", sourceNote: "GRA notice 2027/01", bands: [{ width: "490", rate: "0" }, { width: null, rate: "35" }] };

  it("creates schedules only as DRAFT, scoped to the school", async () => {
    const create = vi.fn(async (args: unknown) => args);
    const service = new PayrollSettingsService({ client: { payrollTaxSchedule: { create } } } as never);
    await service.createTaxScheduleDraft("school-1", input);
    const data = (create.mock.calls[0]![0] as { data: { status: string; schoolId: string; bands: { create: unknown[] } } }).data;
    expect(data.status).toBe("DRAFT");
    expect(data.schoolId).toBe("school-1");
    expect(data.bands.create).toHaveLength(2);
  });

  it("rejects invalid bands and backwards dates before touching the database", async () => {
    const create = vi.fn();
    const service = new PayrollSettingsService({ client: { payrollTaxSchedule: { create } } } as never);
    await expect(service.createTaxScheduleDraft("s", { ...input, bands: [{ width: "490", rate: "0" }] })).rejects.toThrow(/invalid bands/);
    await expect(service.createTaxScheduleDraft("s", { ...input, effectiveTo: "2026-12-31" })).rejects.toThrow(/end date/);
    expect(create).not.toHaveBeenCalled();
  });

  it("activates only this school's own documented draft, recording the approver", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const findUniqueOrThrow = vi.fn(async () => ({ id: "t1" }));
    const service = new PayrollSettingsService({ client: { payrollTaxSchedule: { updateMany, findUniqueOrThrow } } } as never);
    await service.activate("school-1", "tax", "t1", "owner-1");
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "t1", schoolId: "school-1", status: "DRAFT", sourceNote: { not: null } },
      data: { status: "ACTIVE", approvedById: "owner-1" },
    });
  });

  it("refuses to activate a platform default, a missing draft or an overlapping period", async () => {
    const none = new PayrollSettingsService({ client: { payrollTaxSchedule: { updateMany: async () => ({ count: 0 }) } } } as never);
    await expect(none.activate("school-1", "tax", "platform-row", "owner")).rejects.toThrow(/not found/i);
    const overlap = new PayrollSettingsService({ client: { payrollContributionScheme: { updateMany: async () => { throw new Error('violates exclusion constraint "payroll_contribution_schemes_active_no_overlap"'); } } } } as never);
    await expect(overlap.activate("school-1", "scheme", "s1", "owner")).rejects.toThrow(/already covers/);
  });

  it("ending a setting keeps it ACTIVE so earlier periods still resolve", async () => {
    const update = vi.fn(async () => ({}));
    const service = new PayrollSettingsService({ client: { payrollTaxSchedule: {
      findFirst: async () => ({ id: "t1", effectiveFrom: new Date("2027-01-01T00:00:00Z") }), update,
      findUniqueOrThrow: async () => ({}),
    } } } as never);
    await service.setEndDate("s", "tax", "t1", "2027-12-31");
    expect(update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { effectiveTo: new Date("2027-12-31T00:00:00.000Z") } });
    await expect(service.setEndDate("s", "tax", "t1", "2026-12-31")).rejects.toThrow(/before/);
  });
});
