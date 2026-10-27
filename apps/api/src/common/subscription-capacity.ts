import { ForbiddenException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

type Capacity = "students" | "teachers" | "guardians" | "staff";

/**
 * Must be called inside the write transaction before creating a record.
 * A per-school advisory transaction lock serializes quota checks across the
 * different create flows, avoiding concurrent requests racing past a cap.
 */
export async function assertSubscriptionCapacity(
  tx: Prisma.TransactionClient,
  schoolId: string,
  capacity: Capacity,
  incoming = 1,
): Promise<void> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtext(${schoolId}), hashtext('schoolhub-subscription-quota'))
  `;
  const subscription = await tx.subscription.findUnique({
    where: { schoolId },
    select: { maxStudents: true, maxTeachers: true, maxGuardians: true, maxStaff: true },
  });
  if (!subscription) return;

  const cap = {
    students: subscription.maxStudents,
    teachers: subscription.maxTeachers,
    guardians: subscription.maxGuardians,
    staff: subscription.maxStaff,
  }[capacity];
  if (cap === null || cap === undefined) return;

  const current = capacity === "students"
    ? await tx.student.count({ where: { schoolId, deletedAt: null } })
    : capacity === "teachers"
      ? await tx.teacher.count({ where: { schoolId, deletedAt: null } })
      : capacity === "guardians"
        ? await tx.guardian.count({ where: { schoolId, deletedAt: null } })
        : await tx.staff.count({ where: { schoolId, deletedAt: null } });

  if (current + incoming > cap) {
    throw new ForbiddenException({
      error: "SUBSCRIPTION_CAPACITY_REACHED",
      message: `This school's subscription allows up to ${cap} ${capacity}. Current usage is ${current}. Upgrade the plan or contact the platform administrator.`,
      capacity,
      limit: cap,
      current,
      requested: incoming,
    });
  }
}
