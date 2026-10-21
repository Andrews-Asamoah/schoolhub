import { Controller, Get, UseGuards } from "@nestjs/common";
import type { School } from "@prisma/client";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { TeachingService } from "./teaching.service.js";

@Controller("teaching")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class TeachingController {
  constructor(private readonly teaching: TeachingService) {}

  @Get("me")
  @Roles("teacher")
  overview(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser) {
    return this.teaching.overview(school.id, user.id);
  }
}
