import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  Headers,
  UseGuards,
} from "@nestjs/common";
import { AcademicsService } from "./academics.service.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentSchoolRole } from "../../common/decorators/current-school-role.decorator.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import {
  createClassSchema,
  createClassTeacherAssignmentSchema,
  createDepartmentSchema,
  createEnrollmentSchema,
  createSubjectSchema,
  updateClassSchema,
  type CreateClassInput,
  type CreateClassTeacherAssignmentInput,
  type CreateDepartmentInput,
  type CreateEnrollmentInput,
  type CreateSubjectInput,
  type UpdateClassInput,
} from "@schoolhub/shared";
import type { School } from "@prisma/client";

@Controller("academics")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class AcademicsController {
  constructor(private readonly academicsService: AcademicsService) {}

  @Get("classes")
  @Roles("owner", "admin", "teacher", "staff", "accountant")
  listClasses(
    @CurrentSchool() school: School,
    @CurrentSchoolRole() role: string | undefined,
    @Headers("x-academic-year-id") academicYearId?: string,
    @Headers("x-academic-term-id") termId?: string,
  ) {
    return this.academicsService.listClasses(
      school.id,
      academicYearId,
      termId,
      role,
    );
  }

  @Get("enrollments")
  @Roles("owner", "admin", "teacher", "staff", "accountant")
  listEnrollments(
    @CurrentSchool() school: School,
    @Query("academicYearId") queryAcademicYearId: string | undefined,
    @Query("termId") termId?: string,
    @Query("classId") classId?: string,
    @CurrentSchoolRole() role?: string,
    @Headers("x-academic-year-id") viewAcademicYearId?: string,
    @Headers("x-academic-term-id") viewTermId?: string,
  ) {
    return this.academicsService.listEnrollments(
      school.id,
      queryAcademicYearId ?? viewAcademicYearId,
      termId ?? viewTermId,
      classId,
      role,
    );
  }

  @Get("eligible-students")
  @Roles("owner", "admin", "staff")
  listEligibleStudents(
    @CurrentSchool() school: School,
    @Query("academicYearId") academicYearId: string,
    @Query("termId") termId: string,
    @Query("search") search?: string,
    @CurrentSchoolRole() role?: string,
  ) {
    return this.academicsService.listEligibleStudents(
      school.id,
      academicYearId,
      termId,
      search,
      role,
    );
  }

  @Post("enrollments")
  @Roles("owner", "admin", "staff")
  createEnrollments(
    @CurrentSchool() school: School,
    @CurrentSchoolRole() role: string | undefined,
    @Body(new ZodValidationPipe(createEnrollmentSchema))
    body: CreateEnrollmentInput,
  ) {
    return this.academicsService.createEnrollments(school.id, body, role);
  }

  @Get("teachers")
  @Roles("owner", "admin")
  listClassTeachers(@CurrentSchool() school: School) {
    return this.academicsService.listClassTeachers(school.id);
  }

  @Post("classes")
  @Roles("owner", "admin")
  createClass(
    @CurrentSchool() school: School,
    @Body(new ZodValidationPipe(createClassSchema)) body: CreateClassInput,
  ) {
    return this.academicsService.createClass(school.id, body);
  }

  @Patch("classes/:id")
  @Roles("owner", "admin")
  updateClass(
    @CurrentSchool() school: School,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateClassSchema)) body: UpdateClassInput,
  ) {
    return this.academicsService.updateClass(school.id, id, body);
  }

  @Get("classes/:id/teacher-assignments")
  @Roles("owner", "admin", "teacher", "staff")
  listClassTeacherAssignments(
    @CurrentSchool() school: School,
    @Param("id") id: string,
  ) {
    return this.academicsService.listClassTeacherAssignments(school.id, id);
  }

  @Post("classes/:id/teacher-assignments")
  @Roles("owner", "admin")
  assignClassTeacher(
    @CurrentSchool() school: School,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createClassTeacherAssignmentSchema))
    body: CreateClassTeacherAssignmentInput,
  ) {
    return this.academicsService.assignClassTeacher(school.id, id, body);
  }

  @Get("departments")
  @Roles("owner", "admin", "teacher", "staff")
  listDepartments(@CurrentSchool() school: School) {
    return this.academicsService.listDepartments(school.id);
  }

  @Post("departments")
  @Roles("owner", "admin")
  createDepartment(
    @CurrentSchool() school: School,
    @Body(new ZodValidationPipe(createDepartmentSchema))
    body: CreateDepartmentInput,
  ) {
    return this.academicsService.createDepartment(school.id, body);
  }

  @Get("classes/:id/students")
  @Roles("owner", "admin", "teacher", "staff", "accountant")
  getClassStudents(
    @CurrentSchool() school: School,
    @Param("id") id: string,
    @Query("academicYearId") queryAcademicYearId: string | undefined,
    @Query("termId") termId?: string,
    @CurrentSchoolRole() role?: string,
    @Headers("x-academic-year-id") viewAcademicYearId?: string,
    @Headers("x-academic-term-id") viewTermId?: string,
  ) {
    return this.academicsService.getClassStudents(
      school.id,
      id,
      queryAcademicYearId ?? viewAcademicYearId,
      termId ?? viewTermId,
      role,
    );
  }

  @Get("subjects")
  @Roles("owner", "admin", "teacher")
  listSubjects(@CurrentSchool() school: School) {
    return this.academicsService.listSubjects(school.id);
  }

  @Post("subjects")
  @Roles("owner", "admin")
  createSubject(
    @CurrentSchool() school: School,
    @Body(new ZodValidationPipe(createSubjectSchema)) body: CreateSubjectInput,
  ) {
    return this.academicsService.createSubject(school.id, body);
  }
}
