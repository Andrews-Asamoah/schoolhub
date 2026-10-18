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
import { SuperAdminService } from "./super-admin.service.js";
import { SuperAdminGuard } from "../../common/guards/super-admin.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import {
  enrollSchoolSchema,
  updateSchoolSchema,
  addSchoolAdminSchema,
  setSchoolAdminBannedSchema,
  updateSubscriptionSchema,
  type UpdateSchoolInput,
  type AddSchoolAdminInput,
  type SetSchoolAdminBannedInput,
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

  @Get("schools/options")
  listSchoolOptions() {
    return this.superAdminService.listSchoolOptions();
  }

  @Get("users")
  listUsers(
    @Query("page") page = "1",
    @Query("limit") limit = "20",
  ) {
    return this.superAdminService.listUsers(
      Math.max(1, parseInt(page, 10) || 1),
      Math.min(100, parseInt(limit, 10) || 20),
    );
  }

  @Get("schools/:id")
  getSchool(@Param("id") id: string) {
    return this.superAdminService.getSchool(id);
  }

  @Patch("schools/:id")
  updateSchool(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateSchoolSchema)) body: UpdateSchoolInput,
  ) {
    return this.superAdminService.updateSchool(id, body);
  }

  @Post("schools/:id/admins")
  @Header("Cache-Control", "no-store") // response carries a one-time password
  addSchoolAdmin(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addSchoolAdminSchema)) body: AddSchoolAdminInput,
  ) {
    return this.superAdminService.addSchoolAdmin(id, body);
  }

  @Patch("schools/:id/admins/:userId")
  setSchoolAdminBanned(
    @Param("id") id: string,
    @Param("userId") userId: string,
    @Body(new ZodValidationPipe(setSchoolAdminBannedSchema))
    body: SetSchoolAdminBannedInput,
  ) {
    return this.superAdminService.setSchoolAdminBanned(
      id,
      userId,
      body.banned,
    );
  }

  @Delete("schools/:id/admins/:userId")
  removeSchoolAdmin(
    @Param("id") id: string,
    @Param("userId") userId: string,
  ) {
    return this.superAdminService.removeSchoolAdmin(id, userId);
  }

  @Post("schools")
  @Header("Cache-Control", "no-store") // response carries a one-time password
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
