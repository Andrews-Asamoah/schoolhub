import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Header,
} from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { SuperAdminService } from "./super-admin.service.js";
import { SuperAdminGuard } from "../../common/guards/super-admin.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuditActorParam } from "../../common/audit/audit-actor.decorator.js";
import type { AuditActor } from "../../common/audit/audit.js";
import {
  enrollSchoolSchema,
  updateSchoolSchema,
  addSchoolAdminSchema,
  setSchoolAdminBannedSchema,
  updateSubscriptionSchema,
  superAdminSchoolsQuerySchema,
  superAdminUsersQuerySchema,
  superAdminAuditQuerySchema,
  type UpdateSchoolInput,
  type AddSchoolAdminInput,
  type SetSchoolAdminBannedInput,
  type EnrollSchoolInput,
  type UpdateSubscriptionInput,
  type SuperAdminSchoolsQuery,
  type SuperAdminUsersQuery,
  type SuperAdminAuditQuery,
} from "@schoolhub/shared";

/** Writes are far rarer than reads, so they get a much tighter budget per client. */
const WRITE_LIMIT = { default: { limit: 30, ttl: 60_000 } };

// Throttle first (cheap, protects the auth lookup), then authenticate/authorise.
@Controller("super-admin")
@UseGuards(ThrottlerGuard, SuperAdminGuard)
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  @Get("operations/health")
  @Header("Cache-Control", "no-store")
  getOperationsHealth() {
    return this.superAdminService.getOperationsHealth();
  }

  @Get("stats")
  getPlatformStats() {
    return this.superAdminService.getPlatformStats();
  }

  @Get("schools")
  listSchools(
    @Query(new ZodValidationPipe(superAdminSchoolsQuerySchema)) query: SuperAdminSchoolsQuery,
  ) {
    return this.superAdminService.listSchools(query);
  }

  @Get("schools/options")
  listSchoolOptions() {
    return this.superAdminService.listSchoolOptions();
  }

  @Get("users")
  listUsers(
    @Query(new ZodValidationPipe(superAdminUsersQuerySchema)) query: SuperAdminUsersQuery,
  ) {
    return this.superAdminService.listUsers(query);
  }

  @Get("audit-logs")
  @Header("Cache-Control", "no-store")
  listAuditLogs(
    @Query(new ZodValidationPipe(superAdminAuditQuerySchema)) query: SuperAdminAuditQuery,
  ) {
    return this.superAdminService.listAuditLogs(query);
  }

  @Get("schools/:id/onboarding")
  @Header("Cache-Control", "no-store")
  getSchoolOnboardingStatus(@Param("id") id: string) {
    return this.superAdminService.getSchoolOnboardingStatus(id);
  }

  @Get("schools/:id")
  getSchool(@Param("id") id: string) {
    return this.superAdminService.getSchool(id);
  }

  @Patch("schools/:id")
  @Throttle(WRITE_LIMIT)
  updateSchool(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateSchoolSchema)) body: UpdateSchoolInput,
    @AuditActorParam() actor: AuditActor,
  ) {
    return this.superAdminService.updateSchool(id, body, actor);
  }

  @Post("schools/:id/admins")
  @Throttle(WRITE_LIMIT)
  @Header("Cache-Control", "no-store") // response carries a one-time password
  addSchoolAdmin(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addSchoolAdminSchema)) body: AddSchoolAdminInput,
    @AuditActorParam() actor: AuditActor,
  ) {
    return this.superAdminService.addSchoolAdmin(id, body, actor);
  }

  @Patch("schools/:id/admins/:userId")
  @Throttle(WRITE_LIMIT)
  setSchoolAdminBanned(
    @Param("id") id: string,
    @Param("userId") userId: string,
    @Body(new ZodValidationPipe(setSchoolAdminBannedSchema))
    body: SetSchoolAdminBannedInput,
    @AuditActorParam() actor: AuditActor,
  ) {
    return this.superAdminService.setSchoolAdminBanned(id, userId, body.banned, actor, body.reason);
  }

  @Post("schools/:id/admins/:userId/reset-two-factor")
  @Throttle(WRITE_LIMIT)
  resetSchoolAdminTwoFactor(
    @Param("id") id: string,
    @Param("userId") userId: string,
    @AuditActorParam() actor: AuditActor,
  ) {
    return this.superAdminService.resetSchoolAdminTwoFactor(id, userId, actor);
  }

  @Delete("schools/:id/admins/:userId")
  @Throttle(WRITE_LIMIT)
  removeSchoolAdmin(
    @Param("id") id: string,
    @Param("userId") userId: string,
    @AuditActorParam() actor: AuditActor,
  ) {
    return this.superAdminService.removeSchoolAdmin(id, userId, actor);
  }

  @Post("schools")
  @Throttle(WRITE_LIMIT)
  @Header("Cache-Control", "no-store") // response carries a one-time password
  enrollSchool(
    @Body(new ZodValidationPipe(enrollSchoolSchema)) body: EnrollSchoolInput,
    @AuditActorParam() actor: AuditActor,
  ) {
    return this.superAdminService.enrollSchool(body, actor);
  }

  @Patch("schools/:id/subscription")
  @Throttle(WRITE_LIMIT)
  updateSubscription(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateSubscriptionSchema))
    body: UpdateSubscriptionInput,
    @AuditActorParam() actor: AuditActor,
  ) {
    return this.superAdminService.updateSubscription(id, body, actor);
  }
}
