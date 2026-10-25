import {
  Controller,
  ForbiddenException,
  Get,
  Post,
  Patch,
  Put,
  Param,
  Query,
  Headers,
  Body,
  UseGuards,
  UseInterceptors,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { FinanceService } from "./finance.service.js";
import { FinanceExportsService, type FinanceExportContext, type FinanceExportFile } from "./finance-exports.service.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { FINANCE_PAYROLL_EXPORT_ROLES, FINANCE_READ_ROLES, FINANCE_WRITE_ROLES, canExportFinancePayroll } from "./finance.permissions.js";
import { FinanceAuditInterceptor, FinanceSelfAudited } from "./finance-audit.interceptor.js";
import { FinanceWriteRateLimitGuard, SuperAdminReasonGuard } from "./finance-safeguards.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentSchoolRole } from "../../common/decorators/current-school-role.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import {
  createExpenseSchema,
  generateBillSchema,
  recordPaymentSchema,
  updatePayrollSalarySchema,
  type UpdatePayrollSalaryInput,
  type CreateExpenseInput,
  type GenerateBillInput,
  type RecordPaymentInput,
} from "@schoolhub/shared";
import type { School } from "@prisma/client";
import { z } from "zod";

const feeStructureSchema = z.object({
  name: z.string().trim().min(2, "Enter a fee structure name").max(120),
  description: z.string().trim().max(500).optional(),
  classLevel: z.string().trim().max(120).optional(),
  termBased: z.boolean().default(true),
  targetClassIds: z.array(z.string().min(1)).max(100).default([]),
  items: z.array(z.object({
    registryItemId: z.string().optional().nullable(),
    name: z.string().trim().min(1, "Every fee item needs a name").max(120),
    amount: z.number().finite().min(0).max(100000000),
    isOptional: z.boolean().default(false),
    description: z.string().trim().max(500).optional(),
  })).min(1, "Add at least one fee item").max(100),
});
const feeItemRegistrySchema = z.object({
  name: z.string().trim().min(2, "Enter a category name").max(120),
  description: z.string().trim().max(500).optional(),
});
const feeStructureStatusSchema = z.object({ isActive: z.boolean() });
const expenditureCategorySchema = z.object({ name: z.string().trim().min(2, "Enter a category name").max(120), description: z.string().trim().max(500).optional() });
const payrollDraftSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.literal(2026),
  confirmResidentTaxTreatment: z.literal(true),
});
const payrollTransitionSchema = z.object({
  status: z.enum(["APPROVED", "PAID", "CANCELLED"]),
  paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "CHEQUE", "MOBILE_MONEY", "CARD", "ONLINE", "OTHER"]).optional(),
});
const feeReminderCreateSchema = z.object({
  name: z.string().trim().min(2, "Enter a schedule name").max(120),
  description: z.string().trim().max(500).optional(),
  messageTemplate: z.string().trim().min(12, "Write a useful reminder message").max(1500),
  minimumOutstanding: z.number().finite().min(0).max(100000000).default(0),
  installment: z.object({
    label: z.string().trim().min(1).max(100),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
    sendDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
  }).optional(),
});
const reminderScheduleActiveSchema = z.object({ isActive: z.boolean() });
const feeReminderInstallmentSchema = z.object({
  label: z.string().trim().min(1, "Enter an installment label").max(100),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
  sendDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
});



