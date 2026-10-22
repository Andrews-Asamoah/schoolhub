import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  Header,
} from "@nestjs/common";
import type { School } from "@prisma/client";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import {
  admitApplicationSchema,
  decideApplicationSchema,
  exemptAdmissionFeeSchema,
  receiveAdmissionFeeSchema,
  recordExamScoreSchema,
  saveAdmissionCycleSchema,
  scheduleExamSchema,
  submitApplicationSchema,
  trackApplicationSchema,
  updateApplicationExamSchema,
  type AdmitApplicationInput,
  type DecideApplicationInput,
  type ExemptAdmissionFeeInput,
  type ReceiveAdmissionFeeInput,
  type RecordExamScoreInput,
  type SaveAdmissionCycleInput,
  type ScheduleExamInput,
  type SubmitApplicationInput,
  type UpdateApplicationExamInput,
  type TrackApplicationInput,
} from "@schoolhub/shared";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AdmissionsService } from "./admissions.service.js";

/** Anonymous endpoints used by the public enrollment form. */
@Controller("admissions/public")
export class AdmissionsPublicController {
  constructor(private readonly admissions: AdmissionsService) {}

  @AllowAnonymous()
  @Get(":subdomain")
  intake(@Param("subdomain") subdomain: string) {
    return this.admissions.getPublicIntake(subdomain);
  }

  @AllowAnonymous()
  @Post(":subdomain/applications")
  submit(
    @Param("subdomain") subdomain: string,
    @Body(new ZodValidationPipe(submitApplicationSchema)) body: SubmitApplicationInput,
    @Req() req: { ip?: string },
  ) {
    return this.admissions.submitApplication(subdomain, body, req.ip ?? "unknown");
  }

  @AllowAnonymous()
  @Post(":subdomain/track")
  track(
    @Param("subdomain") subdomain: string,
    @Body(new ZodValidationPipe(trackApplicationSchema)) body: TrackApplicationInput,
    @Req() req: { ip?: string },
  ) {
    return this.admissions.trackApplication(subdomain, body, req.ip ?? "unknown");
  }
}

@Controller("admissions")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class AdmissionsController {
  constructor(private readonly admissions: AdmissionsService) {}

  @Get("cycles")
  @Roles("owner", "admin", "staff", "accountant")
  listCycles(@CurrentSchool() school: School) {
    return this.admissions.listCycles(school.id);
  }

  @Post("cycles")
  @Roles("owner", "admin")
  createCycle(
    @CurrentSchool() school: School,
    @Body(new ZodValidationPipe(saveAdmissionCycleSchema)) body: SaveAdmissionCycleInput,
  ) {
    return this.admissions.createCycle(school.id, body);
  }

  @Patch("cycles/:id")
  @Roles("owner", "admin")
  updateCycle(
    @CurrentSchool() school: School,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(saveAdmissionCycleSchema)) body: SaveAdmissionCycleInput,
  ) {
    return this.admissions.updateCycle(school.id, id, body);
  }

  @Get("applications")
  @Roles("owner", "admin", "staff", "accountant")
  listApplications(
    @CurrentSchool() school: School,
    @Query("cycleId") cycleId?: string,
    @Query("classId") classId?: string,
    @Query("status") status?: string,
    @Query("feeStatus") feeStatus?: string,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.admissions.listApplications(school.id, {
      cycleId,
      classId,
      status,
      feeStatus,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post("applications/schedule-exam")
  @Roles("owner", "admin", "staff")
  scheduleExam(
    @CurrentSchool() school: School,
    @Body(new ZodValidationPipe(scheduleExamSchema)) body: ScheduleExamInput,
  ) {
    return this.admissions.scheduleExam(school.id, body);
  }

  @Get("fees/summary")
  @Roles("owner", "admin", "staff", "accountant")
  feeSummary(@CurrentSchool() school: School, @Query("cycleId") cycleId?: string) {
    return this.admissions.feeSummary(school.id, cycleId);
  }

  /** Cash received on exam day. Posts school income and issues a receipt number. */
  @Post("applications/:id/fee/receive")
  @Roles("owner", "admin", "staff", "accountant")
  receiveFee(
    @CurrentSchool() school: School,
    @CurrentUser() actor: AuthenticatedUser | undefined,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(receiveAdmissionFeeSchema)) body: ReceiveAdmissionFeeInput,
  ) {
    return this.admissions.receiveFee(school.id, actor!.id, id, body);
  }

  @Post("applications/:id/fee/exemption")
  @Roles("owner", "admin")
  exemptFee(
    @CurrentSchool() school: School,
    @CurrentUser() actor: AuthenticatedUser | undefined,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(exemptAdmissionFeeSchema)) body: ExemptAdmissionFeeInput,
  ) {
    return this.admissions.exemptFee(school.id, actor!.id, id, body);
  }

  @Delete("applications/:id/fee/exemption")
  @Roles("owner", "admin")
  withdrawExemption(
    @CurrentSchool() school: School,
    @CurrentUser() actor: AuthenticatedUser | undefined,
    @Param("id") id: string,
  ) {
    return this.admissions.withdrawExemption(school.id, actor!.id, id);
  }

  @Get("applications/:id")
  @Roles("owner", "admin", "staff", "accountant")
  getApplication(@CurrentSchool() school: School, @Param("id") id: string) {
    return this.admissions.getApplication(school.id, id);
  }

  @Post("applications/:id/review")
  @Roles("owner", "admin", "staff")
  review(@CurrentSchool() school: School, @Param("id") id: string) {
    return this.admissions.markUnderReview(school.id, id);
  }

  /** Edit exam date, venue and/or score for one applicant (inline editor). */
  @Patch("applications/:id/exam")
  @Roles("owner", "admin", "staff")
  updateExam(
    @CurrentSchool() school: School,
    @CurrentUser() actor: AuthenticatedUser | undefined,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateApplicationExamSchema)) body: UpdateApplicationExamInput,
  ) {
    return this.admissions.updateExam(school.id, actor!.id, id, body);
  }

  @Post("applications/:id/score")
  @Roles("owner", "admin", "staff")
  score(
    @CurrentSchool() school: School,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(recordExamScoreSchema)) body: RecordExamScoreInput,
  ) {
    return this.admissions.recordScore(school.id, id, body);
  }

  @Post("applications/:id/decision")
  @Roles("owner", "admin")
  decide(
    @CurrentSchool() school: School,
    @CurrentUser() actor: AuthenticatedUser | undefined,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(decideApplicationSchema)) body: DecideApplicationInput,
  ) {
    return this.admissions.decide(school.id, actor!.id, id, body);
  }

  @Post("applications/:id/admit")
  @Roles("owner", "admin")
  @Header("Cache-Control", "no-store") // response carries one-time passwords
  admit(
    @CurrentSchool() school: School,
    @CurrentUser() actor: AuthenticatedUser | undefined,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(admitApplicationSchema)) body: AdmitApplicationInput,
  ) {
    return this.admissions.admit(school, actor!.id, id, body);
  }
}
