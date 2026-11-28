import { Body, Controller, Get, Header, Param, Patch, UseGuards } from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { z } from "zod";
import { AuditActorParam } from "../../common/audit/audit-actor.decorator.js";
import type { AuditActor } from "../../common/audit/audit.js";
import { PlatformStaffGuard } from "../../common/guards/platform-staff.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { PlatformTeamService } from "./platform-team.service.js";

@Controller("platform-staff")
@UseGuards(ThrottlerGuard, PlatformStaffGuard)
export class PlatformStaffController {
  constructor(private readonly team: PlatformTeamService) {}

  @Get("schools")
  @Header("Cache-Control", "no-store")
  list(@AuditActorParam() actor: AuditActor) {
    return this.team.assignedSchools(actor.id);
  }

  @Patch("schools/:id/desktop-access")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async setDesktopAccess(@Param("id") id: string,
    @Body(new ZodValidationPipe(z.object({ enabled: z.boolean().nullable() }))) body: { enabled: boolean | null },
    @AuditActorParam() actor: AuditActor) {
    await this.team.setDesktopAccess(id, body.enabled, actor);
    return { success: true };
  }
}
