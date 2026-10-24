import { Controller, Get, Patch, Param, UseGuards } from "@nestjs/common";
import type { School } from "@prisma/client";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { NotificationsService } from "./notifications.service.js";

const roles = ["owner", "admin", "headteacher", "teacher", "accountant", "staff", "student", "guardian"] as const;

@Controller("notifications")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @Roles(...roles)
  list(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.list(school.id, user.id);
  }

  @Patch("read-all")
  @Roles(...roles)
  markAllRead(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markAllRead(school.id, user.id);
  }

  @Patch(":id/read")
  @Roles(...roles)
  markRead(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.notificationsService.markRead(school.id, user.id, id);
  }
}