const siblingPolicySchema = z.object({
  name: z.string().trim().min(2).max(120),
  minimumWardCount: z.number().int().min(2).max(30),
  valueType: z.enum(["PERCENTAGE", "FIXED"]),
  value: z.number().finite().positive().max(100000000),
});
const scholarshipSchema = z.object({
  studentId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  valueType: z.enum(["PERCENTAGE", "FIXED"]),
  value: z.number().finite().positive().max(100000000),
  reason: z.string().trim().max(500).optional(),
  academicYearId: z.string().min(1).optional(),
  termId: z.string().min(1).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
const concessionStatusSchema = z.object({ isActive: z.boolean() });
const periodLockSchema = z.object({
  lockedThrough: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD").nullable(),
  reason: z.string().trim().min(10, "Explain why the books are being closed or reopened (at least 10 characters)").max(500),
});
const reversePaymentSchema = z.object({
  kind: z.enum(["VOID", "REFUND"]).default("VOID"),
  reason: z.string().trim().min(10, "Explain why this payment is being reversed (at least 10 characters)").max(500),
});

@Controller("finance")
@UseGuards(SchoolTenantGuard, RolesGuard, SuperAdminReasonGuard, FinanceWriteRateLimitGuard)
@UseInterceptors(FinanceAuditInterceptor)
export class FinanceController {
  constructor(
    private readonly financeService: FinanceService,
    private readonly financeExports: FinanceExportsService,
  ) {}


  @Get("concessions")
  @Roles(...FINANCE_READ_ROLES)
  listConcessions(@CurrentSchool() school: School) {
    return this.financeService.listConcessions(school.id);
  }

  @Post("sibling-discount-policies")
  @Roles(...FINANCE_WRITE_ROLES)
  createSiblingDiscountPolicy(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(siblingPolicySchema)) body: z.infer<typeof siblingPolicySchema>,
  ) {
    return this.financeService.createSiblingDiscountPolicy(school.id, user.id, body);
  }

  @Patch("sibling-discount-policies/:policyId")
  @Roles(...FINANCE_WRITE_ROLES)
  setSiblingDiscountPolicyActive(
    @CurrentSchool() school: School,
    @Param("policyId") policyId: string,
    @Body(new ZodValidationPipe(concessionStatusSchema)) body: z.infer<typeof concessionStatusSchema>,
  ) {
    return this.financeService.setSiblingDiscountPolicyActive(school.id, policyId, body.isActive);
  }

  @Post("scholarships")
  @Roles(...FINANCE_WRITE_ROLES)
  createStudentScholarship(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(scholarshipSchema)) body: z.infer<typeof scholarshipSchema>,
  ) {
    return this.financeService.createStudentScholarship(school.id, user.id, body);
  }

  @Patch("scholarships/:scholarshipId")
  @Roles(...FINANCE_WRITE_ROLES)
  setStudentScholarshipActive(
    @CurrentSchool() school: School,
    @Param("scholarshipId") scholarshipId: string,
    @Body(new ZodValidationPipe(concessionStatusSchema)) body: z.infer<typeof concessionStatusSchema>,
  ) {
    return this.financeService.setStudentScholarshipActive(school.id, scholarshipId, body.isActive);
  }

  @Get("fee-structures")
  @Roles(...FINANCE_READ_ROLES)
  listFeeStructures(
    @CurrentSchool() school: School,
    @Query("includeArchived") includeArchived?: string,
  ) {
    return this.financeService.listFeeStructures(school.id, includeArchived === "true");
  }

  @Post("fee-structures")
  @Roles(...FINANCE_WRITE_ROLES)
  createFeeStructure(
    @CurrentSchool() school: School,
    @Body(new ZodValidationPipe(feeStructureSchema)) body: z.infer<typeof feeStructureSchema>,
  ) {
    return this.financeService.createFeeStructure(school.id, body);
  }

  @Patch("fee-structures/:feeStructureId")
  @Roles(...FINANCE_WRITE_ROLES)
  setFeeStructureActive(
    @CurrentSchool() school: School,
    @Param("feeStructureId") feeStructureId: string,
    @Body(new ZodValidationPipe(feeStructureStatusSchema)) body: z.infer<typeof feeStructureStatusSchema>,
  ) {
    return this.financeService.setFeeStructureActive(school.id, feeStructureId, body.isActive);
  }

  @Put("fee-structures/:feeStructureId")
  @Roles(...FINANCE_WRITE_ROLES)
  updateFeeStructure(
    @CurrentSchool() school: School,
    @Param("feeStructureId") feeStructureId: string,
    @Body(new ZodValidationPipe(feeStructureSchema)) body: z.infer<typeof feeStructureSchema>,
  ) {
    return this.financeService.updateFeeStructure(school.id, feeStructureId, body);
  }

  @Get("fee-item-registry")
  @Roles(...FINANCE_READ_ROLES)
  listFeeItemRegistry(@CurrentSchool() school: School) {
    return this.financeService.listFeeItemRegistry(school.id);
  }

  @Post("fee-item-registry")
  @Roles(...FINANCE_WRITE_ROLES)
  createFeeItemRegistry(
    @CurrentSchool() school: School,
    @Body(new ZodValidationPipe(feeItemRegistrySchema)) body: z.infer<typeof feeItemRegistrySchema>,
  ) {
    return this.financeService.createFeeItemRegistry(school.id, body);
  }

  @Patch("fee-item-registry/:itemId")
  @Roles(...FINANCE_WRITE_ROLES)
  updateFeeItemRegistry(
    @CurrentSchool() school: School,
    @Param("itemId") itemId: string,
    @Body(new ZodValidationPipe(feeItemRegistrySchema)) body: z.infer<typeof feeItemRegistrySchema>,
  ) {
    return this.financeService.updateFeeItemRegistry(school.id, itemId, body);
  }

  @Get("bills")
  @Roles(...FINANCE_READ_ROLES)
  listBills(
    @CurrentSchool() school: School,
    @Query("studentId") studentId?: string,
  ) {
    return this.financeService.listBills(school.id, studentId);
  }

  @Get("students/outstanding")
  @Roles(...FINANCE_READ_ROLES)
  listOutstandingStudents(@CurrentSchool() school: School) {
    return this.financeService.listOutstandingStudents(school.id);
  }

  @Get("payments")
  @Roles(...FINANCE_READ_ROLES)
  listPayments(@CurrentSchool() school: School) {
    return this.financeService.listPayments(school.id);
  }

  @Get("expenses")
  @Roles(...FINANCE_READ_ROLES)
  listExpenses(
    @CurrentSchool() school: School,
    @Query("from") fromDate?: string,
    @Query("to") toDate?: string,
  ) {
    return this.financeService.listExpenses(school.id, fromDate, toDate);
  }

  @Get("expenditure-categories")
  @Roles(...FINANCE_READ_ROLES)
  listExpenditureCategories(@CurrentSchool() school: School) {
    return this.financeService.listExpenditureCategories(school.id);
  }

  @Post("expenditure-categories")
  @Roles(...FINANCE_WRITE_ROLES)
  createExpenditureCategory(
    @CurrentSchool() school: School,
    @Body(new ZodValidationPipe(expenditureCategorySchema)) body: z.infer<typeof expenditureCategorySchema>,
  ) {
    return this.financeService.createExpenditureCategory(school.id, body);
  }

  @Patch("expenditure-categories/:categoryId")
  @Roles(...FINANCE_WRITE_ROLES)
  updateExpenditureCategory(
    @CurrentSchool() school: School,
    @Param("categoryId") categoryId: string,
    @Body(new ZodValidationPipe(expenditureCategorySchema)) body: z.infer<typeof expenditureCategorySchema>,
  ) {
    return this.financeService.updateExpenditureCategory(school.id, categoryId, body);
  }

  @Post("expenses")
  @Roles(...FINANCE_WRITE_ROLES)
  @FinanceSelfAudited()
  createExpense(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createExpenseSchema)) body: CreateExpenseInput,
  ) {
    return this.financeService.createExpense(school.id, user.id, body);
  }

  @Get("payroll")
  @Roles(...FINANCE_READ_ROLES)
  listPayrollRecords(@CurrentSchool() school: School) {
    return this.financeService.listPayrollRecords(school.id);
  }

  @Get("payroll/salaries")
  @Roles(...FINANCE_READ_ROLES)
  listPayrollSalaryRegister(@CurrentSchool() school: School) {
    return this.financeService.listPayrollSalaryRegister(school.id);
  }

  @Patch("payroll/salaries/:kind/:personId")
  @Roles(...FINANCE_WRITE_ROLES)
  updatePayrollSalary(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Param("kind") kind: string,
    @Param("personId") personId: string,
    @Body(new ZodValidationPipe(updatePayrollSalarySchema)) body: UpdatePayrollSalaryInput,
  ) {
    return this.financeService.updatePayrollSalary(school.id, kind, personId, body.monthlySalary, user.id);
  }

  @Post("payroll")
  @Roles(...FINANCE_WRITE_ROLES)
  generatePayrollDraft(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(payrollDraftSchema)) body: z.infer<typeof payrollDraftSchema>,
  ) {
    return this.financeService.generatePayrollDraft(school.id, user.id, body);
  }

  @Patch("payroll/:recordId/status")
  @Roles(...FINANCE_WRITE_ROLES)
  transitionPayroll(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Param("recordId") recordId: string,
    @Body(new ZodValidationPipe(payrollTransitionSchema)) body: z.infer<typeof payrollTransitionSchema>,
  ) {
    return this.financeService.transitionPayroll(school.id, recordId, body, user.id);
  }

  @Post("bills/generate")
  @Roles(...FINANCE_WRITE_ROLES)
  @FinanceSelfAudited()
  generateBills(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(generateBillSchema)) body: GenerateBillInput,
  ) {
    return this.financeService.generateBills(school.id, body, user.id);
  }

  @Post("payments")
  @Roles(...FINANCE_WRITE_ROLES)
  @FinanceSelfAudited()
  recordPayment(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(recordPaymentSchema)) body: RecordPaymentInput,
  ) {
    return this.financeService.recordPayment(school.id, user.id, body);
  }


  @Get("audit-log")
  @Roles(...FINANCE_READ_ROLES)
  listFinanceAudit(
    @CurrentSchool() school: School,
    @Query("category") category?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.financeService.listFinanceAudit(school.id, { category, from, to, cursor, limit });
  }

  @Get("period-lock")
  @Roles(...FINANCE_READ_ROLES)
  getPeriodLock(@CurrentSchool() school: School) {
    return this.financeService.getPeriodLock(school.id);
  }

  @Put("period-lock")
  @Roles(...FINANCE_WRITE_ROLES)
  setPeriodLock(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(periodLockSchema)) body: z.infer<typeof periodLockSchema>,
  ) {
    return this.financeService.setPeriodLock(school.id, user.id, user.role === "superAdmin", body);
  }

  @Post("payments/:paymentId/reverse")
  @Roles(...FINANCE_WRITE_ROLES)
  @FinanceSelfAudited()
  reversePayment(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Param("paymentId") paymentId: string,
    @Body(new ZodValidationPipe(reversePaymentSchema)) body: z.infer<typeof reversePaymentSchema>,
  ) {
    return this.financeService.reversePayment(school.id, user.id, paymentId, body);
  }

  @Get("fee-reminders")
  @Roles(...FINANCE_READ_ROLES)
  listFeeReminderSchedules(@CurrentSchool() school: School) {
    return this.financeService.listFeeReminderSchedules(school.id);
  }

  @Post("fee-reminders")
  @Roles(...FINANCE_WRITE_ROLES)
  createFeeReminderSchedule(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(feeReminderCreateSchema)) body: z.infer<typeof feeReminderCreateSchema>,
  ) {
    return this.financeService.createFeeReminderSchedule(school.id, user.id, body);
  }

  @Patch("fee-reminders/:scheduleId")
  @Roles(...FINANCE_WRITE_ROLES)
  setFeeReminderScheduleActive(
    @CurrentSchool() school: School,
    @Param("scheduleId") scheduleId: string,
    @Body(new ZodValidationPipe(reminderScheduleActiveSchema)) body: z.infer<typeof reminderScheduleActiveSchema>,
  ) {
    return this.financeService.setFeeReminderScheduleActive(school.id, scheduleId, body.isActive);
  }

  @Post("fee-reminders/:scheduleId/installments")
  @Roles(...FINANCE_WRITE_ROLES)
  addFeeReminderInstallment(
    @CurrentSchool() school: School,
    @Param("scheduleId") scheduleId: string,
    @Body(new ZodValidationPipe(feeReminderInstallmentSchema)) body: z.infer<typeof feeReminderInstallmentSchema>,
  ) {
    return this.financeService.addFeeReminderInstallment(school.id, scheduleId, body);
  }

  @Get("fee-reminders/:scheduleId/preview")
  @Roles(...FINANCE_READ_ROLES)
  previewFeeReminder(
    @CurrentSchool() school: School,
    @Param("scheduleId") scheduleId: string,
  ) {
    return this.financeService.previewFeeReminder(school.id, scheduleId);
  }

  @Post("fee-reminders/:scheduleId/send")
  @Roles(...FINANCE_WRITE_ROLES)
  sendFeeReminderInApp(
    @CurrentSchool() school: School,
    @Param("scheduleId") scheduleId: string,
  ) {
    return this.financeService.sendFeeReminderInApp(school.id, scheduleId);
  }


  /** Server-side, school-scoped exports. Each successful export is audited by FinanceExportsService. */
  private assertPayrollExportAllowed(user: AuthenticatedUser, schoolRole: string | undefined) {
    // RolesGuard grants platform superAdmins a global bypass. Confidential payroll exports intentionally do not.
    if (!canExportFinancePayroll(user.role, schoolRole)) {
      throw new ForbiddenException("Payroll and salary exports are limited to the accountant, owner and headteacher roles.");
    }
  }

  private financeExportContext(
    school: School,
    user: AuthenticatedUser,
    request: Request,
    from?: string,
    to?: string,
  ): FinanceExportContext {
    return {
      schoolId: school.id,
      actorId: user.id,
      actorName: user.name,
      ipAddress: request.ip,
      userAgent: request.get("user-agent") ?? undefined,
      from,
      to,
    };
  }

  private sendFinanceExport(response: Response, file: FinanceExportFile, disposition: "attachment" | "inline" = "attachment") {
    const safeFileName = file.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    response.setHeader("Content-Type", file.contentType);
    response.setHeader("Content-Disposition", disposition + '; filename="' + safeFileName + '"');
    response.setHeader("Cache-Control", "private, no-store, max-age=0");
    response.setHeader("X-Content-Type-Options", "nosniff");
    return response.status(200).send(file.buffer);
  }

  @Get("exports/bills.xlsx")
  @Roles(...FINANCE_READ_ROLES)
  async exportBillsExcel(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res() response: Response,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const context = this.financeExportContext(school, user, request, from, to);
    return this.sendFinanceExport(response, await this.financeExports.exportExcel(context, "bills"));
  }

  @Get("exports/payments.xlsx")
  @Roles(...FINANCE_READ_ROLES)
  async exportPaymentsExcel(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res() response: Response,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const context = this.financeExportContext(school, user, request, from, to);
    return this.sendFinanceExport(response, await this.financeExports.exportExcel(context, "payments"));
  }

  @Get("exports/expenses.xlsx")
  @Roles(...FINANCE_READ_ROLES)
  async exportExpensesExcel(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res() response: Response,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const context = this.financeExportContext(school, user, request, from, to);
    return this.sendFinanceExport(response, await this.financeExports.exportExcel(context, "expenses"));
  }

  @Get("exports/payroll.xlsx")
  @Roles(...FINANCE_PAYROLL_EXPORT_ROLES)
  async exportPayrollExcel(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSchoolRole() schoolRole: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    this.assertPayrollExportAllowed(user, schoolRole);
    const context = this.financeExportContext(school, user, request, from, to);
    return this.sendFinanceExport(response, await this.financeExports.exportExcel(context, "payroll"));
  }

  @Get("exports/salaries.xlsx")
  @Roles(...FINANCE_PAYROLL_EXPORT_ROLES)
  async exportSalaryExcel(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSchoolRole() schoolRole: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    this.assertPayrollExportAllowed(user, schoolRole);
    const context = this.financeExportContext(school, user, request, from, to);
    return this.sendFinanceExport(response, await this.financeExports.exportExcel(context, "salaries"));
  }

  @Get("bills/:billId/invoice.pdf")
  @Roles(...FINANCE_READ_ROLES)
  async exportInvoicePdf(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res() response: Response,
    @Param("billId") billId: string,
  ) {
    const context = this.financeExportContext(school, user, request);
    return this.sendFinanceExport(response, await this.financeExports.invoicePdf(context, billId), "inline");
  }

  @Get("payments/:paymentId/receipt.pdf")
  @Roles(...FINANCE_READ_ROLES)
  async exportReceiptPdf(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res() response: Response,
    @Param("paymentId") paymentId: string,
  ) {
    const context = this.financeExportContext(school, user, request);
    return this.sendFinanceExport(response, await this.financeExports.receiptPdf(context, paymentId), "inline");
  }

  @Get("students/:studentId/statement.pdf")
  @Roles(...FINANCE_READ_ROLES)
  async exportStudentStatementPdf(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res() response: Response,
    @Param("studentId") studentId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const context = this.financeExportContext(school, user, request, from, to);
    return this.sendFinanceExport(response, await this.financeExports.studentStatementPdf(context, studentId), "inline");
  }

  @Get("payslips/:payslipId.pdf")
  @Roles(...FINANCE_PAYROLL_EXPORT_ROLES)
  async exportSinglePayslipPdf(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSchoolRole() schoolRole: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
    @Param("payslipId") payslipId: string,
  ) {
    this.assertPayrollExportAllowed(user, schoolRole);
    const context = this.financeExportContext(school, user, request);
    return this.sendFinanceExport(response, await this.financeExports.payslipPdf(context, payslipId), "inline");
  }

  @Get("payroll/:recordId/payslips.pdf")
  @Roles(...FINANCE_PAYROLL_EXPORT_ROLES)
  async exportPayrollPdf(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSchoolRole() schoolRole: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
    @Param("recordId") recordId: string,
  ) {
    this.assertPayrollExportAllowed(user, schoolRole);
    const context = this.financeExportContext(school, user, request);
    return this.sendFinanceExport(response, await this.financeExports.payrollPdf(context, recordId), "inline");
  }

  @Get("students/:studentId/ledger")
  @Roles(...FINANCE_READ_ROLES)
  getStudentLedger(
    @CurrentSchool() school: School,
    @Param("studentId") studentId: string,
    @CurrentSchoolRole() role: string | undefined,
    @Headers("x-academic-year-id") academicYearId?: string,
    @Headers("x-academic-term-id") termId?: string,
  ) {
    return this.financeService.getStudentLedger(
      school.id,
      studentId,
      role,
      academicYearId,
      termId,
    );
  }
}
