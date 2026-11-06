import { Body, Controller, Get, Header, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import {
  rejectStudentDeletionSchema,
  studentDeletionQuerySchema,
  type RejectStudentDeletionInput,
  type StudentDeletionQuery,
} from "@schoolhub/shared";
import { AuditActorParam } from "../../common/audit/audit-actor.decorator.js";
import type { AuditActor } from "../../common/audit/audit.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { SuperAdminGuard } from "../../common/guards/super-admin.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { StudentDeletionService } from "./student-deletion.service.js";

/** Platform side: review and carry out deletion requests. */
@Controller("super-admin/student-deletion-requests")
@UseGuards(ThrottlerGuard, SuperAdminGuard)
export class StudentDeletionAdminController {
  constructor(private readonly service: StudentDeletionService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  list(@Query(new ZodValidationPipe(studentDeletionQuerySchema)) query: StudentDeletionQuery) {
    return this.service.listForPlatform(query);
  }

  @Get(":id/impact")
  @Header("Cache-Control", "no-store")
  impact(@Param("id") id: string) {
    return this.service.impactForRequest(id);
  }

  @Post(":id/approve")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  approve(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser, @AuditActorParam() actor: AuditActor) {
    return this.service.approve(id, { id: user.id, name: user.name }, actor);
  }

  @Post(":id/reject")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  reject(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(rejectStudentDeletionSchema)) body: RejectStudentDeletionInput,
    @CurrentUser() user: AuthenticatedUser,
    @AuditActorParam() actor: AuditActor,
  ) {
    return this.service.reject(id, { id: user.id, name: user.name }, body.decisionNote, actor);
  }
}
