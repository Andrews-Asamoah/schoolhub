import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  CreateAnnouncementInput,
  UpdateAnnouncementPinInput,
  UpdateAnnouncementStatusInput,
} from '@schoolhub/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TeacherScopeService } from '../../common/scope/teacher-scope.service.js';

const managerRoles = new Set(['owner', 'admin', 'headteacher']);
const classTargets = new Set(['SELECTED_CLASSES', 'SELECTED_CLASS_GUARDIANS']);
const debtorBillStatuses = ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] as const;

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teacherScope: TeacherScopeService,
  ) {}

  async listClasses(schoolId: string, role?: string, userId?: string) {
    let classScope: string[] | null = null;
    if (role === 'teacher') {
      classScope = userId
        ? await this.teacherScope.getTaughtClassIds(schoolId, userId)
        : [];
    } else if (!managerRoles.has(role ?? '')) {
      throw new ForbiddenException(
        'You are not allowed to choose announcement classes.',
      );
    }
    const currentYear = await this.prisma.client.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      select: { id: true },
    });
    return this.prisma.client.class.findMany({
      where: {
        schoolId,
        deletedAt: null,
        isActive: true,
        ...(classScope ? { id: { in: classScope } } : {}),
        ...(currentYear
          ? {
              OR: [
                { academicYearId: currentYear.id },
                { academicYearId: null },
              ],
            }
          : {}),
      },
      select: { id: true, name: true, level: true },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    });
  }

  async list(schoolId: string, role?: string, userId?: string) {
    const canManage = managerRoles.has(role ?? '');
    const where: Prisma.AnnouncementWhereInput = { schoolId };
    if (!canManage) {
      where.OR = [
        ...(userId ? [{ authorId: userId }] : []),
        {
          status: 'PUBLISHED',
          AND: [
            { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          ],
        },
      ];
    }
    const announcements = await this.prisma.client.announcement.findMany({
      where,
      include: { author: { select: { id: true, name: true } } },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      take: canManage ? 200 : 100,
    });
    if (canManage) return announcements;

    const [
      studentClassIds,
      guardianClassIds,
      hasOutstandingWard,
      taughtClassIds,
    ] = await Promise.all([
      role === 'student' && userId
        ? this.getUserStudentClassIds(schoolId, userId)
        : Promise.resolve([] as string[]),
      role === 'guardian' && userId
        ? this.getUserGuardianClassIds(schoolId, userId)
        : Promise.resolve([] as string[]),
      role === 'guardian' && userId
        ? this.guardianHasOutstandingWard(schoolId, userId)
        : Promise.resolve(false),
      role === 'teacher' && userId
        ? this.teacherScope.getTaughtClassIds(schoolId, userId)
        : Promise.resolve([] as string[]),
    ]);
    return announcements.filter((item) => {
      if (userId && item.authorId === userId) return true;
      if (!this.isPublishedAndCurrent(item.status, item.expiresAt))
        return false;
      return this.isVisibleToUser(
        item.target,
        item.targetClassIds ?? [],
        role,
        studentClassIds,
        guardianClassIds,
        hasOutstandingWard,
        taughtClassIds,
      );
    });
  }

  async create(
    schoolId: string,
    authorId: string,
    role: string,
    input: CreateAnnouncementInput,
  ) {
    this.assertCreatePermission(role, input);
    await this.validateClassTargets(schoolId, authorId, role, input);
    return this.prisma.client.$transaction(async (tx) => {
      const announcement = await tx.announcement.create({
        data: {
          schoolId,
          authorId,
          title: input.title,
          content: input.content,
          category: input.category,
          target: input.target,
          targetClassIds: input.classIds,
          isPinned: managerRoles.has(role) ? input.isPinned : false,
          status: managerRoles.has(role) ? input.status : 'PUBLISHED',
          messageType: 'ANNOUNCEMENT',
        },
        include: { author: { select: { id: true, name: true } } },
      });
      if (announcement.status === 'PUBLISHED') {
        await this.notifyAudience(
          schoolId,
          authorId,
          announcement.id,
          announcement.title,
          announcement.content,
          announcement.target,
          announcement.targetClassIds,
          tx,
        );
      }
      return announcement;
    });
  }

  async updatePin(
    schoolId: string,
    id: string,
    input: UpdateAnnouncementPinInput,
  ) {
    const existing = await this.findSchoolAnnouncement(schoolId, id);
    return this.prisma.client.announcement.update({
      where: { id: existing.id },
      data: { isPinned: input.isPinned },
      include: { author: { select: { id: true, name: true } } },
    });
  }

  async updateStatus(
    schoolId: string,
    id: string,
    input: UpdateAnnouncementStatusInput,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}), hashtext(${id}))`;
      const existing = await tx.announcement.findFirst({
        where: { id, schoolId },
        select: {
          id: true,
          authorId: true,
          title: true,
          content: true,
          target: true,
          targetClassIds: true,
          status: true,
        },
      });
      if (!existing) throw new NotFoundException('Announcement not found');
      const updated = await tx.announcement.update({
        where: { id: existing.id },
        data: { status: input.status },
        include: { author: { select: { id: true, name: true } } },
      });
      if (existing.status !== 'PUBLISHED' && updated.status === 'PUBLISHED') {
        await this.notifyAudience(
          schoolId,
          existing.authorId,
          existing.id,
          existing.title,
          existing.content,
          existing.target,
          existing.targetClassIds,
          tx,
        );
      }
      return updated;
    });
  }

  async remove(schoolId: string, id: string) {
    const existing = await this.findSchoolAnnouncement(schoolId, id);
    await this.prisma.client.announcement.delete({
      where: { id: existing.id },
    });
    return { success: true };
  }

  private assertCreatePermission(role: string, input: CreateAnnouncementInput) {
    if (managerRoles.has(role)) return;
    if (role === 'teacher' && classTargets.has(input.target)) return;
    if (role === 'accountant' && input.target === 'OUTSTANDING_FEE_GUARDIANS')
      return;
    throw new ForbiddenException(
      'Your role is not allowed to publish to this audience.',
    );
  }

  private async validateClassTargets(
    schoolId: string,
    userId: string,
    role: string,
    input: CreateAnnouncementInput,
  ) {
    if (!classTargets.has(input.target)) {
      if (input.classIds.length)
        throw new BadRequestException(
          'Choose class IDs only for a class-specific audience.',
        );
      return;
    }
    if (!input.classIds.length)
      throw new BadRequestException(
        'Select at least one class for this audience.',
      );
    const allowedIds = (await this.listClasses(schoolId, role, userId)).map(
      (item) => item.id,
    );
    const allowed = new Set(allowedIds);
    if ([...new Set(input.classIds)].some((id) => !allowed.has(id))) {
      throw new ForbiddenException(
        'One or more selected classes are outside your school or teaching assignment.',
      );
    }
  }

  private async findSchoolAnnouncement(schoolId: string, id: string) {
    const item = await this.prisma.client.announcement.findFirst({
      where: { id, schoolId },
      select: { id: true },
    });
    if (!item) throw new NotFoundException('Announcement not found');
    return item;
  }

  private isPublishedAndCurrent(status: string, expiresAt: Date | null) {
    return (
      status === 'PUBLISHED' && (!expiresAt || expiresAt.getTime() > Date.now())
    );
  }

  private async getUserStudentClassIds(schoolId: string, userId: string) {
    const student = await this.prisma.client.student.findFirst({
      where: {
        schoolId,
        deletedAt: null,
        status: 'ACTIVE',
        profile: { userId },
      },
      select: {
        classId: true,
        enrollments: {
          where: {
            status: 'ACTIVE',
            academicYear: { isCurrent: true },
            term: { isCurrent: true },
          },
          orderBy: { enrolledAt: 'desc' },
          take: 1,
          select: { classId: true },
        },
      },
    });
    return [
      ...new Set(
        [student?.enrollments[0]?.classId, student?.classId].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    ];
  }

  private async getUserGuardianClassIds(schoolId: string, userId: string) {
    const guardian = await this.prisma.client.guardian.findFirst({
      where: { schoolId, deletedAt: null, profile: { userId } },
      select: {
        students: {
          where: { student: { schoolId, deletedAt: null, status: 'ACTIVE' } },
          select: {
            student: {
              select: {
                classId: true,
                enrollments: {
                  where: {
                    status: 'ACTIVE',
                    academicYear: { isCurrent: true },
                    term: { isCurrent: true },
                  },
                  orderBy: { enrolledAt: 'desc' },
                  take: 1,
                  select: { classId: true },
                },
              },
            },
          },
        },
      },
    });
    return [
      ...new Set(
        (guardian?.students ?? []).flatMap(({ student }) =>
          [student.enrollments[0]?.classId, student.classId].filter(
            (id): id is string => Boolean(id),
          ),
        ),
      ),
    ];
  }

  private async guardianHasOutstandingWard(schoolId: string, userId: string) {
    const guardian = await this.prisma.client.guardian.findFirst({
      where: {
        schoolId,
        deletedAt: null,
        isActive: true,
        profile: { is: { userId } },
        students: {
          some: {
            student: {
              schoolId,
              deletedAt: null,
              status: 'ACTIVE',
              bills: {
                some: {
                  schoolId,
                  balanceAmount: { gt: 0 },
                  status: { in: [...debtorBillStatuses] },
                },
              },
            },
          },
        },
      },
      select: { id: true },
    });
    return Boolean(guardian);
  }

  private isVisibleToUser(
    target: string,
    classIds: string[],
    role: string | undefined,
    studentClassIds: string[],
    guardianClassIds: string[],
    hasOutstandingWard: boolean,
    taughtClassIds: string[],
  ) {
    const normalized = target
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    if (
      ['ALL', 'SCHOOL_COMMUNITY', 'ENTIRE_SCHOOL_COMMUNITY'].includes(
        normalized,
      )
    )
      return true;
    if (role === 'student') {
      if (
        [
          'ALL_STUDENTS',
          'SCHOOL_HOUSES',
          'JHS_STUDENTS',
          'ALL_JHS_STUDENTS',
        ].includes(normalized)
      )
        return true;
      if (normalized === 'SELECTED_CLASSES')
        return classIds.some((id) => studentClassIds.includes(id));
    }
    if (role === 'guardian') {
      if (['PARENTS_GUARDIANS', 'ALL_PARENTS_GUARDIANS'].includes(normalized))
        return true;
      if (normalized === 'SELECTED_CLASS_GUARDIANS')
        return classIds.some((id) => guardianClassIds.includes(id));
      if (normalized === 'OUTSTANDING_FEE_GUARDIANS') return hasOutstandingWard;
    }
    if (role === 'teacher') {
      if (['TEACHERS', 'ALL_TEACHERS'].includes(normalized)) return true;
      if (['SELECTED_CLASSES', 'SELECTED_CLASS_GUARDIANS'].includes(normalized))
        return classIds.some((id) => taughtClassIds.includes(id));
    }
    return false;
  }

  private async notifyAudience(
    schoolId: string,
    authorId: string,
    announcementId: string,
    title: string,
    content: string,
    target: string,
    targetClassIds: string[],
    db: Prisma.TransactionClient,
  ) {
    const recipientIds = [
      ...new Set(
        await this.getRecipientUserIds(schoolId, target, targetClassIds, db),
      ),
    ].filter((id) => Boolean(id) && id !== authorId);
    if (!recipientIds.length) return;
    const link = '/announcements?announcementId=' + announcementId;
    const existing = await db.notification.findMany({
      where: { schoolId, type: 'ANNOUNCEMENT', link },
      select: { userId: true },
    });
    const alreadyNotified = new Set(existing.map((item) => item.userId));
    const newIds = recipientIds.filter((id) => !alreadyNotified.has(id));
    if (!newIds.length) return;
    await db.notification.createMany({
      data: newIds.map((userId) => ({
        schoolId,
        userId,
        type: 'ANNOUNCEMENT' as const,
        title,
        message: content.trim().slice(0, 500),
        link,
      })),
    });
  }

  private async getRecipientUserIds(
    schoolId: string,
    target: string,
    targetClassIds: string[],
    db: Prisma.TransactionClient,
  ) {
    const normalized = target.trim().toUpperCase();
    if (normalized === 'SCHOOL_COMMUNITY' || normalized === 'ALL') {
      const school = await db.school.findUnique({
        where: { id: schoolId },
        select: { organizationId: true },
      });
      if (!school) return [];
      const members = await db.member.findMany({
        where: { organizationId: school.organizationId, banned: false },
        select: { userId: true },
      });
      return members.map((item) => item.userId);
    }
    if (
      [
        'ALL_STUDENTS',
        'SCHOOL_HOUSES',
        'JHS_STUDENTS',
        'ALL_JHS_STUDENTS',
        'SELECTED_CLASSES',
      ].includes(normalized)
    ) {
      const students = await db.student.findMany({
        where: {
          schoolId,
          deletedAt: null,
          status: 'ACTIVE',
          ...(normalized === 'SELECTED_CLASSES'
            ? {
                OR: [
                  { classId: { in: targetClassIds } },
                  {
                    enrollments: {
                      some: {
                        classId: { in: targetClassIds },
                        status: 'ACTIVE',
                        academicYear: { isCurrent: true },
                        term: { isCurrent: true },
                      },
                    },
                  },
                ],
              }
            : {}),
        },
        select: {
          profile: { select: { userId: true } },
          class: { select: { level: true, name: true } },
        },
      });
      return students
        .filter(
          (item) =>
            (normalized !== 'JHS_STUDENTS' &&
              normalized !== 'ALL_JHS_STUDENTS') ||
            /\b(jhs\s*\d*|junior\s+high|basic\s*[789])\b/i.test(
              (item.class?.level ?? '') + ' ' + (item.class?.name ?? ''),
            ),
        )
        .map((item) => item.profile.userId);
    }
    if (
      [
        'PARENTS_GUARDIANS',
        'SELECTED_CLASS_GUARDIANS',
        'OUTSTANDING_FEE_GUARDIANS',
      ].includes(normalized)
    ) {
      const guardians = await db.guardian.findMany({
        where: {
          schoolId,
          deletedAt: null,
          isActive: true,
          canLogin: true,
          profile: { isNot: null },
          ...(normalized === 'SELECTED_CLASS_GUARDIANS'
            ? {
                students: {
                  some: {
                    student: {
                      schoolId,
                      deletedAt: null,
                      status: 'ACTIVE',
                      OR: [
                        { classId: { in: targetClassIds } },
                        {
                          enrollments: {
                            some: {
                              classId: { in: targetClassIds },
                              status: 'ACTIVE',
                              academicYear: { isCurrent: true },
                              term: { isCurrent: true },
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              }
            : {}),
          ...(normalized === 'OUTSTANDING_FEE_GUARDIANS'
            ? {
                students: {
                  some: {
                    student: {
                      schoolId,
                      deletedAt: null,
                      status: 'ACTIVE',
                      bills: {
                        some: {
                          schoolId,
                          balanceAmount: { gt: 0 },
                          status: { in: [...debtorBillStatuses] },
                        },
                      },
                    },
                  },
                },
              }
            : {}),
        },
        select: { profile: { select: { userId: true } } },
      });
      return guardians.flatMap((item) =>
        item.profile?.userId ? [item.profile.userId] : [],
      );
    }
    if (['TEACHERS', 'ALL_TEACHERS'].includes(normalized)) {
      const teachers = await db.teacher.findMany({
        where: {
          schoolId,
          deletedAt: null,
          isActive: true,
          profile: { isNot: null },
        },
        select: { profile: { select: { userId: true } } },
      });
      return teachers.flatMap((item) =>
        item.profile?.userId ? [item.profile.userId] : [],
      );
    }
    return [];
  }
}
