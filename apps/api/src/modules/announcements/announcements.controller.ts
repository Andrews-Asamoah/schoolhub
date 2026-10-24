import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import {
  createAnnouncementSchema,
  updateAnnouncementPinSchema,
  updateAnnouncementStatusSchema,
  type CreateAnnouncementInput,
  type UpdateAnnouncementPinInput,
  type UpdateAnnouncementStatusInput,
} from "@schoolhub/shared";
import type { School } from "@prisma/client";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentSchoolRole } from "../../common/decorators/current-school-role.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AnnouncementsService } from "./announcements.service.js";

@Controller("announcements")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Get()
  @Roles("owner", "admin", "headteacher", "teacher", "accountant", "staff", "student", "guardian")
  list(@CurrentSchool() school: School, @CurrentSchoolRole() role: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.announcementsService.list(school.id, role, user.id);
  }

  @Get("classes")
  @Roles("owner", "admin", "headteacher", "teacher")
  listClasses(@CurrentSchool() school: School, @CurrentSchoolRole() role: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.announcementsService.listClasses(school.id, role, user.id);
  }

  @Post()
  @Roles("owner", "admin", "headteacher", "teacher", "accountant")
  create(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSchoolRole() role: string | undefined,
    @Body(new ZodValidationPipe(createAnnouncementSchema)) input: CreateAnnouncementInput,
  ) {
    return this.announcementsService.create(school.id, user.id, role ?? "", input);
  }

  @Patch(":id/pin")
  @Roles("owner", "admin", "headteacher")
  updatePin(@CurrentSchool() school: School, @Param("id") id: string, @Body(new ZodValidationPipe(updateAnnouncementPinSchema)) input: UpdateAnnouncementPinInput) {
    return this.announcementsService.updatePin(school.id, id, input);
  }

  @Patch(":id/status")
  @Roles("owner", "admin", "headteacher")
  updateStatus(@CurrentSchool() school: School, @Param("id") id: string, @Body(new ZodValidationPipe(updateAnnouncementStatusSchema)) input: UpdateAnnouncementStatusInput) {
    return this.announcementsService.updateStatus(school.id, id, input);
  }

  @Delete(":id")
  @Roles("owner", "admin", "headteacher")
  remove(@CurrentSchool() school: School, @Param("id") id: string) {
    return this.announcementsService.remove(school.id, id);
  }
}