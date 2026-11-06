import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import type { School } from "@prisma/client";
import { requestStudentDeletionSchema, type RequestStudentDeletionInput } from "@schoolhub/shared";
import { AuditActorParam } from "../../common/audit/audit-actor.decorator.js";
import type { AuditActor } from "../../common/audit/audit.js";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { StudentDeletionService } from "./student-deletion.service.js";

/** School side: ask the platform to permanently remove a wrongly created student. */
@Controller("student-deletion-requests")
@UseGuards(ThrottlerGuard, SchoolTenantGuard, RolesGuard)
@Roles("owner", "admin")
export class StudentDeletionController {
  constructor(private readonly service: StudentDeletionService) {}

  @Get()
  list(@CurrentSchool() school: School, @Query("studentId") studentId?: string) {
    return this.service.listForSchool(school.id, studentId || undefined);
  }

  /** What would be removed, shown before the admin sends the request. */
  @Get("impact/:studentId")
  impact(@CurrentSchool() school: School, @Param("studentId") studentId: string) {
    return this.service.previewForSchool(school.id, studentId);
  }

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  request(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(requestStudentDeletionSchema)) body: RequestStudentDeletionInput,
    @AuditActorParam() actor: AuditActor,
  ) {
    return this.service.requestDeletion(school.id, { id: user.id, name: user.name }, body.studentId, body.reason, actor);
  }

  @Delete(":id")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  cancel(@CurrentSchool() school: School, @Param("id") id: string, @AuditActorParam() actor: AuditActor) {
    return this.service.cancel(school.id, id, actor);
  }
}
