import { Body, Controller, Get, Param, Post, Query, UploadedFile, UseGuards, UseInterceptors, BadRequestException, Header, StreamableFile } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { School } from "@prisma/client";
import { z } from "zod";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentSchoolRole } from "../../common/decorators/current-school-role.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { FinanceWriteRateLimitGuard, SuperAdminReasonGuard } from "./finance-safeguards.js";
import { FINANCE_READ_ROLES, FINANCE_WRITE_ROLES } from "./finance.permissions.js";
import { FinanceBankReconciliationService } from "./finance-bank-reconciliation.service.js";
const inputSchema = z.object({ accountId: z.string().min(1), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), openingBalance: z.string(), closingBalance: z.string(), duplicateReviewReason: z.string().max(1000).optional(), mapping: z.object({ date: z.string().min(1), description: z.string().min(1), amount: z.string().optional(), debit: z.string().optional(), credit: z.string().optional(), reference: z.string().optional() }) });
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value); if (!result.success) throw new BadRequestException(result.error.issues.map(issue => issue.message).join("; ")); return result.data;
}
function uploadInput(body: { input?: string }, file?: Express.Multer.File) {
  if (!file) throw new BadRequestException("Choose a statement file.");
  let value: unknown; try { value = JSON.parse(body.input ?? ""); } catch { throw new BadRequestException("Invalid statement mapping metadata."); }
  return { file, input: parse(inputSchema, value) };
}
@Controller("finance/reconciliations")
@UseGuards(SchoolTenantGuard, RolesGuard, SuperAdminReasonGuard, FinanceWriteRateLimitGuard)
export class FinanceBankReconciliationController {
  constructor(private readonly service: FinanceBankReconciliationService) {}
  @Get() @Roles(...FINANCE_READ_ROLES)
  list(@CurrentSchool() school: School) { return this.service.list(school.id); }
  @Get("accounts") @Roles(...FINANCE_READ_ROLES)
  accounts(@CurrentSchool() school: School) { return this.service.accounts(school.id); }
  @Get(":id/candidates") @Roles(...FINANCE_READ_ROLES)
  candidates(@CurrentSchool() school: School, @Param("id") id: string, @Query("page") page: string) {
    return this.service.candidates(school.id, id, parse(z.coerce.number().int().min(1).max(100000), page ?? "1"));
  }
  @Post(":id/matches/:matchId/remove") @Roles(...FINANCE_WRITE_ROLES)
  unmatch(@CurrentSchool() school: School, @CurrentUser() actor: AuthenticatedUser, @Param("id") id: string, @Param("matchId") matchId: string) { return this.service.unmatch(school.id, actor.id, id, matchId); }
  @Get(":id/source") @Roles(...FINANCE_READ_ROLES)
  @Header("Cache-Control", "private, no-store") @Header("X-Content-Type-Options", "nosniff")
  async source(@CurrentSchool() school: School, @CurrentUser() actor: AuthenticatedUser, @Param("id") id: string) {
    const evidence = await this.service.source(school.id, actor.id, id);
    const name = evidence.fileName.replace(/[^a-zA-Z0-9_.-]/g, "_");
    return new StreamableFile(Buffer.from(evidence.sourceBytes), { type: "application/octet-stream", disposition: `attachment; filename="${name}"` });
  }
  @Post(":id/amend") @Roles(...FINANCE_WRITE_ROLES)
  amend(@CurrentSchool() school: School, @CurrentUser() actor: AuthenticatedUser, @Param("id") id: string) { return this.service.amend(school.id, actor.id, id); }
  @Get(":id") @Roles(...FINANCE_READ_ROLES)
  detail(@CurrentSchool() school: School, @Param("id") id: string) { return this.service.detail(school.id, id); }
  @Post("preview") @Roles(...FINANCE_WRITE_ROLES)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024, files: 1, fieldSize: 10000 } }))
  preview(@CurrentSchool() school: School, @Body() body: { input?: string }, @UploadedFile() file?: Express.Multer.File) {
    const upload = uploadInput(body, file); return this.service.preview(school.id, upload.file, upload.input);
  }
  @Post("import") @Roles(...FINANCE_WRITE_ROLES)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024, files: 1, fieldSize: 10000 } }))
  import(@CurrentSchool() school: School, @CurrentUser() actor: AuthenticatedUser, @Body() body: { input?: string }, @UploadedFile() file?: Express.Multer.File) {
    const upload = uploadInput(body, file); return this.service.import(school.id, actor.id, upload.file, upload.input);
  }
  @Post(":id/matches") @Roles(...FINANCE_WRITE_ROLES)
  match(@CurrentSchool() school: School, @CurrentUser() actor: AuthenticatedUser, @Param("id") id: string, @Body() body: unknown) {
    return this.service.match(school.id, actor.id, id, parse(z.object({ statementLineId: z.string().min(1), transactionId: z.string().min(1), amount: z.string().regex(/^\d{1,13}(?:\.\d{1,2})?$/) }), body));
  }
  @Post(":id/revise") @Roles(...FINANCE_WRITE_ROLES)
  revise(@CurrentSchool() school: School, @CurrentUser() actor: AuthenticatedUser, @Param("id") id: string) { return this.service.revise(school.id, actor.id, id); }
  @Post(":id/submit") @Roles(...FINANCE_WRITE_ROLES)
  submit(@CurrentSchool() school: School, @CurrentUser() actor: AuthenticatedUser, @Param("id") id: string) { return this.service.submit(school.id, actor.id, id); }
  @Post(":id/decide") @Roles("owner", "headteacher")
  decide(@CurrentSchool() school: School, @CurrentUser() actor: AuthenticatedUser, @CurrentSchoolRole() role: string | undefined, @Param("id") id: string, @Body() body: unknown) {
    const input = parse(z.object({ approve: z.boolean(), note: z.string().trim().min(10).max(1000) }), body);
    return this.service.decide(school.id, actor.id, role, id, input.approve, input.note);
  }
}
