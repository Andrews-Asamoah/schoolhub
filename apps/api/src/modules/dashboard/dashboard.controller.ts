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
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("analytics")
  // School-wide analytics: leadership only. Accountants, teachers and staff get scoped overviews.
  @Roles("owner", "admin", "headteacher")
  getAnalytics(
    @CurrentSchool() school: School,
    @CurrentSchoolRole() role: string | undefined,
    @Query("months") months?: string,
  ) {
    return this.dashboardService.getAnalytics(school.id, role, Number(months) || 6);
  }
}
