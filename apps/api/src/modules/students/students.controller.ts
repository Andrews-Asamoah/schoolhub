import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Headers,
  Body,
  UseGuards,
} from "@nestjs/common";
import { StudentsService } from "./students.service.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentSchoolRole } from "../../common/decorators/current-school-role.decorator.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import {
  createStudentSchema,
  updateStudentRecordSchema,
  type CreateStudentInput,
  type UpdateStudentInput,
} from "@schoolhub/shared";
import type { School, StudentStatus } from "@prisma/client";

@Controller("students")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  @Roles("owner", "admin", "teacher", "staff", "accountant")
  listStudents(
    @CurrentSchool() school: School,
    @CurrentSchoolRole() role: string | undefined,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("classId") classId?: string,
    @Query("academicYearId") academicYearId?: string,
    @Query("termId") termId?: string,
    @Headers("x-academic-year-id") viewAcademicYearId?: string,
    @Headers("x-academic-term-id") viewTermId?: string,
    @Query("search") search?: string,
    @Query("status") status?: StudentStatus,
  ) {
    return this.studentsService.listStudents(school.id, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      classId,
      academicYearId: academicYearId ?? viewAcademicYearId,
      termId: termId ?? viewTermId,
      search,
      status,
      role,
    });
  }

  @Get(":id")
  @Roles("owner", "admin", "teacher", "staff", "accountant")
  getStudentById(
    @CurrentSchool() school: School,
    @CurrentSchoolRole() role: string | undefined,
    @Param("id") id: string,
    @Headers("x-academic-year-id") academicYearId?: string,
    @Headers("x-academic-term-id") termId?: string,
  ) {
    return this.studentsService.getStudentById(
      school.id,
      id,
      role,
      academicYearId,
      termId,
    );
  }

  @Post()
  @Roles("owner", "admin", "staff")
  createStudent(
    @CurrentSchool() school: School,
    @Body(new ZodValidationPipe(createStudentSchema)) body: CreateStudentInput,
  ) {
    return this.studentsService.createStudent(school.id, body);
  }

  @Patch(":id")
  @Roles("owner", "admin", "staff")
  updateStudent(
    @CurrentSchool() school: School,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateStudentRecordSchema)) body: UpdateStudentInput,
  ) {
    return this.studentsService.updateStudent(school.id, id, body);
  }

  @Delete(":id")
  @Roles("owner", "admin")
  deleteStudent(
    @CurrentSchool() school: School,
    @Param("id") id: string,
  ) {
    return this.studentsService.deleteStudent(school.id, id);
  }
}
