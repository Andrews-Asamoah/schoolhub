import { z } from "zod";

export const payrollPersonKind = z.enum(["TEACHER", "STAFF"]);
const monthlySalary = z.string().regex(/^\d{1,8}(?:\.\d{1,2})?$/).refine(
  value => Number(value) <= 10_000_000, "Monthly salary must be between GHS 0 and 10,000,000.",
);
const salaryRow = z.object({
  row: z.number().int().min(2).max(5001),
  kind: payrollPersonKind,
  employeeCode: z.string().trim().min(1).max(100),
  monthlySalary,
});
export const payrollSalaryImportSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("preview"), rows: z.array(salaryRow).min(1).max(250) }),
  z.object({ mode: z.literal("apply"), rows: z.array(salaryRow.extend({
    employeeId: z.string().min(1).max(100),
    expectedSalary: monthlySalary.nullable(),
  })).min(1).max(250) }),
]);
export type PayrollSalaryImportInput = z.infer<typeof payrollSalaryImportSchema>;

export const payrollPaymentDetailsSchema = z.object({
  ssnitNumber: z.string().trim().toUpperCase().refine(value => !value || /^[A-Z0-9-]{3,32}$/.test(value),
    "Enter the SSNIT number using letters, numbers or hyphens."),
  tier2MemberNumber: z.string().trim().max(50).default(""),
  /** Tax Identification Number (or Ghana Card PIN) used on the GRA monthly PAYE return. */
  tin: z.string().trim().toUpperCase().refine(value => !value || /^[A-Z0-9-]{5,20}$/.test(value),
    "Enter the TIN using letters, numbers or hyphens.").default(""),
  bank: z.object({
    name: z.string().trim().min(1).max(100),
    branch: z.string().trim().max(100),
    accountName: z.string().trim().min(1).max(150),
    accountNumber: z.string().trim().regex(/^\d{4,34}$/, "Enter the account number as digits."),
  }).nullable(),
});
export type PayrollPaymentDetailsInput = z.infer<typeof payrollPaymentDetailsSchema>;
