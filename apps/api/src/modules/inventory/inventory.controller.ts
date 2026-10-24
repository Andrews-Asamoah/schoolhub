import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import {
  createInventoryItemSchema,
  inventoryStockMovementSchema,
  type CreateInventoryItemInput,
  type InventoryStockMovementInput,
} from "@schoolhub/shared";
import type { School } from "@prisma/client";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { InventoryService } from "./inventory.service.js";

@Controller("inventory")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get("items")
  @Roles("owner", "admin", "headteacher", "accountant")
  listItems(@CurrentSchool() school: School) {
    return this.inventoryService.listItems(school.id);
  }

  @Post("items")
  @Roles("owner", "admin", "headteacher", "accountant")
  createItem(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createInventoryItemSchema)) body: CreateInventoryItemInput,
  ) {
    return this.inventoryService.createItem(school.id, user.id, body);
  }

  @Post("items/:id/movements")
  @Roles("owner", "admin", "headteacher", "accountant")
  recordMovement(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(inventoryStockMovementSchema)) body: InventoryStockMovementInput,
  ) {
    return this.inventoryService.recordMovement(school.id, id, user.id, body);
  }
}
