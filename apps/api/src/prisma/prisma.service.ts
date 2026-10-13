import { Injectable, type OnModuleInit, type OnModuleDestroy } from "@nestjs/common";
import { prisma } from "./prisma.client.js";

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client = prisma;

  async onModuleInit() {
    await prisma.$connect();
  }

  async onModuleDestroy() {
    await prisma.$disconnect();
  }
}
