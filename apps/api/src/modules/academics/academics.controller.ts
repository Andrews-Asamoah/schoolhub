import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
} from "@nestjs/common";
import { AcademicsService } from "./academics.service.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import {
  createClassSchema,
  createSubjectSchema,
  type CreateClassInput,
  type CreateSubjectInput,
} from "@schoolhub/shared";
import type { School } from "@prisma/client";

@Controller("academics")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class AcademicsController {
  constructor(private readonly academicsService: AcademicsService) {}

  @Get("classes")
  listClasses(
    @CurrentSchool() school: School,
    @Query("academicYearId") academicYearId?: string,
  ) {
    return this.academicsService.listClasses(school.id, academicYearId);
  }

  @Post("classes")
  @Roles("owner", "admin")
  createClass(
    @CurrentSchool() school: School,
    @Body(new ZodValidationPipe(createClassSchema)) body: CreateClassInput,
  ) {
    return this.academicsService.createClass(school.id, body);
  }

  @Get("classes/:id/students")
  getClassStudents(
    @CurrentSchool() school: School,
    @Param("id") id: string,
  ) {
    return this.academicsService.getClassStudents(school.id, id);
  }

  @Get("subjects")
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
