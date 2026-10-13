import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
} from "@nestjs/common";
import { StudentsService } from "./students.service.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import {
  createStudentSchema,
  updateStudentSchema,
  type CreateStudentInput,
  type UpdateStudentInput,
} from "@schoolhub/shared";
import type { School, StudentStatus } from "@prisma/client";

@Controller("students")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  listStudents(
    @CurrentSchool() school: School,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("classId") classId?: string,
    @Query("search") search?: string,
    @Query("status") status?: StudentStatus,
  ) {
    return this.studentsService.listStudents(school.id, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      classId,
      search,
      status,
    });
  }

  @Get(":id")
  getStudentById(
    @CurrentSchool() school: School,
    @Param("id") id: string,
  ) {
    return this.studentsService.getStudentById(school.id, id);
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
    @Body(new ZodValidationPipe(updateStudentSchema)) body: UpdateStudentInput,
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
