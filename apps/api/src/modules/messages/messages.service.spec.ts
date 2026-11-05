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

it("pages all 250 owned messages stably, including equal timestamps", async () => {
  const { service, client } = buildService();
  Object.assign(client.schoolMessageRecipient, { count: vi.fn().mockResolvedValue(250) });
  const rows = Array.from({ length: 250 }, (_, index) => ({ id: String(250-index).padStart(4,"0"), createdAt: new Date("2026-11-01T12:00:00Z"), recipients: [] }));
  client.schoolMessage.findMany.mockImplementation(async (query: { where: { schoolId: string; recipients: unknown; AND: Array<{ OR: Array<{ id?: { lt: string } }> }> }; take: number }) => {
    expect(query.where.schoolId).toBe("school-a");
    expect(query.where.recipients).toEqual({ some: { recipientId: "user-a" } });
    const cursor = query.where.AND.at(-1)?.OR.at(-1)?.id?.lt;
    return rows.filter(row => !cursor || row.id < cursor).slice(0,query.take) as never;
  });
  const ids: string[] = []; let cursor: string | undefined;
  do {
    const page = await service.listMessagePage("school-a", "user-a", "inbox", { cursor, limit: "30" });
    ids.push(...page.items.map(row => row.id)); cursor = page.nextCursor ?? undefined;
    expect(page.unreadCount).toBe(250);
  } while(cursor);
  expect(ids).toHaveLength(250);expect(new Set(ids).size).toBe(250);
  await expect(service.listMessagePage("school-a", "user-a", "inbox", { cursor:"invalid" })).rejects.toBeInstanceOf(BadRequestException);
  await expect(service.listMessagePage("school-a", "user-a", "inbox", { limit:"10000" })).rejects.toBeInstanceOf(BadRequestException);
});
