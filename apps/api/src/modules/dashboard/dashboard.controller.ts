import { PortalWorkQueueService } from "./portal-work-queue.service.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { DashboardService } from "./dashboard.service.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentSchoolRole } from "../../common/decorators/current-school-role.decorator.js";
import type { School } from "@prisma/client";

@Controller("dashboard")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService, private readonly workQueue: PortalWorkQueueService) {}

  @Get("work-queue")
  @Roles("owner", "admin", "headteacher", "teacher", "student")
  getWorkQueue(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser,
    @CurrentSchoolRole() role: string | undefined) {
    return this.workQueue.get(school.id, user.id, role);
  }

  @Get("analytics")
  @Roles("owner", "admin", "headteacher", "accountant", "teacher", "staff")
  getAnalytics(
    @CurrentSchool() school: School,
    @CurrentSchoolRole() role: string | undefined,
    @Query("months") months?: string,
  ) {
    return this.dashboardService.getAnalytics(school.id, role, Number(months) || 6);
  }
}
