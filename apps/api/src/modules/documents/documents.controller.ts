import { Body, Controller, Delete, Get, Header, Param, Post, Query, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { School } from "@prisma/client";
import { z } from "zod";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentSchoolRole } from "../../common/decorators/current-school-role.decorator.js";
import { AuditActorParam } from "../../common/audit/audit-actor.decorator.js";
import type { AuditActor } from "../../common/audit/audit.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { DocumentsService } from "./documents.service.js";

const querySchema = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25), search: z.string().trim().max(150).default("") });

@Controller("documents")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @Roles("owner", "admin", "headteacher", "teacher", "accountant", "staff")
  @Header("Cache-Control", "private, no-store")
  list(@CurrentSchool() school: School, @CurrentSchoolRole() role: string,
    @Query(new ZodValidationPipe(querySchema)) query: z.infer<typeof querySchema>) {
    return this.documents.listSchoolDocuments(school.id, role, query.page, query.limit, query.search);
  }

  @Get(":id/download")
  @Roles("owner", "admin", "headteacher", "teacher", "accountant", "staff")
  @Header("Cache-Control", "private, no-store")
  @Header("X-Content-Type-Options", "nosniff")
  async download(@CurrentSchool() school: School, @CurrentSchoolRole() role: string, @Param("id") id: string,
    @AuditActorParam() actor: AuditActor) {
    const file = await this.documents.download(school.id, id, role, actor);
    return new StreamableFile(file.body, { type: file.fileType,
      disposition: `attachment; filename="document"; filename*=UTF-8''${encodeURIComponent(file.title).replace(/'/g, "%27")}` });
  }

  @Post()
  @Roles("owner", "admin", "headteacher")
  @Header("Cache-Control", "no-store")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  upload(@CurrentSchool() school: School, @AuditActorParam() actor: AuditActor,
    @UploadedFile() file: Express.Multer.File | undefined, @Body("title") title: string,
    @Body("description") description?: string, @Body("audience") audience?: string) {
    return this.documents.uploadSchoolDocument(school, actor, file, title, description, audience);
  }

  @Delete(":id")
  @Roles("owner", "admin", "headteacher")
  remove(@CurrentSchool() school: School, @Param("id") id: string, @AuditActorParam() actor: AuditActor) {
    return this.documents.removeSchoolDocument(school, id, actor);
  }
}
