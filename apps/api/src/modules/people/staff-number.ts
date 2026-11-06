import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/**
 * Letter that separates employee numbers from student admission numbers
 * (WIS20180039 is a student; T20180007 is a teacher). Uniqueness only needs
 * to hold within one school, so no school code is included.
 */
const TYPE_LETTER = { teacher: 'T', staff: 'S' } as const;

export type StaffNumberKind = keyof typeof TYPE_LETTER;

/**
 * Next employee number for a school, in the form <T|S><YYYY><NNNN>,
 * e.g. T20180007. The year is the year of hire; the sequence restarts at
 * 0001 each year, separately for teachers and non-teaching staff.
 *
 * Must run inside the creating transaction. The advisory lock makes two
 * simultaneous registrations queue instead of picking the same number.
 */
export async function nextStaffNumber(
  tx: Prisma.TransactionClient,
  params: { schoolId: string; kind: StaffNumberKind; hireDate: string },
): Promise<string> {
  const year = Number(params.hireDate.slice(0, 4));
  const prefix = `${TYPE_LETTER[params.kind]}${year}`;

  // $executeRaw because pg_advisory_xact_lock returns `void`, which
  // $queryRaw cannot deserialize.
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(
      hashtext(${params.schoolId}),
      hashtext(${`staff-number:${prefix}`})
    )
  `;

  const where = { schoolId: params.schoolId, staffNumber: { startsWith: prefix } };
  const select = { staffNumber: true } as const;
  const rows =
    params.kind === 'teacher'
      ? await tx.teacher.findMany({ where, select })
      : await tx.staff.findMany({ where, select });

  const last = rows.reduce((max, row) => {
    const sequence = row.staffNumber?.slice(prefix.length);
    if (!sequence || !/^\d{4}$/.test(sequence)) return max;
    return Math.max(max, Number(sequence));
  }, 0);
  if (last >= 9999) {
    throw new ConflictException(
      `This school has reached the 9,999 ${params.kind} numbers available for ${year}.`,
    );
  }
  return `${prefix}${String(last + 1).padStart(4, '0')}`;
}
