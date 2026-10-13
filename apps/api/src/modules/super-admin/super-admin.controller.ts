import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from "@nestjs/common";
import { SuperAdminService } from "./super-admin.service.js";
import { SuperAdminGuard } from "../../common/guards/super-admin.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import {
  enrollSchoolSchema,
  updateSubscriptionSchema,
  type EnrollSchoolInput,
  type UpdateSubscriptionInput,
} from "@schoolhub/shared";

@Controller("super-admin")
@UseGuards(SuperAdminGuard)
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  @Get("stats")
  getPlatformStats() {
    return this.superAdminService.getPlatformStats();
  }

  @Get("schools")
  listSchools(
    @Query("page") page = "1",
    @Query("limit") limit = "20",
  ) {
    return this.superAdminService.listSchools(
      Math.max(1, parseInt(page, 10) || 1),
      Math.min(100, parseInt(limit, 10) || 20),
    );
  }

  @Get("schools/:id")
  getSchool(@Param("id") id: string) {
    return this.superAdminService.getSchool(id);
  }

  @Post("schools")
  enrollSchool(
    @Body(new ZodValidationPipe(enrollSchoolSchema)) body: EnrollSchoolInput,
  ) {
    return this.superAdminService.enrollSchool(body);
  }

  @Patch("schools/:id/subscription")
  updateSubscription(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateSubscriptionSchema))
    body: UpdateSubscriptionInput,
  ) {
    return this.superAdminService.updateSubscription(id, body);
  }
}
