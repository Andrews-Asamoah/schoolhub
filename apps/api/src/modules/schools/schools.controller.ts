import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  UseGuards,
} from "@nestjs/common";
import { SchoolsService } from "./schools.service.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import {
  createAcademicYearSchema,
  type CreateAcademicYearInput,
} from "@schoolhub/shared";
import type { School } from "@prisma/client";

@Controller("schools")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class SchoolsController {
  constructor(private readonly schoolsService: SchoolsService) {}

  @Get("current")
  getCurrentSchool(@CurrentSchool() school: School) {
    return this.schoolsService.getCurrentSchool(school.id);
  }

  @Patch("current")
  @Roles("owner", "admin")
  updateSchool(
    @CurrentSchool() school: School,
    @Body()
    body: {
      name?: string;
      email?: string;
      phone?: string;
      address?: string;
      motto?: string;
      website?: string;
      primaryColor?: string;
      secondaryColor?: string;
    },
  ) {
    return this.schoolsService.updateSchool(school.id, body);
  }

  @Get("academic-years")
  getAcademicYears(@CurrentSchool() school: School) {
    return this.schoolsService.getAcademicYears(school.id);
  }

  @Post("academic-years")
  @Roles("owner", "admin")
  createAcademicYear(
    @CurrentSchool() school: School,
    @Body(new ZodValidationPipe(createAcademicYearSchema))
    body: CreateAcademicYearInput,
  ) {
    return this.schoolsService.createAcademicYear(school.id, body);
  }
}
