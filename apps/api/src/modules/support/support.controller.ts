import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  createSupportTicketSchema,
  supportTicketReplySchema,
  updateSupportTicketSchema,
  type CreateSupportTicketInput,
  type SupportTicketReplyInput,
  type UpdateSupportTicketInput,
} from "@schoolhub/shared";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import {
  CurrentUser,
  type AuthenticatedUser,
} from "../../common/decorators/current-user.decorator.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { SuperAdminGuard } from "../../common/guards/super-admin.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import type { School } from "@prisma/client";
import { SupportService } from "./support.service.js";

@Controller("support")
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get("tickets")
  @UseGuards(SchoolTenantGuard, RolesGuard)
  @Roles("owner", "admin")
  listSchoolTickets(@CurrentSchool() school: School) {
    return this.supportService.listSchoolTickets(school.id);
  }

  @Post("tickets")
  @UseGuards(SchoolTenantGuard, RolesGuard)
  @Roles("owner", "admin")
  createSchoolTicket(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createSupportTicketSchema))
    input: CreateSupportTicketInput,
  ) {
    return this.supportService.createTicket(school.id, user.id, input);
  }

  @Get("tickets/:ticketId")
  @UseGuards(SchoolTenantGuard, RolesGuard)
  @Roles("owner", "admin")
  getSchoolTicket(
    @CurrentSchool() school: School,
    @Param("ticketId") ticketId: string,
  ) {
    return this.supportService.getSchoolTicket(school.id, ticketId);
  }

  @Post("tickets/:ticketId/replies")
  @UseGuards(SchoolTenantGuard, RolesGuard)
  @Roles("owner", "admin")
  replyToSchoolTicket(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Param("ticketId") ticketId: string,
    @Body(new ZodValidationPipe(supportTicketReplySchema))
    input: SupportTicketReplyInput,
  ) {
    return this.supportService.replyToSchoolTicket(
      school.id,
      ticketId,
      user.id,
      input,
    );
  }

  @Patch("tickets/:ticketId/status")
  @UseGuards(SchoolTenantGuard, RolesGuard)
  @Roles("owner", "admin")
  updateSchoolTicket(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Param("ticketId") ticketId: string,
    @Body(new ZodValidationPipe(updateSupportTicketSchema))
    input: UpdateSupportTicketInput,
  ) {
    return this.supportService.updateSchoolTicket(
      school.id,
      ticketId,
      user.id,
      input,
    );
  }

  @Get("platform/tickets")
  @UseGuards(SuperAdminGuard)
  listPlatformTickets() {
    return this.supportService.listPlatformTickets();
  }

  @Get("platform/tickets/:ticketId")
  @UseGuards(SuperAdminGuard)
  getPlatformTicket(@Param("ticketId") ticketId: string) {
    return this.supportService.getPlatformTicket(ticketId);
  }

  @Post("platform/tickets/:ticketId/replies")
  @UseGuards(SuperAdminGuard)
  replyToPlatformTicket(
    @CurrentUser() user: AuthenticatedUser,
    @Param("ticketId") ticketId: string,
    @Body(new ZodValidationPipe(supportTicketReplySchema))
    input: SupportTicketReplyInput,
  ) {
    return this.supportService.replyToPlatformTicket(
      ticketId,
      user.id,
      input,
    );
  }

  @Patch("platform/tickets/:ticketId/status")
  @UseGuards(SuperAdminGuard)
  updatePlatformTicket(
    @CurrentUser() user: AuthenticatedUser,
    @Param("ticketId") ticketId: string,
    @Body(new ZodValidationPipe(updateSupportTicketSchema))
    input: UpdateSupportTicketInput,
  ) {
    return this.supportService.updatePlatformTicket(
      ticketId,
      user.id,
      input,
    );
  }
}
