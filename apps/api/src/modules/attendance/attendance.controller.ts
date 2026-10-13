import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
} from "@nestjs/common";
import { AttendanceService } from "./attendance.service.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
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
  @Roles("owner", "admin", "teacher")
  batchRecordAttendance(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(batchAttendanceSchema))
    body: BatchAttendanceInput,
  ) {
    return this.attendanceService.batchRecordAttendance(
      school.id,
      user.id,
      body,
    );
  }

  @Get("class/:classId")
  getClassAttendance(
    @CurrentSchool() school: School,
    @Param("classId") classId: string,
    @Query("date") date: string,
  ) {
    const targetDate = date || new Date().toISOString().slice(0, 10);
    return this.attendanceService.getClassAttendance(
      school.id,
      classId,
      targetDate,
    );
  }

  @Get("student/:studentId")
  getStudentAttendance(
    @CurrentSchool() school: School,
    @Param("studentId") studentId: string,
  ) {
    return this.attendanceService.getStudentAttendanceSummary(
      school.id,
      studentId,
    );
  }
}
