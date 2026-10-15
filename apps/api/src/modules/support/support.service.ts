import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import type {
  CreateSupportTicketInput,
  SupportTicketReplyInput,
  UpdateSupportTicketInput,
} from "@schoolhub/shared";

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  listSchoolTickets(schoolId: string) {
    return this.prisma.client.supportTicket.findMany({
      where: { schoolId, isInternal: false },
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: {
        submittedBy: { select: { id: true, name: true, email: true } },
        _count: { select: { replies: true } },
      },
    });
  }

  listPlatformTickets() {
    return this.prisma.client.supportTicket.findMany({
      orderBy: { updatedAt: "desc" },
      take: 200,
      include: {
        school: { select: { id: true, name: true, code: true } },
        submittedBy: { select: { id: true, name: true, email: true } },
        _count: { select: { replies: true } },
      },
    });
  }

  async getSchoolTicket(schoolId: string, ticketId: string) {
    const ticket = await this.prisma.client.supportTicket.findFirst({
      where: { id: ticketId, schoolId, isInternal: false },
      include: {
        submittedBy: { select: { id: true, name: true, email: true } },
        replies: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { id: true, name: true, role: true } } },
        },
      },
    });
    if (!ticket) throw new NotFoundException("Support ticket not found");
    return ticket;
  }

  async getPlatformTicket(ticketId: string) {
    const ticket = await this.prisma.client.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        school: { select: { id: true, name: true, code: true } },
        submittedBy: { select: { id: true, name: true, email: true } },
        replies: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { id: true, name: true, role: true } } },
        },
      },
    });
    if (!ticket) throw new NotFoundException("Support ticket not found");
    return ticket;
  }

  createTicket(
    schoolId: string,
    submittedById: string,
    input: CreateSupportTicketInput,
  ) {
    return this.prisma.client.supportTicket.create({
      data: {
        schoolId,
        submittedById,
        subject: input.subject,
        description: input.description,
        category: input.category,
        priority: input.priority,
      },
      include: {
        submittedBy: { select: { id: true, name: true, email: true } },
        _count: { select: { replies: true } },
      },
    });
  }

  async replyToSchoolTicket(
    schoolId: string,
    ticketId: string,
    authorId: string,
    input: SupportTicketReplyInput,
  ) {
    await this.getSchoolTicket(schoolId, ticketId);
    await this.createReply(ticketId, authorId, input.message);
    return this.getSchoolTicket(schoolId, ticketId);
  }

  async replyToPlatformTicket(
    ticketId: string,
    authorId: string,
    input: SupportTicketReplyInput,
  ) {
    await this.getPlatformTicket(ticketId);
    await this.createReply(ticketId, authorId, input.message);
    return this.getPlatformTicket(ticketId);
  }

  async updateSchoolTicket(
    schoolId: string,
    ticketId: string,
    actorId: string,
    input: UpdateSupportTicketInput,
  ) {
    const ticket = await this.getSchoolTicket(schoolId, ticketId);
    if (
      input.status !== "CLOSED" ||
      ticket.status !== "RESOLVED" ||
      input.priority !== undefined
    ) {
      throw new BadRequestException(
        "School administrators can only close a ticket after support has resolved it.",
      );
    }
    await this.updateTicket(ticketId, actorId, input);
    return this.getSchoolTicket(schoolId, ticketId);
  }

  async updatePlatformTicket(
    ticketId: string,
    actorId: string,
    input: UpdateSupportTicketInput,
  ) {
    await this.getPlatformTicket(ticketId);
    await this.updateTicket(ticketId, actorId, input);
    return this.getPlatformTicket(ticketId);
  }

  private async createReply(ticketId: string, authorId: string, message: string) {
    const ticket = await this.prisma.client.supportTicket.findUniqueOrThrow({
      where: { id: ticketId },
      select: { status: true },
    });
    if (ticket.status === "CLOSED") {
      throw new BadRequestException("This ticket is closed and cannot receive replies.");
    }

    await this.prisma.client.$transaction([
      this.prisma.client.ticketReply.create({
        data: { ticketId, authorId, message },
      }),
      this.prisma.client.supportTicket.update({
        where: { id: ticketId },
        data: { updatedAt: new Date() },
      }),
    ]);
  }

  private async updateTicket(
    ticketId: string,
    actorId: string,
    input: UpdateSupportTicketInput,
  ) {
    const current = await this.prisma.client.supportTicket.findUniqueOrThrow({
      where: { id: ticketId },
      select: { status: true, priority: true },
    });
    const changes: string[] = [];
    if (input.status !== current.status) {
      changes.push(
        `Status changed from ${this.label(current.status)} to ${this.label(input.status)}.`,
      );
    }
    if (input.priority && input.priority !== current.priority) {
      changes.push(
        `Priority changed from ${this.label(current.priority)} to ${this.label(input.priority)}.`,
      );
    }

    await this.prisma.client.$transaction(async (transaction) => {
      await transaction.supportTicket.update({
        where: { id: ticketId },
        data: {
          status: input.status,
          ...(input.priority ? { priority: input.priority } : {}),
        },
      });
      if (changes.length) {
        await transaction.ticketReply.create({
          data: {
            ticketId,
            authorId: actorId,
            message: changes.join(" "),
          },
        });
      }
    });
  }

  private label(value: string) {
    return value
      .toLowerCase()
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
}
