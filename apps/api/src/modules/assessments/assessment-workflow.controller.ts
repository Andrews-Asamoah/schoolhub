import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import type { School } from "@prisma/client";
import {
  extendAssessmentDeadlineSchema,
  reopenAssessmentEntrySchema,
  requestMarkCorrectionSchema,
  reviewMarkCorrectionSchema,
  sendEntryRemindersSchema,
  submitAssessmentEntrySchema,
  type ExtendAssessmentDeadlineInput,
  type ReopenAssessmentEntryInput,
  type RequestMarkCorrectionInput,
  type ReviewMarkCorrectionInput,
  type SendEntryRemindersInput,
  type SubmitAssessmentEntryInput,
} from "@schoolhub/shared";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentSchoolRole } from "../../common/decorators/current-school-role.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AssessmentCorrectionService } from "./assessment-correction.service.js";
import { AssessmentEntryService } from "./assessment-entry.service.js";
import { AssessmentTrackingService } from "./assessment-tracking.service.js";
import type { TrackingStatus } from "./assessment-workflow.js";

const TRACKING_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETE", "SUBMITTED", "OVERDUE", "NO_PUPILS"];
const STAFF = ["owner", "admin", "headteacher", "teacher"] as const;
const MANAGERS = ["owner", "admin", "headteacher"] as const;

/** Sign-off, completion tracking and corrections for marks entry. */
@Controller("assessments")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class AssessmentWorkflowController {
  constructor(
    private readonly entry: AssessmentEntryService,
    private readonly tracking: AssessmentTrackingService,
    private readonly corrections: AssessmentCorrectionService,
  ) {}

  @Post("entry/submit")
  @Roles(...STAFF)
  submit(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSchoolRole() role: string | undefined,
    @Body(new ZodValidationPipe(submitAssessmentEntrySchema)) body: SubmitAssessmentEntryInput,
  ) {
    return this.entry.submit(school.id, user.id, role, body);
  }

  @Get("tracking")
  @Roles(...MANAGERS)
  overview(
    @CurrentSchool() school: School,
    @Query("templateId") templateId?: string,
    @Query("classId") classId?: string,
    @Query("teacherId") teacherId?: string,
    @Query("status") status?: string,
  ) {
    return this.tracking.overview(school.id, {
      templateId: templateId || undefined,
      classId: classId || undefined,
      teacherId: teacherId || undefined,
      status: status && TRACKING_STATUSES.includes(status) ? (status as TrackingStatus) : undefined,
    });
  }

  @Post("tracking/extend")
  @Roles(...MANAGERS)
  extend(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(extendAssessmentDeadlineSchema)) body: ExtendAssessmentDeadlineInput,
  ) {
    return this.tracking.extend(school.id, user.id, body);
  }

  @Post("tracking/reopen")
  @Roles(...MANAGERS)
  reopen(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(reopenAssessmentEntrySchema)) body: ReopenAssessmentEntryInput,
  ) {
    return this.tracking.reopen(school.id, user.id, body);
  }

  @Post("tracking/remind")
  @Roles(...MANAGERS)
  remind(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(sendEntryRemindersSchema)) body: SendEntryRemindersInput,
  ) {
    return this.tracking.remind(school.id, user.id, body);
  }

  @Get("corrections")
  @Roles(...STAFF)
  listCorrections(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSchoolRole() role: string | undefined,
    @Query("status") status?: string,
    @Query("classId") classId?: string,
  ) {
    return this.corrections.list(school.id, user.id, role, { status, classId });
  }

  @Post("corrections")
  @Roles(...STAFF)
  requestCorrection(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSchoolRole() role: string | undefined,
    @Body(new ZodValidationPipe(requestMarkCorrectionSchema)) body: RequestMarkCorrectionInput,
  ) {
    return this.corrections.request(school, user.id, role, body);
  }

  /** Only the owner or headteacher decides; the service re-checks and blocks self-approval. */
  @Post("corrections/:id/review")
  @Roles("owner", "headteacher")
  reviewCorrection(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSchoolRole() role: string | undefined,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(reviewMarkCorrectionSchema)) body: ReviewMarkCorrectionInput,
  ) {
    return this.corrections.review(school, user.id, role, id, body);
  }

  @Post("corrections/:id/cancel")
  @Roles(...STAFF)
  cancelCorrection(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSchoolRole() role: string | undefined,
    @Param("id") id: string,
  ) {
    return this.corrections.cancel(school.id, user.id, role, id);
  }
}
