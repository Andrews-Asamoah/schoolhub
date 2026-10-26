import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type { School } from "@prisma/client";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentSchoolRole } from "../../common/decorators/current-school-role.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { MessagesService } from "./messages.service.js";

const schoolRoles = ["owner", "admin", "headteacher", "teacher", "accountant", "staff", "student", "guardian"] as const;

@Controller("messages")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get("recipients")
  @Roles(...schoolRoles)
  recipients(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSchoolRole() role: string | undefined,
    @Query("search") search?: string,
  ) {
    return this.messages.listRecipients(school.organizationId, user.id, role ?? "", search ?? "");
  }

  @Get("inbox")
  @Roles(...schoolRoles)
  inbox(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser) {
    return this.messages.listMessages(school.id, user.id, "inbox");
  }

  @Get("sent")
  @Roles(...schoolRoles)
  sent(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser) {
    return this.messages.listMessages(school.id, user.id, "sent");
  }

  @Post()
  @Roles(...schoolRoles)
  send(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSchoolRole() role: string | undefined,
    @Body() body: { recipientIds?: unknown; subject?: unknown; body?: unknown },
  ) {
    return this.messages.send(school, user, role ?? "", body);
  }

  @Patch(":id/read")
  @Roles(...schoolRoles)
  markRead(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.messages.markRead(school.id, user.id, id);
  }
}
