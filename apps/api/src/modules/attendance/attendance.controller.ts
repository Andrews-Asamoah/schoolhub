import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Headers,
  Body,
  UseGuards,
} from "@nestjs/common";
import { AttendanceService } from "./attendance.service.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentSchoolRole } from "../../common/decorators/current-school-role.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import {
  batchAttendanceSchema,
  type BatchAttendanceInput,
} from "@schoolhub/shared";
import type { School } from "@prisma/client";

@Controller("attendance")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post("batch")
  @Roles("teacher")
  batchRecordAttendance(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSchoolRole() role: string | undefined,
    @Body(new ZodValidationPipe(batchAttendanceSchema))
    body: BatchAttendanceInput,
  ) {
    return this.attendanceService.batchRecordAttendance(
      school.id,
      user.id,
      body,
      role,
    );
  }

  @Get("class/:classId")
  @Roles("owner", "admin", "teacher", "staff", "accountant")
  getClassAttendance(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Param("classId") classId: string,
    @Query("date") date: string | undefined,
    @CurrentSchoolRole() role: string | undefined,
    @Headers("x-academic-year-id") academicYearId?: string,
    @Headers("x-academic-term-id") termId?: string,
  ) {
    return this.attendanceService.getClassAttendance(
      school.id,
      classId,
      date,
      role,
      academicYearId,
      termId,
      user.id,
    );
  }

  @Get("me")
  @Roles("student")
  getMyAttendance(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Headers("x-academic-year-id") academicYearId?: string,
    @Headers("x-academic-term-id") termId?: string,
  ) {
    return this.attendanceService.getMyAttendanceSummary(
      school.id,
      user.id,
      academicYearId,
      termId,
    );
  }

  @Get("student/:studentId")
  @Roles("owner", "admin", "teacher", "staff", "accountant")
  getStudentAttendance(
    @CurrentSchool() school: School,
    @Param("studentId") studentId: string,
    @CurrentSchoolRole() role: string | undefined,
    @Headers("x-academic-year-id") academicYearId?: string,
    @Headers("x-academic-term-id") termId?: string,
  ) {
    return this.attendanceService.getStudentAttendanceSummary(
      school.id,
      studentId,
      role,
      academicYearId,
      termId,
    );
  }
}
