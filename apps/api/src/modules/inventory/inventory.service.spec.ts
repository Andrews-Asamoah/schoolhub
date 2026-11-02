import { BadRequestException, ConflictException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { InventoryController } from "./inventory.controller.js";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../../prisma/prisma.service.js";
import { InventoryService } from "./inventory.service.js";

describe("InventoryService categories", () => {
  it("allows only accountants to add inventory categories", () => {
    const createCategoryHandler = Object.getOwnPropertyDescriptor(
      InventoryController.prototype,
      "createCategory",
    )?.value;
    const requiredRoles = Reflect.getMetadata("roles", createCategoryHandler);
    expect(requiredRoles).toEqual(["accountant"]);
    for (const role of ["admin", "owner", "headteacher", "staff"]) {
      const guard = new RolesGuard({ getAllAndOverride: () => requiredRoles } as never);
      const request = { session: { user: { role: "user" } }, membership: { role }, schoolRole: role };
      const context = {
        getHandler: () => createCategoryHandler,
        getClass: () => InventoryController,
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;
      expect(() => guard.canActivate(context)).toThrow();
    }
    const guard = new RolesGuard({ getAllAndOverride: () => requiredRoles } as never);
    const request = { session: { user: { role: "user" } }, membership: { role: "accountant" }, schoolRole: "accountant" };
    const context = {
      getHandler: () => createCategoryHandler,
      getClass: () => InventoryController,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    expect(guard.canActivate(context)).toBe(true);
  });

  it("creates a school-scoped fixed category", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockResolvedValue({
      id: "category-1",
      name: "Learning materials",
      description: null,
    });
    const prisma = {
      client: { inventoryCategory: { findFirst, create } },
    } as unknown as PrismaService;

    const result = await new InventoryService(prisma).createCategory("school-1", {
      name: "  Learning materials ",
    });

    expect(result.name).toBe("Learning materials");
    expect(findFirst).toHaveBeenCalledWith({
      where: { schoolId: "school-1", name: { equals: "Learning materials", mode: "insensitive" } },
      select: { id: true },
    });
    expect(create).toHaveBeenCalledWith({
      data: { schoolId: "school-1", name: "Learning materials", description: null },
      select: { id: true, name: true, description: true },
    });
  });

  it("rejects duplicate category names without regard to case", async () => {
    const create = vi.fn();
    const prisma = {
      client: {
        inventoryCategory: {
          findFirst: vi.fn().mockResolvedValue({ id: "category-1" }),
          create,
        },
      },
    } as unknown as PrismaService;

    await expect(
      new InventoryService(prisma).createCategory("school-1", { name: "learning materials" }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(create).not.toHaveBeenCalled();
  });

  it("requires item categories to belong to the active school", async () => {
    const transaction = vi.fn();
    const prisma = {
      client: {
        inventoryCategory: { findFirst: vi.fn().mockResolvedValue(null) },
        $transaction: transaction,
      },
    } as unknown as PrismaService;

    await expect(
      new InventoryService(prisma).createItem("school-1", "user-1", {
        name: "Exercise books",
        category: "Other school's category",
        unit: "pcs",
        minQuantity: 0,
        initialQuantity: 0,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });
});
