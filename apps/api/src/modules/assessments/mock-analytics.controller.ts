import { BadRequestException, Controller, Get, Query, UseGuards } from "@nestjs/common";
import type { School } from "@prisma/client";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentSchoolRole } from "../../common/decorators/current-school-role.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { MockAnalyticsService } from "./mock-analytics.service.js";

/** Read-only comparison of a class's mock exams. Staff only; teachers see their own subjects. */
@Controller("mock-analytics")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class MockAnalyticsController {
  constructor(private readonly analytics: MockAnalyticsService) {}

  @Get("options")
  @Roles("owner", "admin", "headteacher", "teacher")
  options(@CurrentSchool() school: School) {
    return this.analytics.options(school.id);
  }

  @Get()
  @Roles("owner", "admin", "headteacher", "teacher")
  analyse(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSchoolRole() role: string | undefined,
    @Query("academicYearId") academicYearId?: string,
    @Query("classId") classId?: string,
    @Query("includeDrafts") includeDrafts?: string,
  ) {
    if (!academicYearId || !classId) throw new BadRequestException("Choose an academic year and a class.");
    return this.analytics.analyse(school.id, user.id, role, { academicYearId, classId, includeDrafts: includeDrafts === "true" });
  }
}
