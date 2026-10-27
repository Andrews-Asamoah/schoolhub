import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { School } from "@prisma/client";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { DocumentsService } from "./documents.service.js";

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

@Controller("documents")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @Roles("owner", "admin", "headteacher", "teacher", "accountant", "staff")
  list(@CurrentSchool() school: School) {
    return this.documents.listSchoolDocuments(school.id);
  }

  @Post()
  @Roles("owner", "admin", "headteacher")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 } }))
  upload(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body("title") title: string,
    @Body("description") description?: string,
  ) {
    return this.documents.uploadSchoolDocument(school, user.id, file, title, description);
  }

  @Delete(":id")
  @Roles("owner", "admin", "headteacher")
  remove(@CurrentSchool() school: School, @Param("id") id: string) {
    return this.documents.removeSchoolDocument(school, id);
  }
}
