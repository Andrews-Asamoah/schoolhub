import {
  Controller,
  Get,
  Header,
  StreamableFile,
  Delete,
  Put,
  Param,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { School } from "@prisma/client";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { AuditActorParam } from "../../common/audit/audit-actor.decorator.js";
import type { AuditActor } from "../../common/audit/audit.js";
import { AssetsService } from "./assets.service.js";
import { MAX_IMAGE_BYTES } from "./image-validation.js";

const imageUpload = (field: string) =>
  FileInterceptor(field, { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } });

/** Uploads for the *current* school (resolved from the request's address). */
@Controller("schools/current")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Put("logo")
  @Roles("owner", "admin")
  @UseInterceptors(imageUpload("logo"))
  uploadLogo(
    @CurrentSchool() school: School,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.assets.setSchoolLogo(school, file);
  }

  @Delete("logo")
  @Roles("owner", "admin")
  removeLogo(@CurrentSchool() school: School) {
    return this.assets.removeSchoolLogo(school);
  }


  @Put("signatures/:kind/:personId")
  @Roles("owner", "admin", "headteacher")
  @UseInterceptors(imageUpload("signature"))
  uploadPersonSignature(
    @CurrentSchool() school: School,
    @Param("kind") kind: string,
    @Param("personId") personId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @AuditActorParam() actor: AuditActor,
  ) {
    return this.assets.setPersonSignature(school, kind, personId, file, actor);
  }

  @Get("signatures/:kind/:personId")
  @Roles("owner", "admin", "headteacher")
  @Header("Cache-Control", "private, no-store")
  @Header("X-Content-Type-Options", "nosniff")
  async readPersonSignature(@CurrentSchool() school: School, @Param("kind") kind: string,
    @Param("personId") personId: string, @AuditActorParam() actor: AuditActor) {
    const body = await this.assets.readPersonSignature(school, kind, personId, actor);
    return new StreamableFile(body, { type: "image/png", disposition: "inline" });
  }

  @Delete("signatures/:kind/:personId")
  @Roles("owner", "admin", "headteacher")
  removePersonSignature(
    @CurrentSchool() school: School,
    @Param("kind") kind: string,
    @Param("personId") personId: string,
    @AuditActorParam() actor: AuditActor,
  ) {
    return this.assets.removePersonSignature(school, kind, personId, actor);
  }

  @Put("photos/:kind/:personId")
  @Roles("owner", "admin", "headteacher")
  @UseInterceptors(imageUpload("avatar"))
  uploadPersonAvatar(@CurrentSchool() school: School, @Param("kind") kind: string,
    @Param("personId") personId: string, @UploadedFile() file: Express.Multer.File | undefined,
    @AuditActorParam() actor: AuditActor) {
    return this.assets.setPersonAvatar(school, kind, personId, file, actor);
  }

  @Put("me/avatar")
  @UseInterceptors(imageUpload("avatar"))
  uploadAvatar(
    @CurrentSchool() school: School,
    @CurrentUser() user: { id: string },
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.assets.setAvatar(school, user.id, file);
  }

  @Delete("me/avatar")
  removeAvatar(
    @CurrentSchool() school: School,
    @CurrentUser() user: { id: string },
  ) {
    return this.assets.removeAvatar(school, user.id);
  }
}
