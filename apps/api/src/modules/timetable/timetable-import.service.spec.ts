import { describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { TimetableImportService } from './timetable-import.service.js';
import type { TimetableService } from './timetable.service.js';

const school = { id: 'school-1' };
const periods = [
  { id: 'p1', schoolId: 'school-1', departmentId: 'jhs', name: 'Period 1', startTime: '08:00', endTime: '08:40', sortOrder: 0 },
  { id: 'p2', schoolId: 'school-1', departmentId: 'jhs', name: 'Period 2', startTime: '08:40', endTime: '09:20', sortOrder: 1 },
];
const teacher = (id: string, email: string, firstName: string, lastName: string) => ({
  id, invitationEmail: email, firstName, lastName, profile: null,
});

function createService(entries: unknown[] = []) {
  const prisma = {
    client: {
      class: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'class-a', name: 'JHS 1A', departmentId: 'jhs' },
          { id: 'class-b', name: 'JHS 1B', departmentId: 'jhs' },
        ]),
      },
      periodTemplate: { findMany: vi.fn().mockResolvedValue(periods) },
      subject: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'sci', name: 'Integrated Science', code: 'SCI', strands: [] },
          { id: 'eng', name: 'English', code: 'ENG', strands: [] },
          { id: 'ict', name: 'ICT', code: 'ICT', strands: [{ id: 'ict-hw', name: 'Hardware', code: 'HW' }] },
        ]),
      },
      teacher: {
        findMany: vi.fn().mockResolvedValue([
          teacher('t-ama', 'ama@example.test', 'Ama', 'Mensah'),
          teacher('t-kojo', 'kojo@example.test', 'Kojo', 'Owusu'),
        ]),
      },
      classroom: { findMany: vi.fn().mockResolvedValue([{ id: 'lab', name: 'Science Lab' }]) },
      classSubject: {
        findMany: vi.fn().mockResolvedValue([
          { classId: 'class-a', subjectId: 'eng', teacherId: 't-kojo', strandAssignments: [] },
          { classId: 'class-a', subjectId: 'ict', teacherId: null, strandAssignments: [{ subjectStrandId: 'ict-hw', teacherId: 't-kojo' }] },
        ]),
      },
      timetableEntry: { findMany: vi.fn().mockResolvedValue(entries) },
    },
  } as unknown as PrismaService;
  const saveEntry = vi.fn().mockResolvedValue({ id: 'saved' });
  const timetable = {
    resolveYearId: vi.fn().mockResolvedValue('year-1'),
    saveEntry,
  } as unknown as TimetableService;
  return { service: new TimetableImportService(prisma, timetable), saveEntry };
}

const csv = (...lines: string[]) => ({
  buffer: Buffer.from(['class,day,period,type,subject,strand,teacher,room,label', ...lines].join('\n')),
  originalname: 'timetable.csv',
});

