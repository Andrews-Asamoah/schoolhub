import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateInventoryItemInput, InventoryStockMovementInput } from "@schoolhub/shared";
import { PrismaService } from "../../prisma/prisma.service.js";

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  listItems(schoolId: string) {
    return this.prisma.client.inventoryItem.findMany({
      where: { schoolId },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      include: {
        transactions: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            type: true,
            quantity: true,
            date: true,
            description: true,
            recipientName: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async createItem(schoolId: string, performedById: string, input: CreateInventoryItemInput) {
    return this.prisma.client.$transaction(async (tx) => {
      const item = await tx.inventoryItem.create({
        data: {
          schoolId,
          name: input.name,
          description: input.description || null,
          category: input.category || null,
          unit: input.unit || "pcs",
          minQuantity: input.minQuantity,
          quantity: input.initialQuantity,
        },
      });

      if (input.initialQuantity > 0) {
        await tx.inventoryTransaction.create({
          data: {
            schoolId,
            itemId: item.id,
            type: "IN",
            quantity: input.initialQuantity,
            date: new Date(),
            description: "Opening stock",
            performedById,
          },
        });
      }
      return item;
    });
  }

  async recordMovement(
    schoolId: string,
    itemId: string,
    performedById: string,
    input: InventoryStockMovementInput,
  ) {
    const date = new Date(`${input.date}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException("Enter a valid stock movement date.");
    }

    return this.prisma.client.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findFirst({
        where: { id: itemId, schoolId },
        select: { id: true, quantity: true, name: true },
      });
      if (!item) throw new NotFoundException("Inventory item not found.");

      if (input.type === "OUT") {
        const updated = await tx.inventoryItem.updateMany({
          where: { id: itemId, schoolId, quantity: { gte: input.quantity } },
          data: { quantity: { decrement: input.quantity } },
        });
        if (updated.count !== 1) {
          throw new BadRequestException(
            `Insufficient stock for ${item.name}. Available quantity: ${item.quantity}.`,
          );
        }
      } else {
        await tx.inventoryItem.update({
          where: { id: itemId },
          data: { quantity: { increment: input.quantity } },
        });
      }

      return tx.inventoryTransaction.create({
        data: {
          schoolId,
          itemId,
          type: input.type,
          quantity: input.quantity,
          date,
          description: input.description || null,
          recipientName: input.recipientName || null,
          performedById,
        },
      });
    });
  }
}
