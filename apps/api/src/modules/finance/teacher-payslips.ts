import type { Prisma } from "@prisma/client";

/** The same scope protects both the history and individual PDF downloads. */
export function ownTeacherPayslipScope(schoolId: string, userId: string): Prisma.PayslipWhereInput {
  return {
    schoolId,
    staffId: null,
    teacher: { schoolId, isActive: true, deletedAt: null, profile: { userId } },
    payrollRecord: { schoolId, status: { in: ["APPROVED", "PAID"] } },
  };
}
