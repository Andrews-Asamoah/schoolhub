import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(schoolId: string, userId: string) {
    const where = { schoolId, userId };
    const [items, unreadCount] = await Promise.all([
      this.prisma.client.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: 30 }),
      this.prisma.client.notification.count({ where: { ...where, isRead: false } }),
    ]);
    return { items, unreadCount };
  }

  async listHistory(
    schoolId: string,
    userId: string,
    options: { search?: string; status?: string; page?: string; limit?: string },
  ) {
    const status = ["ALL", "READ", "UNREAD"].includes((options.status ?? "ALL").toUpperCase())
      ? (options.status ?? "ALL").toUpperCase()
      : "ALL";
    const page = Math.max(1, Number.parseInt(options.page ?? "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(options.limit ?? "25", 10) || 25));
    const search = (options.search ?? "").trim().slice(0, 100);
    const where = {
      schoolId,
      userId,
      ...(status === "READ" ? { isRead: true } : status === "UNREAD" ? { isRead: false } : {}),
      ...(search ? {
        OR: [
          { title: { contains: search, mode: "insensitive" as const } },
          { message: { contains: search, mode: "insensitive" as const } },
        ],
      } : {}),
    };
    const [items, total, unreadCount] = await Promise.all([
      this.prisma.client.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.client.notification.count({ where }),
      this.prisma.client.notification.count({ where: { schoolId, userId, isRead: false } }),
    ]);
    return { items, total, unreadCount, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  async markRead(schoolId: string, userId: string, id: string) {
    const result = await this.prisma.client.notification.updateMany({
      where: { id, schoolId, userId, isRead: false },
      data: { isRead: true },
    });
    if (!result.count) {
      const exists = await this.prisma.client.notification.findFirst({ where: { id, schoolId, userId }, select: { id: true } });
      if (!exists) throw new NotFoundException("Notification not found");
    }
    return { success: true };
  }

  async markAllRead(schoolId: string, userId: string) {
    const result = await this.prisma.client.notification.updateMany({
      where: { schoolId, userId, isRead: false },
      data: { isRead: true },
    });
    return { success: true, updatedCount: result.count };
  }
}