import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { School } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { MessagesService } from "./messages.service.js";

function buildService() {
  const client = {
    member: { findMany: vi.fn().mockResolvedValue([]) },
    student: { findMany: vi.fn().mockResolvedValue([]) },
    schoolMessage: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: "message-1",
        subject: "Class update",
        body: "Please see the attached update.",
        sender: { id: "teacher-user", name: "Teacher A", email: "teacher@example.test" },
        recipients: [],
      }),
    },
    schoolMessageRecipient: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    notification: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    $transaction: vi.fn(),
  };
  const tx = { schoolMessage: client.schoolMessage, notification: client.notification };
  client.$transaction.mockImplementation(async (callback: (transaction: typeof tx) => unknown) => callback(tx));
  const teacherScope = {
    getTaughtClassIds: vi.fn().mockResolvedValue(["class-a"]),
  };
  const service = new MessagesService({ client } as never, teacherScope as never);
  return { service, client, teacherScope };
}

const school = { id: "school-a", organizationId: "org-a" } as School;
const sender = { id: "teacher-user", name: "Teacher A", email: "teacher@example.test" } as AuthenticatedUser;

describe("MessagesService school and recipient guards", () => {
  it("validates subject, body and recipients before querying or sending", async () => {
    const { service, client } = buildService();

    await expect(service.send(school, sender, "teacher", {
      recipientIds: [],
      subject: "",
      body: "",
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(client.member.findMany).not.toHaveBeenCalled();
    expect(client.schoolMessage.create).not.toHaveBeenCalled();
  });

  it("rejects recipients who are not permitted active members of this school", async () => {
    const { service, client } = buildService();

    await expect(service.send(school, sender, "owner", {
      recipientIds: ["user-from-another-school"],
      subject: "School update",
      body: "Please read the update.",
    })).rejects.toBeInstanceOf(ForbiddenException);

    expect(client.member.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: "org-a",
        banned: false,
        userId: { in: ["user-from-another-school"] },
      }),
    }));
    expect(client.schoolMessage.create).not.toHaveBeenCalled();
  });

  it("restricts inbox reads to the active school and current user", async () => {
    const { service, client } = buildService();

    await service.listMessages("school-a", "user-a", "inbox");

    expect(client.schoolMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        schoolId: "school-a",
        recipients: { some: { recipientId: "user-a" } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }));
  });

  it("limits a teacher's student and guardian targets to current classes they teach", async () => {
    const { service, client, teacherScope } = buildService();
    client.student.findMany.mockResolvedValue([{
      profile: { userId: "student-user" },
      guardians: [{ guardian: { profile: { userId: "guardian-user" } } }],
    }]);

    await service.listRecipients("school-a", "org-a", "teacher-user", "teacher", "");

    expect(teacherScope.getTaughtClassIds).toHaveBeenCalledWith("school-a", "teacher-user");
    expect(client.student.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        schoolId: "school-a",
        status: "ACTIVE",
        deletedAt: null,
      }),
    }));
    expect(client.member.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: "org-a",
        banned: false,
        OR: expect.arrayContaining([
          { userId: { in: ["student-user", "guardian-user"] } },
        ]),
      }),
    }));
  });
});
