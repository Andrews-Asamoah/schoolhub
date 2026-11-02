import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import type { PrismaService } from "../../prisma/prisma.service.js";
import { AcademicsService } from "./academics.service.js";
import { AcademicStructureImportService } from "./academic-structure-import.service.js";

function createService(existing: {
  id?: string;
  name: string;
  code?: string;
  description?: string | null;
  color?: string | null;
  motto?: string | null;
  houseTeacherId?: string | null;
  isActive?: boolean;
}[] = []) {
  const prisma = {
    client: {
      department: {
        findMany: vi.fn().mockImplementation((args: { select?: { id?: boolean } }) =>
          args.select?.id
            ? [{ id: "department-1", name: "Junior High", code: "JHS" }]
            : existing,
        ),
      },
      class: { findMany: vi.fn().mockResolvedValue(existing.map(({ name }) => ({ name }))) },
      house: {
        findMany: vi.fn().mockResolvedValue(existing),
        findFirst: vi.fn().mockImplementation(({ where }: { where: { id: string; code: string } }) =>
          existing.find((house) => house.id === where.id && house.code === where.code) ?? null,
        ),
      },
      club: { findMany: vi.fn().mockResolvedValue(existing.map(({ name }) => ({ name }))) },
      teacher: {
        findMany: vi.fn().mockResolvedValue([{ id: "teacher-1", invitationEmail: "teacher@example.test" }]),
      },
    },
  } as unknown as PrismaService;
  const createDepartment = vi.fn().mockResolvedValue({ id: "department-1" });
  const createClass = vi.fn().mockResolvedValue({ id: "class-1" });
  const updateHouse = vi.fn().mockResolvedValue({ id: "house-1" });
  const academics = {
    createDepartment,
    createClass,
    updateHouse,
    createHouse: vi.fn().mockResolvedValue({ id: "house-1" }),
    createClub: vi.fn().mockResolvedValue({ id: "club-1" }),
  } as unknown as AcademicsService;
  return { service: new AcademicStructureImportService(prisma, academics), academics, createDepartment, createClass, updateHouse };
}

