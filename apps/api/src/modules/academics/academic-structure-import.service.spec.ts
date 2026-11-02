import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import type { PrismaService } from "../../prisma/prisma.service.js";
import { AcademicsService } from "./academics.service.js";
import { AcademicStructureImportService } from "./academic-structure-import.service.js";

function createService(existing: { name: string; code?: string }[] = []) {
  const prisma = {
    client: {
      department: { findMany: vi.fn().mockResolvedValue(existing) },
      house: { findMany: vi.fn().mockResolvedValue(existing) },
      club: { findMany: vi.fn().mockResolvedValue(existing.map(({ name }) => ({ name }))) },
      teacher: {
        findMany: vi.fn().mockResolvedValue([{ id: "teacher-1", invitationEmail: "teacher@example.test" }]),
      },
    },
  } as unknown as PrismaService;
  const createDepartment = vi.fn().mockResolvedValue({ id: "department-1" });
  const academics = {
    createDepartment,
    createHouse: vi.fn().mockResolvedValue({ id: "house-1" }),
    createClub: vi.fn().mockResolvedValue({ id: "club-1" }),
  } as unknown as AcademicsService;
  return { service: new AcademicStructureImportService(prisma, academics), academics, createDepartment };
}

describe("AcademicStructureImportService preview", () => {
  it("validates department headers and detects duplicate codes in the file", async () => {
    const { service } = createService();
    const result = await service.preview(
      { id: "school-1" },
      { buffer: Buffer.from("name,code,description\nScience,SCI,Science studies\nPhysics,SCI,Physics studies"), originalname: "departments.csv" },
      "departments",
    );
    expect(result.summary).toEqual({ total: 2, ready: 1, duplicate: 1, error: 0 });
    expect(result.rows[1]).toMatchObject({ status: "duplicate", rowNumber: 3 });
  });

  it("resolves teacher emails for houses and validates active status", async () => {
    const { service } = createService();
    const result = await service.preview(
      { id: "school-1" },
      { buffer: Buffer.from("name,code,houseTeacherEmail,isActive\nRed House,RED,teacher@example.test,TRUE\nBlue House,BLUE,missing@example.test,TRUE"), originalname: "houses.csv" },
      "houses",
    );
    expect(result.summary).toEqual({ total: 2, ready: 1, duplicate: 0, error: 1 });
    expect(result.rows[0]?.row).toMatchObject({ houseTeacherId: "teacher-1", isActive: true });
    expect(result.rows[1]?.errors[0]).toContain("No active teacher");
  });

  it("validates club names and recognizes inactive flags", async () => {
    const { service } = createService([{ name: "Chess Club" }]);
    const result = await service.preview(
      { id: "school-1" },
      { buffer: Buffer.from("name,description,isActive\nChess Club,Existing,false\nDrama Club,Performing arts,FALSE"), originalname: "clubs.csv" },
      "clubs",
    );
    expect(result.summary).toEqual({ total: 2, ready: 1, duplicate: 1, error: 0 });
    expect(result.rows[1]?.row).toMatchObject({ name: "Drama Club", isActive: false });
  });

  it("reads the named Excel data sheet while skipping instructions and examples", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Instructions").addRow(["Read me"]);
    const sheet = workbook.addWorksheet("Houses");
    sheet.addRow(["name", "code", "isActive"]);
    sheet.addRow(["Blue House", "BLU", "TRUE"]);
    workbook.addWorksheet("Example").addRow(["name", "code", "isActive"]);
    const { service } = createService();
    const result = await service.preview(
      { id: "school-1" },
      {
        buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
        originalname: "houses.xlsx",
      },
      "houses",
    );
    expect(result.file.format).toBe("xlsx");
    expect(result.summary).toEqual({ total: 1, ready: 1, duplicate: 0, error: 0 });
    expect(result.rows[0]?.row).toMatchObject({ name: "Blue House", code: "BLU", isActive: true });
  });

  it("rejects unknown kinds and missing required headers", async () => {
    const { service } = createService();
    await expect(service.preview(
      { id: "school-1" },
      { buffer: Buffer.from("name\nScience"), originalname: "input.csv" },
      "unknown",
    )).rejects.toThrow(/kind must be/);
    await expect(service.preview(
      { id: "school-1" },
      { buffer: Buffer.from("name\nScience"), originalname: "input.csv" },
      "departments",
    )).rejects.toThrow(/Missing required columns: code/);
  });
});

describe("AcademicStructureImportService import", () => {
  it("creates each validated department and enforces owner/admin permissions", async () => {
    const { service, createDepartment } = createService();
    const result = await service.importBatch(
      { id: "school-1" },
      "admin",
      "departments",
      [{ rowNumber: 2, row: { name: "Science", code: "sci" } }],
    );
    expect(result.results).toEqual([{ rowNumber: 2, name: "Science", status: "created" }]);
    expect(createDepartment).toHaveBeenCalledWith("school-1", { name: "Science", code: "SCI" });
    await expect(service.importBatch(
      { id: "school-1" },
      "staff",
      "departments",
      [{ rowNumber: 2, row: { name: "Science", code: "SCI" } }],
    )).rejects.toThrow(/Only school owners/);
  });

  it("returns per-row validation failures without aborting the batch", async () => {
    const { service } = createService();
    const result = await service.importBatch(
      { id: "school-1" },
      "staff",
      "clubs",
      [
        { rowNumber: 2, row: { name: "" } },
        { rowNumber: 3, row: { name: "Chess Club" } },
      ],
    );
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toMatchObject({ rowNumber: 2, status: "failed" });
    expect(result.results[1]).toMatchObject({ rowNumber: 3, status: "created" });
  });
});
