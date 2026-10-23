import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { CreateAnnouncementInput, UpdateAnnouncementPinInput, UpdateAnnouncementStatusInput } from "@schoolhub/shared";
import { PrismaService } from "../../prisma/prisma.service.js";

const managerRoles = new Set(["owner", "admin", "headmistress"]);

@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(schoolId: string, role?: string, userId?: string) {
    const canManage = managerRoles.has(role ?? "");
    const where: Prisma.AnnouncementWhereInput = { schoolId };

    if (!canManage) {
      where.status = "PUBLISHED";
      where.OR = [{ expiresAt: null }, { expiresAt: { gt: new Date() } }];
    }

    const announcements = await this.prisma.client.announcement.findMany({
      where,
      include: { author: { select: { id: true, name: true } } },
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      take: canManage ? 200 : 100,
    });

    if (canManage) return announcements;

    const studentClassLabel =
      role === "student" && userId
        ? await this.getStudentClassLabel(schoolId, userId)
        : null;

    return announcements.filter((announcement) =>
      this.isVisibleToRole(announcement.target, role, studentClassLabel),
    );
  }

  create(schoolId: string, authorId: string, input: CreateAnnouncementInput) {
    return this.prisma.client.announcement.create({
      data: {
        schoolId,
        authorId,
        title: input.title,
        content: input.content,
        category: input.category,
        target: input.target,
        isPinned: input.isPinned,
        status: input.status,
        messageType: "ANNOUNCEMENT",
      },
      include: { author: { select: { id: true, name: true } } },
    });
  }

  async updatePin(schoolId: string, id: string, input: UpdateAnnouncementPinInput) {
    const existing = await this.findSchoolAnnouncement(schoolId, id);
    return this.prisma.client.announcement.update({
      where: { id: existing.id },
      data: { isPinned: input.isPinned },
      include: { author: { select: { id: true, name: true } } },
    });
  }

  async updateStatus(schoolId: string, id: string, input: UpdateAnnouncementStatusInput) {
    const existing = await this.findSchoolAnnouncement(schoolId, id);
    return this.prisma.client.announcement.update({
      where: { id: existing.id },
      data: { status: input.status },
      include: { author: { select: { id: true, name: true } } },
    });
  }

  async remove(schoolId: string, id: string) {
    const existing = await this.findSchoolAnnouncement(schoolId, id);
    await this.prisma.client.announcement.delete({ where: { id: existing.id } });
    return { success: true };
  }

  private async findSchoolAnnouncement(schoolId: string, id: string) {
    const announcement = await this.prisma.client.announcement.findFirst({
      where: { id, schoolId },
      select: { id: true },
    });
    if (!announcement) throw new NotFoundException("Announcement not found");
    return announcement;
  }

  private async getStudentClassLabel(schoolId: string, userId: string) {
    const student = await this.prisma.client.student.findFirst({
      where: { schoolId, profile: { userId } },
      select: {
        class: { select: { level: true, name: true } },
        enrollments: {
          where: {
            status: "ACTIVE",
            academicYear: { isCurrent: true },
            term: { isCurrent: true },
          },
          orderBy: { enrolledAt: "desc" },
          take: 1,
          select: { class: { select: { level: true, name: true } } },
        },
      },
    });
    const currentClass = student?.enrollments[0]?.class ?? student?.class;
    return currentClass ? `${currentClass.level} ${currentClass.name}` : null;
  }

  private isVisibleToRole(target: string, role?: string, studentClassLabel?: string | null) {
    const normalized = target.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (["all", "school_community", "entire_school_community"].includes(normalized)) {
      return true;
    }
    if (["all_jhs_students", "jhs_students"].includes(normalized)) {
      return role === "student" && /\b(jhs|junior\s+high|basic\s*[789])\b/i.test(studentClassLabel ?? "");
    }
    if (role === "student") {
      return [
        "all_students",
        "interested_students",
        "all_school_houses",
        "school_houses",
      ].includes(normalized);
    }
    if (role === "guardian") {
      return ["all_parents_guardians", "parents_guardians"].includes(normalized);
    }
    if (role === "teacher") {
      return ["all_teachers", "teachers"].includes(normalized);
    }
    return false;
  }
}
