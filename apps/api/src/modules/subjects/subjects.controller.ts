import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { School } from "@prisma/client";
import {
  saveSubjectSchema,
  setSubjectClassesSchema,
  setSubjectTeachersSchema,
  type SaveSubjectInput,
  type SetSubjectClassesInput,
  type SetSubjectTeachersInput,
} from "@schoolhub/shared";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { SubjectsService } from "./subjects.service.js";

@Controller("subjects")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class SubjectsController {
  constructor(private readonly subjects: SubjectsService) {}

  @Get()
  @Roles("owner", "admin", "headteacher", "teacher", "staff")
  list(@CurrentSchool() school: School, @Query("includeInactive") includeInactive?: string) {
    return this.subjects.list(school.id, includeInactive === "true");
  }

  @Post()
  @Roles("owner", "admin")
  create(
    @CurrentSchool() school: School,
    @Body(new ZodValidationPipe(saveSubjectSchema)) body: SaveSubjectInput,
  ) {
    return this.subjects.create(school.id, body);
  }

  @Patch(":id")
  @Roles("owner", "admin")
  update(
    @CurrentSchool() school: School,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(saveSubjectSchema)) body: SaveSubjectInput,
  ) {
    return this.subjects.update(school.id, id, body);
  }

  @Delete(":id")
  @Roles("owner", "admin")
  remove(@CurrentSchool() school: School, @Param("id") id: string) {
    return this.subjects.remove(school.id, id);
  }

  @Put(":id/classes")
  @Roles("owner", "admin")
  setClasses(
    @CurrentSchool() school: School,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(setSubjectClassesSchema)) body: SetSubjectClassesInput,
  ) {
    return this.subjects.setClasses(school.id, id, body);
  }

  @Put(":id/teachers")
  @Roles("owner", "admin")
  setTeachers(
    @CurrentSchool() school: School,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(setSubjectTeachersSchema)) body: SetSubjectTeachersInput,
  ) {
    return this.subjects.setTeachers(school.id, id, body);
  }
}
