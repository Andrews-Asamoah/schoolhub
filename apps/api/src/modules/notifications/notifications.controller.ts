import { Body, Controller, Delete, ForbiddenException, Get, Patch, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { School } from "@prisma/client";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { MobilePushService, mobileDeviceIdSchema, mobileDeviceSchema } from "./mobile-push.service.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import type { z } from "zod";
import { NotificationsService } from "./notifications.service.js";

const roles = ["owner", "admin", "headteacher", "teacher", "accountant", "staff", "student", "guardian"] as const;

@Controller("notifications")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly mobilePush: MobilePushService,
  ) {}

  @Post("devices")
  @Roles("teacher", "student", "guardian")
  registerDevice(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: MobileDeviceRequest,
    @Body(new ZodValidationPipe(mobileDeviceSchema)) input: z.infer<typeof mobileDeviceSchema>,
  ) {
    return this.mobilePush.register(deviceBinding(school, user, request), input);
  }

  @Delete("devices")
  @Roles("teacher", "student", "guardian")
  removeDevice(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: MobileDeviceRequest,
    @Body(new ZodValidationPipe(mobileDeviceIdSchema)) input: z.infer<typeof mobileDeviceIdSchema>,
  ) {
    return this.mobilePush.remove(deviceBinding(school, user, request), input.registrationId);
  }

  @Get("history")
  @Roles(...roles)
  history(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Query("search") search?: string,
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.notificationsService.listHistory(school.id, user.id, { search, status, page, limit });
  }

  @Get()
  @Roles(...roles)
  list(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.list(school.id, user.id);
  }

  @Patch("read-all")
  @Roles(...roles)
  markAllRead(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markAllRead(school.id, user.id);
  }

  @Patch(":id/read")
  @Roles(...roles)
  markRead(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.notificationsService.markRead(school.id, user.id, id);
  }
}

type MobileDeviceRequest = { schoolRole?: string; session?: { session?: { id?: string } } };

function deviceBinding(school: School, user: AuthenticatedUser, request: MobileDeviceRequest) {
  const sessionId = request.session?.session?.id;
  const role = request.schoolRole;
  if (user.role === "superAdmin" || !sessionId || !role || !["teacher", "student", "guardian"].includes(role))
    throw new ForbiddenException("A mobile school session is required.");
  return { schoolId: school.id, userId: user.id, sessionId, role };
}
