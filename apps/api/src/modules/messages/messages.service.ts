import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { School } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { TeacherScopeService } from "../../common/scope/teacher-scope.service.js";

const ALL_ROLES = ["owner", "admin", "headteacher", "teacher", "accountant", "staff", "student", "guardian"];
const RECIPIENT_ROLES: Record<string, string[]> = {
  owner: ALL_ROLES,
  admin: ALL_ROLES,
  headteacher: ALL_ROLES,
  teacher: ["owner", "admin", "headteacher", "teacher", "accountant", "staff"],
  accountant: ["owner", "admin", "headteacher", "accountant", "staff", "guardian"],
  staff: ["owner", "admin", "headteacher", "teacher", "accountant", "staff"],
  guardian: ["owner", "admin", "headteacher", "teacher", "accountant", "staff"],
  student: ["owner", "admin", "headteacher", "teacher"],
};

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teacherScope: TeacherScopeService,
  ) {}

  async listRecipients(schoolId: string, organizationId: string, userId: string, role: string, search: string) {
    const allowedRoles = RECIPIENT_ROLES[role] ?? [];
    if (!allowedRoles.length) return [];
    const term = search.trim().slice(0, 100);
    const teacherTargets = role === "teacher" ? await this.getTeacherStudentAndGuardianIds(schoolId, userId) : [];
    const roleConditions = [
      { role: { in: allowedRoles } },
      { roles: { hasSome: allowedRoles } },
      ...(teacherTargets.length ? [{ userId: { in: teacherTargets } }] : []),
    ];
    const members = await this.prisma.client.member.findMany({
      where: {
        organizationId,
        banned: false,
        userId: { not: userId },
        OR: roleConditions,
        ...(term ? {
          user: { OR: [
            { name: { contains: term, mode: "insensitive" } },
            { email: { contains: term, mode: "insensitive" } },
          ] },
        } : {}),
      },
      select: {
        userId: true,
        role: true,
        roles: true,
        user: { select: { id: true, name: true, email: true, image: true } },
      },
      orderBy: { user: { name: "asc" } },
      take: 200,
    });
    return members.map(({ userId: id, role: primaryRole, roles, user }) => ({
      ...user,
      id,
      role: primaryRole,
      roles,
    }));
  }

  /**
   * Teachers may message school leadership and colleagues, but personal
   * student/guardian contacts are limited to current classes they teach.
   */
  private async getTeacherStudentAndGuardianIds(schoolId: string, userId: string) {
    const classIds = await this.teacherScope.getTaughtClassIds(schoolId, userId);
    if (!classIds.length) return [];
    const students = await this.prisma.client.student.findMany({
      where: {
        schoolId,
        deletedAt: null,
        status: "ACTIVE",
        OR: [
          { classId: { in: classIds } },
          { enrollments: { some: { classId: { in: classIds }, status: "ACTIVE" } } },
        ],
      },
      select: {
        profile: { select: { userId: true } },
        guardians: {
          where: {
            guardian: {
              schoolId,
              isActive: true,
              deletedAt: null,
              canLogin: true,
            },
          },
          select: {
            guardian: { select: { profile: { select: { userId: true } } } },
          },
        },
      },
    });
    const ids = new Set<string>();
    for (const student of students) {
      ids.add(student.profile.userId);
      for (const link of student.guardians) {
        const guardianUserId = link.guardian.profile?.userId;
        if (guardianUserId) ids.add(guardianUserId);
      }
    }
    return [...ids];
  }

  async listMessages(schoolId: string, userId: string, folder: "inbox" | "sent") {
    return this.prisma.client.schoolMessage.findMany({
      where: folder === "sent"
        ? { schoolId, senderId: userId }
        : { schoolId, recipients: { some: { recipientId: userId } } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        sender: { select: { id: true, name: true, email: true, image: true } },
        recipients: folder === "sent"
          ? { include: { recipient: { select: { id: true, name: true, email: true } } } }
          : { where: { recipientId: userId }, select: { id: true, recipientId: true, isRead: true, readAt: true } },
      },
    });
  }

  async send(
    school: School,
    sender: AuthenticatedUser,
    role: string,
    input: { recipientIds?: unknown; subject?: unknown; body?: unknown },
  ) {
    const subject = typeof input.subject === "string" ? input.subject.trim() : "";
    const body = typeof input.body === "string" ? input.body.trim() : "";
    if (subject.length < 2 || subject.length > 160) {
      throw new BadRequestException("Subject must contain 2–160 characters.");
    }
    if (!body.length || body.length > 10_000) {
      throw new BadRequestException("Message must contain 1–10,000 characters.");
    }
    if (!Array.isArray(input.recipientIds) || input.recipientIds.length < 1 || input.recipientIds.length > 25) {
      throw new BadRequestException("Choose between 1 and 25 recipients.");
    }
    if (!input.recipientIds.every((id): id is string => typeof id === "string" && id.trim().length > 0)) {
      throw new BadRequestException("Recipient IDs are invalid.");
    }
    const recipientIds = [...new Set(input.recipientIds.map((id) => id.trim()))];
    if (recipientIds.includes(sender.id)) {
      throw new BadRequestException("You cannot send a message to yourself.");
    }

    const allowedRoles = RECIPIENT_ROLES[role] ?? [];
    if (!allowedRoles.length) throw new ForbiddenException("Your role cannot send messages.");
    const teacherTargets = role === "teacher" ? await this.getTeacherStudentAndGuardianIds(school.id, sender.id) : [];
    const membershipConditions = [
      { role: { in: allowedRoles } },
      { roles: { hasSome: allowedRoles } },
      ...(teacherTargets.length ? [{ userId: { in: teacherTargets } }] : []),
    ];
    const memberships = await this.prisma.client.member.findMany({
      where: {
        organizationId: school.organizationId,
        banned: false,
        userId: { in: recipientIds },
        OR: membershipConditions,
      },
      select: { userId: true },
    });
    const validIds = new Set(memberships.map((item) => item.userId));
    if (recipientIds.some((id) => !validIds.has(id))) {
      throw new ForbiddenException("Every recipient must be an active, permitted member of this school.");
    }

    return this.prisma.client.$transaction(async (tx) => {
      const message = await tx.schoolMessage.create({
        data: {
          schoolId: school.id,
          senderId: sender.id,
          subject,
          body,
          recipients: { create: recipientIds.map((recipientId) => ({ recipientId })) },
        },
        include: {
          sender: { select: { id: true, name: true, email: true, image: true } },
          recipients: { include: { recipient: { select: { id: true, name: true, email: true } } } },
        },
      });
      await tx.notification.createMany({
        data: recipientIds.map((userId) => ({
          schoolId: school.id,
          userId,
          type: "GENERAL" as const,
          title: `New message from ${message.sender.name}`,
          message: subject,
          link: "/messages",
        })),
      });
      return message;
    });
  }

  async markRead(schoolId: string, userId: string, messageId: string) {
    const message = await this.prisma.client.schoolMessage.findFirst({
      where: { id: messageId, schoolId, recipients: { some: { recipientId: userId } } },
      select: { id: true },
    });
    if (!message) throw new NotFoundException("Message not found.");
    await this.prisma.client.schoolMessageRecipient.updateMany({
      where: { messageId: message.id, recipientId: userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { success: true };
  }
}
