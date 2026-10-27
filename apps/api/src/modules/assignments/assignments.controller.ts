import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import type { School } from "@prisma/client";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentSchoolRole } from "../../common/decorators/current-school-role.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import {
  createSchoolAssignmentSchema,
  gradeSchoolAssignmentSchema,
  submitSchoolAssignmentSchema,
  type CreateSchoolAssignmentInput,
  type GradeSchoolAssignmentInput,
  type SubmitSchoolAssignmentInput,
} from "./assignments.schemas.js";
import { AssignmentsService } from "./assignments.service.js";

@Controller("assignments")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get("manage")
  @Roles("owner", "admin", "headteacher", "teacher")
  listManaged(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSchoolRole() role: string | undefined,
  ) {
    return this.assignments.listManaged(school.id, user.id, role);
  }

  @Get()
  @Roles("student")
  listForStudent(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser) {
    return this.assignments.listForStudent(school.id, user.id);
  }

  @Post()
  @Roles("owner", "admin", "headteacher", "teacher")
  create(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSchoolRole() role: string | undefined,
    @Body(new ZodValidationPipe(createSchoolAssignmentSchema)) body: CreateSchoolAssignmentInput,
  ) {
    return this.assignments.create(school.id, user.id, role, body);
  }

  @Post(":id/submission")
  @Roles("student")
  submit(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") assignmentId: string,
    @Body(new ZodValidationPipe(submitSchoolAssignmentSchema)) body: SubmitSchoolAssignmentInput,
  ) {
    return this.assignments.submit(school.id, user.id, assignmentId, body);
  }

  @Patch(":id/submissions/:submissionId/grade")
  @Roles("owner", "admin", "headteacher", "teacher")
  grade(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSchoolRole() role: string | undefined,
    @Param("id") assignmentId: string,
    @Param("submissionId") submissionId: string,
    @Body(new ZodValidationPipe(gradeSchoolAssignmentSchema)) body: GradeSchoolAssignmentInput,
  ) {
    return this.assignments.grade(school.id, user.id, role, assignmentId, submissionId, body);
  }
}
