import { describe, expect, it } from 'vitest';
import { nextStaffNumber } from './staff-number.js';

function fakeTx(existing: string[]) {
  const rows = existing.map((staffNumber) => ({ staffNumber }));
  return {
    teacher: { findMany: async () => rows },
    staff: { findMany: async () => rows },
    $executeRaw: async () => 0,
  } as never;
}

describe('nextStaffNumber', () => {
  it('starts at 0001 for the hire year', async () => {
    const n = await nextStaffNumber(fakeTx([]), { schoolId: 's', kind: 'teacher', hireDate: '2018-09-03' });
    expect(n).toBe('T20180001');
  });
  it('continues after the highest existing number', async () => {
    const n = await nextStaffNumber(fakeTx(['T20180001', 'T20180038']), { schoolId: 's', kind: 'teacher', hireDate: '2018-01-10' });
    expect(n).toBe('T20180039');
  });
  it('ignores hand-typed numbers that are not in the pattern', async () => {
    const n = await nextStaffNumber(fakeTx(['T2018ABCD', 'T201812345']), { schoolId: 's', kind: 'teacher', hireDate: '2018-01-10' });
    expect(n).toBe('T20180001');
  });
  it('uses S for non-teaching staff', async () => {
    const n = await nextStaffNumber(fakeTx([]), { schoolId: 's', kind: 'staff', hireDate: '2026-11-05' });
    expect(n).toBe('S20260001');
  });
});
