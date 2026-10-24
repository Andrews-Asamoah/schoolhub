import { Injectable, NotFoundException } from "@nestjs/common";
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