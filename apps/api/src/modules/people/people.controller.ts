import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  createGuardianSchema,
  createStaffSchema,
  createTeacherSchema,
  updatePeopleStatusSchema,
  type CreateGuardianInput,
  type CreateStaffInput,
  type CreateTeacherInput,
  type UpdatePeopleStatusInput,
} from "@schoolhub/shared";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { PeopleService } from "./people.service.js";
import type { School } from "@prisma/client";

function parsePageParam(value: string | undefined, name: string) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequestException(`${name} must be a positive integer.`);
  }
  if (name === "limit" && parsed > 100) {
    throw new BadRequestException("limit cannot be greater than 100.");
  }
  return parsed;
}

function parseActiveParam(value?: string) {
  if (value === undefined) return undefined;
  if (value !== "true" && value !== "false") {
    throw new BadRequestException("active must be either true or false.");
  }
  return value === "true";
}

@Controller("people")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class PeopleController {
  constructor(private readonly peopleService: PeopleService) {}

  @Get("teachers")
  @Roles("owner", "admin", "headmistress", "teacher", "staff")
  listTeachers(
    @CurrentSchool() school: School,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("search") search?: string,
    @Query("active") active?: string,
  ) {
    return this.peopleService.listTeachers(school.id, {
      page: parsePageParam(page, "page"),
      limit: parsePageParam(limit, "limit"),
      search,
      isActive: parseActiveParam(active),
    });
  }

  @Post("teachers")
  @Roles("owner", "admin", "headmistress")
  createTeacher(
    @CurrentSchool() school: School,
    @Body(new ZodValidationPipe(createTeacherSchema))
    body: CreateTeacherInput,
  ) {
    return this.peopleService.createTeacher(school.id, body);
  }

  @Patch("teachers/:id/status")
  @Roles("owner", "admin", "headmistress")
  setTeacherStatus(
    @CurrentSchool() school: School,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updatePeopleStatusSchema))
    body: UpdatePeopleStatusInput,
  ) {
    return this.peopleService.setTeacherStatus(school.id, id, body.isActive);
  }

  @Get("staff")
  @Roles("owner", "admin", "headmistress", "staff")
  listStaff(
    @CurrentSchool() school: School,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("search") search?: string,
    @Query("active") active?: string,
  ) {
    return this.peopleService.listStaff(school.id, {
      page: parsePageParam(page, "page"),
      limit: parsePageParam(limit, "limit"),
      search,
      isActive: parseActiveParam(active),
    });
  }

  @Post("staff")
  @Roles("owner", "admin", "headmistress")
  createStaff(
    @CurrentSchool() school: School,
    @Body(new ZodValidationPipe(createStaffSchema))
    body: CreateStaffInput,
  ) {
    return this.peopleService.createStaff(school.id, body);
  }

  @Patch("staff/:id/status")
  @Roles("owner", "admin", "headmistress")
  setStaffStatus(
    @CurrentSchool() school: School,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updatePeopleStatusSchema))
    body: UpdatePeopleStatusInput,
  ) {
    return this.peopleService.setStaffStatus(school.id, id, body.isActive);
  }

  @Get("guardians")
  @Roles("owner", "admin", "headmistress", "staff")
  listGuardians(
    @CurrentSchool() school: School,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("search") search?: string,
    @Query("active") active?: string,
  ) {
    return this.peopleService.listGuardians(school.id, {
      page: parsePageParam(page, "page"),
      limit: parsePageParam(limit, "limit"),
      search,
      isActive: parseActiveParam(active),
    });
  }

  @Post("guardians")
  @Roles("owner", "admin", "headmistress", "staff")
  createGuardian(
    @CurrentSchool() school: School,
    @Body(new ZodValidationPipe(createGuardianSchema))
    body: CreateGuardianInput,
  ) {
    return this.peopleService.createGuardian(school.id, body);
  }

  @Patch("guardians/:id/status")
  @Roles("owner", "admin", "headmistress")
  setGuardianStatus(
    @CurrentSchool() school: School,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updatePeopleStatusSchema))
    body: UpdatePeopleStatusInput,
  ) {
    return this.peopleService.setGuardianStatus(school.id, id, body.isActive);
  }
}
