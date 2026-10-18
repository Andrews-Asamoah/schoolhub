import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
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
  updateGuardianSchema,
  updatePeopleStatusSchema,
  updateStaffSchema,
  updateTeacherSchema,
  type UpdateGuardianInput,
  type UpdateStaffInput,
  type UpdateTeacherInput,
  type CreateGuardianInput,
  type CreateStaffInput,
  type CreateTeacherInput,
  type UpdatePeopleStatusInput,
} from "@schoolhub/shared";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentSchoolRole } from "../../common/decorators/current-school-role.decorator.js";
import {
  CurrentUser,
  type AuthenticatedUser,
} from "../../common/decorators/current-user.decorator.js";
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
  @Header("Cache-Control", "no-store") // response carries a one-time password
  createTeacher(
    @CurrentSchool() school: School,
    @CurrentUser() actor: AuthenticatedUser | undefined,
    @Body(new ZodValidationPipe(createTeacherSchema))
    body: CreateTeacherInput,
  ) {
    return this.peopleService.createTeacher(school, actor!.id, body);
  }

  @Patch("teachers/:id")
  @Roles("owner", "admin", "headmistress")
  updateTeacher(
    @CurrentSchool() school: School,
    @CurrentUser() actor: AuthenticatedUser | undefined,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateTeacherSchema)) body: UpdateTeacherInput,
  ) {
    return this.peopleService.updateTeacher(school, actor!.id, id, body);
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
  @Header("Cache-Control", "no-store")
  createStaff(
    @CurrentSchool() school: School,
    @CurrentSchoolRole() schoolRole: string | undefined,
    @CurrentUser() actor: AuthenticatedUser | undefined,
    @Body(new ZodValidationPipe(createStaffSchema))
    body: CreateStaffInput,
  ) {
    return this.peopleService.createStaff(
      school,
      { id: actor!.id, schoolRole },
      body,
    );
  }

  @Patch("staff/:id")
  @Roles("owner", "admin", "headmistress")
  updateStaff(
    @CurrentSchool() school: School,
    @CurrentSchoolRole() schoolRole: string | undefined,
    @CurrentUser() actor: AuthenticatedUser | undefined,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateStaffSchema)) body: UpdateStaffInput,
  ) {
    return this.peopleService.updateStaff(
      school,
      { id: actor!.id, schoolRole },
      id,
      body,
    );
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
  @Header("Cache-Control", "no-store")
  createGuardian(
    @CurrentSchool() school: School,
    @CurrentUser() actor: AuthenticatedUser | undefined,
    @Body(new ZodValidationPipe(createGuardianSchema))
    body: CreateGuardianInput,
  ) {
    return this.peopleService.createGuardian(school, actor!.id, body);
  }

  @Patch("guardians/:id")
  @Roles("owner", "admin", "headmistress")
  updateGuardian(
    @CurrentSchool() school: School,
    @CurrentUser() actor: AuthenticatedUser | undefined,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateGuardianSchema)) body: UpdateGuardianInput,
  ) {
    return this.peopleService.updateGuardian(school, actor!.id, id, body);
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
