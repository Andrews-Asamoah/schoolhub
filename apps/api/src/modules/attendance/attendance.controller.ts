import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Param,
  Query,
  Headers,
  Body,
  UseGuards,
} from "@nestjs/common";
import { AttendanceService } from "./attendance.service.js";
import { AttendanceCalendarService } from "./attendance-calendar.service.js";
import { calendarConfigurationSchema, attendanceExclusionSchema, revokeExclusionSchema, attendanceRolloutPolicySchema } from "./attendance-calendar.schemas.js";
import { z } from "zod";
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
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly calendarService: AttendanceCalendarService,
  ) {}

  @Get("policy")
  @Roles("owner", "admin", "headteacher")
  getAttendancePolicy(@CurrentSchool() school: School) {
    return this.calendarService.getPolicy(school.id);
  }

  @Patch("policy")
  @Roles("owner", "admin", "headteacher")
  updateAttendancePolicy(
    @CurrentSchool() school: School,
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(attendanceRolloutPolicySchema))
    input: z.infer<typeof attendanceRolloutPolicySchema>,
  ) {
    return this.calendarService.setPolicy(school.id, actor.id, input);
  }

  @Get("calendar/:termId")
  @Roles("owner", "admin", "headteacher", "teacher", "staff", "accountant")
  calendar(@CurrentSchool() school: School, @Param("termId") termId: string) {
    return this.calendarService.getCalendar(school.id, termId);
  }

  @Put("calendar/:termId")
  @Roles("owner", "admin", "headteacher")
  updateCalendar(@CurrentSchool() school: School, @CurrentUser() actor: AuthenticatedUser,
    @Param("termId") termId: string,
    @Body(new ZodValidationPipe(calendarConfigurationSchema)) body: z.infer<typeof calendarConfigurationSchema>) {
    return this.calendarService.replaceCalendar(school.id, actor.id, termId, body);
  }

  @Get("calendar/:termId/exclusions/:studentId")
  @Roles("owner", "admin", "headteacher")
  exclusions(@CurrentSchool() school: School, @Param("termId") termId: string, @Param("studentId") studentId: string) {
    return this.calendarService.listExclusions(school.id, termId, studentId);
  }

  @Post("calendar/exclusions")
  @Roles("owner", "admin", "headteacher")
  approveExclusion(@CurrentSchool() school: School, @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(attendanceExclusionSchema)) body: z.infer<typeof attendanceExclusionSchema>) {
    return this.calendarService.approveExclusion(school.id, actor.id, body);
  }

  @Delete("calendar/exclusions/:id")
  @Roles("owner", "admin", "headteacher")
  revokeExclusion(@CurrentSchool() school: School, @CurrentUser() actor: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(revokeExclusionSchema)) body: z.infer<typeof revokeExclusionSchema>) {
    return this.calendarService.revokeExclusion(school.id, actor.id, id, body.reason);
  }


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

  @Get("class/:classId/dates")
  @Roles("owner", "admin", "teacher", "staff", "accountant")
  getClassAttendanceDates(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Param("classId") classId: string,
    @CurrentSchoolRole() role: string | undefined,
    @Headers("x-academic-year-id") academicYearId?: string,
    @Headers("x-academic-term-id") termId?: string,
  ) {
    return this.attendanceService.getClassAttendanceDates(
      school.id, classId, role, academicYearId, termId, user.id,
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

  /** Attendance for a child linked to the authenticated guardian. */
  @Get("guardian/:studentId")
  @Roles("guardian")
  getGuardianWardAttendance(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Param("studentId") studentId: string,
    @Headers("x-academic-year-id") academicYearId?: string,
    @Headers("x-academic-term-id") termId?: string,
  ) {
    return this.attendanceService.getGuardianWardAttendance(
      school.id, user.id, studentId, academicYearId, termId,
    );
  }

}