describe('TimetableImportService preview', () => {
  it('resolves names to ids and marks clean rows ready', async () => {
    const { service } = createService();
    const result = await service.preview(school, csv('JHS 1A,Mon,Period 1,LESSON,sci,,ama@example.test,Science Lab,'));
    expect(result.summary).toMatchObject({ ready: 1, error: 0 });
    expect(result.rows[0]!.row).toMatchObject({
      classId: 'class-a', dayOfWeek: 'MONDAY', periodId: 'p1', type: 'LESSON',
      subjectId: 'sci', teacherId: 't-ama', classroomId: 'lab',
    });
  });

  it('accepts a start time in place of a period name and a blank type', async () => {
    const { service } = createService();
    const result = await service.preview(school, csv('JHS 1A,TUESDAY,08:40,,Integrated Science,,,,'));
    expect(result.rows[0]).toMatchObject({ status: 'ready', row: { periodId: 'p2', type: 'LESSON' } });
  });

  it('explains unknown classes, days, periods, subjects, teachers and rooms', async () => {
    const { service } = createService();
    const result = await service.preview(
      school,
      csv(
        'JHS 9Z,MONDAY,Period 1,LESSON,SCI,,,,',
        'JHS 1A,Funday,Period 1,LESSON,SCI,,,,',
        'JHS 1A,MONDAY,Period 9,LESSON,SCI,,,,',
        'JHS 1A,MONDAY,Period 1,LESSON,MATHS,,,,',
        'JHS 1A,MONDAY,Period 1,LESSON,SCI,,nobody@example.test,,',
        'JHS 1A,MONDAY,Period 1,LESSON,SCI,,,Hall,',
      ),
    );
    expect(result.summary.error).toBe(6);
    expect(result.rows.map((row) => row.errors.join(' '))).toEqual([
      expect.stringContaining('No active class'),
      expect.stringContaining('not a day'),
      expect.stringContaining('no period'),
      expect.stringContaining('No active subject'),
      expect.stringContaining('No active teacher'),
      expect.stringContaining('No room'),
    ]);
  });

  it('requires a subject for lessons and a label for breaks', async () => {
    const { service } = createService();
    const result = await service.preview(school, csv('JHS 1A,MONDAY,Period 1,LESSON,,,,,', 'JHS 1A,MONDAY,Period 2,BREAK,,,,,'));
    expect(result.rows[0]!.errors.join(' ')).toContain('Subject is required');
    expect(result.rows[1]!.errors.join(' ')).toContain('label');
  });

  it('requires a teaching area for a subject that has them', async () => {
    const { service } = createService();
    const result = await service.preview(
      school,
      csv('JHS 1A,MONDAY,Period 1,LESSON,ICT,,,,', 'JHS 1A,MONDAY,Period 2,LESSON,ICT,Hardware,,,'),
    );
    expect(result.rows[0]!.errors.join(' ')).toContain('teaching area');
    expect(result.rows[1]).toMatchObject({ status: 'ready', row: { subjectStrandId: 'ict-hw' } });
  });

  it('flags a class and period filled twice in the file', async () => {
    const { service } = createService();
    const result = await service.preview(
      school,
      csv('JHS 1A,MONDAY,Period 1,LESSON,SCI,,ama@example.test,,', 'JHS 1A,MONDAY,Period 1,LESSON,ENG,,,,'),
    );
    expect(result.rows.map((row) => row.status)).toEqual(['ready', 'duplicate']);
  });

  it('flags a teacher placed in two classes at the same time, including the inferred teacher', async () => {
    const { service } = createService();
    const result = await service.preview(
      school,
      csv(
        'JHS 1A,MONDAY,Period 1,LESSON,SCI,,kojo@example.test,,',
        'JHS 1B,MONDAY,Period 1,LESSON,SCI,,Kojo Owusu,,',
        // JHS 1A's English teacher is Kojo, so this clashes with nothing (different period).
        'JHS 1A,MONDAY,Period 2,LESSON,ENG,,,,',
      ),
    );
    expect(result.rows.map((row) => row.status)).toEqual(['ready', 'error', 'ready']);
    expect(result.rows[1]!.errors.join(' ')).toContain('already teaching');
  });

  it('flags a teacher already booked on the existing timetable', async () => {
    const { service } = createService([
      {
        id: 'e1', classId: 'class-b', teacherId: 't-ama', classroomId: null, type: 'LESSON',
        class: { name: 'JHS 1B' },
        timeSlot: { dayOfWeek: 'MONDAY', startTime: '08:00', endTime: '08:40' },
      },
    ]);
    const result = await service.preview(school, csv('JHS 1A,MONDAY,Period 1,LESSON,SCI,,ama@example.test,,'));
    expect(result.rows[0]).toMatchObject({ status: 'error' });
    expect(result.rows[0]!.errors.join(' ')).toContain('JHS 1B');
  });

  it('marks a period that already has a lesson as an update carrying the existing id', async () => {
    const { service } = createService([
      {
        id: 'e-old', classId: 'class-a', teacherId: 't-kojo', classroomId: null, type: 'LESSON',
        class: { name: 'JHS 1A' },
        timeSlot: { dayOfWeek: 'MONDAY', startTime: '08:00', endTime: '08:40' },
      },
    ]);
    const result = await service.preview(school, csv('JHS 1A,MONDAY,Period 1,LESSON,SCI,,ama@example.test,,'));
    expect(result.rows[0]).toMatchObject({ status: 'update', existingId: 'e-old' });
    expect(result.summary).toMatchObject({ ready: 0, update: 1 });
  });

  it('refuses a file without the required columns', async () => {
    const { service } = createService();
    await expect(
      service.preview(school, { buffer: Buffer.from('class,subject\nJHS 1A,SCI'), originalname: 'x.csv' }),
    ).rejects.toThrow(/Missing required columns: day, period/);
  });
});

describe('TimetableImportService importBatch', () => {
  const row = { classId: 'class-a', dayOfWeek: 'MONDAY', periodId: 'p1', type: 'LESSON', subjectId: 'sci' } as const;

  it('saves each row through the timetable service and reports created, updated and failed', async () => {
    const { service, saveEntry } = createService();
    saveEntry
      .mockResolvedValueOnce({ id: 'a' })
      .mockResolvedValueOnce({ id: 'b' })
      .mockRejectedValueOnce(new ConflictException('That teacher is already teaching JHS 1B in that period.'));
    const { results } = await service.importBatch(school, {
      academicYearId: 'year-1',
      rows: [
        { rowNumber: 2, name: 'one', row: { ...row } },
        { rowNumber: 3, name: 'two', existingId: 'e-old', row: { ...row } },
        { rowNumber: 4, row: { ...row } },
      ],
    });
    expect(results).toEqual([
      { rowNumber: 2, name: 'one', status: 'created' },
      { rowNumber: 3, name: 'two', status: 'updated' },
      { rowNumber: 4, name: 'Row 4', status: 'failed', message: 'That teacher is already teaching JHS 1B in that period.' },
    ]);
    expect(saveEntry).toHaveBeenNthCalledWith(2, 'school-1', row, { academicYearId: 'year-1', entryId: 'e-old' });
    expect(saveEntry).toHaveBeenNthCalledWith(1, 'school-1', row, { academicYearId: 'year-1' });
  });

  it('keeps going when one row throws something unexpected', async () => {
    const { service, saveEntry } = createService();
    saveEntry.mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce({ id: 'b' });
    const { results } = await service.importBatch(school, {
      rows: [{ rowNumber: 2, row: { ...row } }, { rowNumber: 3, row: { ...row } }],
    });
    expect(results.map((r) => r.status)).toEqual(['failed', 'created']);
    expect(results[0]!.message).toBe('This row could not be saved.');
  });

  it('refuses a batch larger than the shared limit', async () => {
    const { service } = createService();
    const rows = Array.from({ length: 26 }, (_, index) => ({ rowNumber: index + 2, row: { ...row } }));
    await expect(service.importBatch(school, { rows })).rejects.toThrow(/between 1 and 25/);
  });
});
