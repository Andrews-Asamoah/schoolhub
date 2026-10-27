import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { NotificationsService } from "./notifications.service.js";

function buildService() {
  const client = {
    notification: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValueOnce(12).mockResolvedValueOnce(4),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };
  return { service: new NotificationsService({ client } as never), client };
}

describe("NotificationsService history", () => {
  it("applies school/user, read state, search and pagination to history queries", async () => {
    const { service, client } = buildService();

    const result = await service.listHistory("school-a", "user-a", {
      search: " fee reminder ",
      status: "UNREAD",
      page: "2",
      limit: "10",
    });

    expect(client.notification.findMany).toHaveBeenCalledWith({
      where: {
        schoolId: "school-a",
        userId: "user-a",
        isRead: false,
        OR: [
          { title: { contains: "fee reminder", mode: "insensitive" } },
          { message: { contains: "fee reminder", mode: "insensitive" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      skip: 10,
      take: 10,
    });
    expect(result).toEqual({
      items: [],
      total: 12,
      unreadCount: 4,
      page: 2,
      limit: 10,
      totalPages: 2,
    });
  });

  it("does not allow a user to mark another user's notification as read", async () => {
    const { service, client } = buildService();

    await expect(service.markRead("school-a", "user-a", "notification-from-user-b"))
      .rejects.toBeInstanceOf(NotFoundException);

    expect(client.notification.updateMany).toHaveBeenCalledWith({
      where: { id: "notification-from-user-b", schoolId: "school-a", userId: "user-a", isRead: false },
      data: { isRead: true },
    });
    expect(client.notification.findFirst).toHaveBeenCalledWith({
      where: { id: "notification-from-user-b", schoolId: "school-a", userId: "user-a" },
      select: { id: true },
    });
  });
});
