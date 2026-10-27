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
import { z } from "zod";
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


const optionalLimit = z.number().int().min(0).max(10_000_000).nullable();
const subscriptionPlanFields = z.object({
  code: z.string().trim().min(2).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  monthlyPrice: z.number().finite().min(0).max(1_000_000),
  yearlyPrice: z.number().finite().min(0).max(10_000_000),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).default("GHS"),
  maxStudents: optionalLimit.default(500),
  maxTeachers: optionalLimit.default(30),
  maxGuardians: optionalLimit.default(1000),
  maxStaff: optionalLimit.default(50),
  maxStorageMb: optionalLimit.default(5120),
  features: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
  isPublic: z.boolean().default(true),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(100_000).default(0),
});
const assignSubscriptionPlanSchema = z.object({ planId: z.string().min(1).max(128), billingCycle: z.enum(["MONTHLY", "YEARLY"]) });
const createSubscriptionPlanSchema = subscriptionPlanFields;
const updateSubscriptionPlanSchema = subscriptionPlanFields.partial();
type CreateSubscriptionPlanInput = z.infer<typeof createSubscriptionPlanSchema>;
type UpdateSubscriptionPlanInput = z.infer<typeof updateSubscriptionPlanSchema>;

/** Writes are far rarer than reads, so they get a much tighter budget per client. */
const WRITE_LIMIT = { default: { limit: 30, ttl: 60_000 } };

// Throttle first (cheap, protects the auth lookup), then authenticate/authorise.
@Controller("super-admin")
@UseGuards(ThrottlerGuard, SuperAdminGuard)
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}


  @Patch("schools/:id/plan")
  @Throttle(WRITE_LIMIT)
  @Header("Cache-Control", "no-store")
  assignSubscriptionPlan(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(assignSubscriptionPlanSchema)) body: { planId: string; billingCycle: "MONTHLY" | "YEARLY" },
    @AuditActorParam() actor: AuditActor,
  ) {
    return this.superAdminService.assignSubscriptionPlan(id, body, actor);
  }

  @Get("subscription-plans")
  @Header("Cache-Control", "no-store")
  listSubscriptionPlans() {
    return this.superAdminService.listSubscriptionPlans();
  }

  @Post("subscription-plans")
  @Throttle(WRITE_LIMIT)
  @Header("Cache-Control", "no-store")
  createSubscriptionPlan(
    @Body(new ZodValidationPipe(createSubscriptionPlanSchema)) body: CreateSubscriptionPlanInput,
    @AuditActorParam() actor: AuditActor,
  ) {
    return this.superAdminService.createSubscriptionPlan(body as Parameters<SuperAdminService["createSubscriptionPlan"]>[0], actor);
  }

  @Patch("subscription-plans/:id")
  @Throttle(WRITE_LIMIT)
  @Header("Cache-Control", "no-store")
  updateSubscriptionPlan(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateSubscriptionPlanSchema)) body: UpdateSubscriptionPlanInput,
    @AuditActorParam() actor: AuditActor,
  ) {
    return this.superAdminService.updateSubscriptionPlan(id, body as Parameters<SuperAdminService["updateSubscriptionPlan"]>[1], actor);
  }

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
