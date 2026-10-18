import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  UseGuards,
} from "@nestjs/common";
import { SchoolsService } from "./schools.service.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentSchoolRole } from "../../common/decorators/current-school-role.decorator.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import {
  createAcademicYearSchema,
  createTermSchema,
  updateAcademicYearSchema,
  updateSchoolMemberRolesSchema,
  updateTermSchema,
  setAcademicContextSchema,
  type CreateAcademicYearInput,
  type CreateTermInput,
  type UpdateAcademicYearInput,
  type UpdateTermInput,
  type SetAcademicContextInput,
  type UpdateSchoolMemberRolesInput,
} from "@schoolhub/shared";
import type { School } from "@prisma/client";

@Controller("schools")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class SchoolsController {
  constructor(private readonly schoolsService: SchoolsService) {}

  @Get("current")
  getCurrentSchool(
    @CurrentSchool() school: School,
    @CurrentSchoolRole() role: string | undefined,
  ) {
    return this.schoolsService.getCurrentSchool(school.id, role);
  }

  @Get("roles")
  getMyRoles(
    @CurrentSchool() school: School,
    @CurrentUser() user: { id: string },
  ) {
    return this.schoolsService.getMemberRoles(school.id, user.id);
  }

  @Get("members")
  @Roles("owner", "admin", "headmistress")
  listMembers(@CurrentSchool() school: School) {
    return this.schoolsService.listSchoolMembers(school.id);
  }

  @Patch("members/:userId/roles")
  @Roles("owner", "admin", "headmistress")
  updateMemberRoles(
    @CurrentSchool() school: School,
    @CurrentUser() user: { id: string },
    @Param("userId") userId: string,
    @Body(new ZodValidationPipe(updateSchoolMemberRolesSchema))
    body: UpdateSchoolMemberRolesInput,
  ) {
    return this.schoolsService.updateMemberRoles(
      school.id,
      user.id,
      userId,
      body,
    );
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
  getAcademicYears(
    @CurrentSchool() school: School,
    @CurrentSchoolRole() role: string | undefined,
  ) {
    return this.schoolsService.getAcademicYears(school.id, role);
  }

  @Get("academic-context")
  getAcademicContext(@CurrentSchool() school: School) {
    return this.schoolsService.getCurrentAcademicContext(school.id);
  }

  @Patch("academic-context")
  @Roles("owner", "admin", "headmistress")
  setAcademicContext(
    @CurrentSchool() school: School,
    @CurrentUser() user: { id: string },
    @Body(new ZodValidationPipe(setAcademicContextSchema))
    body: SetAcademicContextInput,
  ) {
    return this.schoolsService.setCurrentAcademicContext(
      school.id,
      user.id,
      body,
    );
  }

  @Patch("academic-years/:id")
  @Roles("owner", "admin")
  updateAcademicYear(
    @CurrentSchool() school: School,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateAcademicYearSchema))
    body: UpdateAcademicYearInput,
  ) {
    return this.schoolsService.updateAcademicYear(school.id, id, body);
  }

  @Post("academic-years/:id/terms")
  @Roles("owner", "admin")
  createTerm(
    @CurrentSchool() school: School,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createTermSchema)) body: CreateTermInput,
  ) {
    return this.schoolsService.createTerm(school.id, id, body);
  }

  @Patch("terms/:id")
  @Roles("owner", "admin")
  updateTerm(
    @CurrentSchool() school: School,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateTermSchema)) body: UpdateTermInput,
  ) {
    return this.schoolsService.updateTerm(school.id, id, body);
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