describe("AcademicStructureImportService preview", () => {
  it("validates department headers and detects duplicate codes in the file", async () => {
    const { service } = createService();
    const result = await service.preview(
      { id: "school-1" },
      { buffer: Buffer.from("name,code,description\nScience,SCI,Science studies\nPhysics,SCI,Physics studies"), originalname: "departments.csv" },
      "departments",
    );
    expect(result.summary).toEqual({ total: 2, ready: 1, update: 0, duplicate: 1, error: 0 });
    expect(result.rows[1]).toMatchObject({ status: "duplicate", rowNumber: 3 });
  });

  it("resolves teacher emails for houses and validates active status", async () => {
    const { service } = createService();
    const result = await service.preview(
      { id: "school-1" },
      { buffer: Buffer.from("name,code,houseTeacherEmail,isActive\nRed House,RED,teacher@example.test,TRUE\nBlue House,BLUE,missing@example.test,TRUE"), originalname: "houses.csv" },
      "houses",
    );
    expect(result.summary).toEqual({ total: 2, ready: 1, update: 0, duplicate: 0, error: 1 });
    expect(result.rows[0]?.row).toMatchObject({ houseTeacherId: "teacher-1", isActive: true });
    expect(result.rows[1]?.errors[0]).toContain("No active teacher");
  });

  it("recognizes an existing house and previews changed fields as an update", async () => {
    const { service } = createService([{
      id: "house-1",
      name: "Red House",
      code: "RED",
      description: "Old description",
      color: "#C0392B",
      motto: "Old motto",
      houseTeacherId: null,
      isActive: true,
    }]);
    const result = await service.preview(
      { id: "school-1" },
      {
        buffer: Buffer.from("name,code,description,color,motto,houseTeacherEmail,isActive\nRed House,RED,Updated description,,,,TRUE"),
        originalname: "houses.csv",
      },
      "houses",
    );
    expect(result.summary).toEqual({ total: 1, ready: 0, update: 1, duplicate: 0, error: 0 });
    expect(result.rows[0]).toMatchObject({
      status: "update",
      existingId: "house-1",
      matchCode: "RED",
      row: { description: "Updated description", color: null, motto: null },
    });
  });

  it("validates club names and recognizes inactive flags", async () => {
    const { service } = createService([{ name: "Chess Club" }]);
    const result = await service.preview(
      { id: "school-1" },
      { buffer: Buffer.from("name,description,isActive\nChess Club,Existing,false\nDrama Club,Performing arts,FALSE"), originalname: "clubs.csv" },
      "clubs",
    );
    expect(result.summary).toEqual({ total: 2, ready: 1, update: 0, duplicate: 1, error: 0 });
    expect(result.rows[1]?.row).toMatchObject({ name: "Drama Club", isActive: false });
  });

  it("resolves class departments and validates optional class settings", async () => {
    const { service } = createService();
    const result = await service.preview(
      { id: "school-1" },
      {
        buffer: Buffer.from("name,level,departmentCode,capacity,isGraduatingClass,isActive,order\nJHS 1A,JHS 1,JHS,40,FALSE,TRUE,1"),
        originalname: "classes.csv",
      },
      "classes",
    );
    expect(result.summary).toEqual({ total: 1, ready: 1, update: 0, duplicate: 0, error: 0 });
    expect(result.rows[0]?.row).toMatchObject({
      name: "JHS 1A",
      level: "JHS 1",
      departmentId: "department-1",
      capacity: 40,
      isGraduatingClass: false,
      isActive: true,
      order: 1,
    });
  });

  it("reports invalid department references and duplicate class names", async () => {
    const { service } = createService([{ name: "Existing Class" }]);
    const result = await service.preview(
      { id: "school-1" },
      {
        buffer: Buffer.from("name,level,departmentCode\nExisting Class,JHS 1,JHS\nNew Class,JHS 1,UNKNOWN"),
        originalname: "classes.csv",
      },
      "classes",
    );
    expect(result.summary).toEqual({ total: 2, ready: 0, update: 0, duplicate: 1, error: 1 });
    expect(result.rows[0]?.status).toBe("duplicate");
    expect(result.rows[1]?.errors[0]).toContain("No department with code");
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
    expect(result.summary).toEqual({ total: 1, ready: 1, update: 0, duplicate: 0, error: 0 });
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

  it("creates validated classes for owners and administrators only", async () => {
    const { service, createClass } = createService();
    const rows = [{
      rowNumber: 2,
      row: { name: "JHS 1A", level: "JHS 1", departmentId: "department-1" },
    }];
    const result = await service.importBatch({ id: "school-1" }, "admin", "classes", rows);
    expect(result.results).toEqual([{ rowNumber: 2, name: "JHS 1A", status: "created" }]);
    expect(createClass).toHaveBeenCalledWith("school-1", expect.objectContaining({
      name: "JHS 1A",
      departmentId: "department-1",
    }));
    await expect(service.importBatch({ id: "school-1" }, "headteacher", "classes", rows))
      .rejects.toThrow(/Only school owners/);
  });

  it("updates only nonblank changed house fields by default", async () => {
    const { service, updateHouse } = createService([{
      id: "house-1",
      name: "Red House",
      code: "RED",
      description: "Old description",
      color: "#C0392B",
      motto: "Courage",
      houseTeacherId: null,
      isActive: true,
    }]);
    const result = await service.importBatch(
      { id: "school-1" },
      "admin",
      "houses",
      [{
        rowNumber: 2,
        existingId: "house-1",
        matchCode: "RED",
        row: {
          name: "Red House",
          code: "RED",
          description: "Updated description",
          color: null,
          motto: null,
          houseTeacherId: null,
        },
      }],
    );
    expect(result.results).toEqual([{ rowNumber: 2, name: "Red House", status: "updated" }]);
    expect(updateHouse).toHaveBeenCalledWith("school-1", "house-1", { description: "Updated description" });
  });

  it("replaces all house fields and clears blank optional values when requested", async () => {
    const { service, updateHouse } = createService([{
      id: "house-1",
      name: "Red House",
      code: "RED",
      description: "Old description",
      color: "#C0392B",
      motto: "Courage",
      houseTeacherId: "teacher-1",
      isActive: true,
    }]);
    const result = await service.importBatch(
      { id: "school-1" },
      "admin",
      "houses",
      [{
        rowNumber: 2,
        existingId: "house-1",
        matchCode: "RED",
        row: {
          name: "Red House",
          code: "RED",
          description: null,
          color: null,
          motto: null,
          houseTeacherId: null,
          isActive: false,
        },
      }],
      "replace",
    );
    expect(result.results).toEqual([{ rowNumber: 2, name: "Red House", status: "updated" }]);
    expect(updateHouse).toHaveBeenCalledWith("school-1", "house-1", {
      description: null,
      color: null,
      motto: null,
      houseTeacherId: null,
      isActive: false,
    });
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
