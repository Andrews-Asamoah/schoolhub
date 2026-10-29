import { Injectable, Logger, ConflictException, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { createHash } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service.js";
import { DurableJobsService } from "../../common/jobs/durable-jobs.service.js";
import { PrivateStorageService } from "./private-storage.service.js";
import type { Prisma } from "@prisma/client";

@Injectable()
export class StorageCleanupService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(StorageCleanupService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(private readonly prisma: PrismaService, private readonly jobs: DurableJobsService, private readonly storage: PrivateStorageService) {}

  private id(key: string) { return `storage-delete:${createHash("sha256").update(key).digest("hex")}`; }

  async reserve(schoolId: string, key: string) {
    this.storage.assertOwned(schoolId, key);
    const id = this.id(key);
    await this.prisma.client.backgroundJob.create({ data: { id, kind: "storage-delete", schoolId, payload: { schoolId, key },
      nextAttempt: new Date(Date.now() + 24 * 3600_000) } });
    return id;
  }

  async keep(id: string, db: Pick<Prisma.TransactionClient, "backgroundJob">) {
    const kept = await db.backgroundJob.deleteMany({ where: { id, kind: "storage-delete", status: "PENDING" } });
    if (kept.count !== 1) throw new ConflictException("The upload reservation expired. Upload the file again.");
  }

  async enqueue(schoolId: string, key: string, db?: Pick<Prisma.TransactionClient, "backgroundJob">) {
    this.storage.assertOwned(schoolId, key);
    const id = this.id(key);
    await this.jobs.enqueue(id, "storage-delete", schoolId, { schoolId, key }, db);
    await (db ?? this.prisma.client).backgroundJob.updateMany({ where: { id, status: "PENDING" }, data: { nextAttempt: new Date() } });
    return id;
  }

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => { void this.tick().catch(() => this.logger.error('Storage cleanup polling failed.')); }, 60_000);
    this.timer.unref();
    void this.tick().catch(() => this.logger.error('Storage cleanup startup polling failed.'));
  }
  onApplicationShutdown() { if (this.timer) clearInterval(this.timer); }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const jobs = await this.prisma.client.backgroundJob.findMany({ where: { kind: "storage-delete", nextAttempt: { lte: new Date() },
        OR: [{ status: "PENDING" }, { status: "RUNNING", leaseUntil: { lt: new Date() } }] },
        orderBy: [{ nextAttempt: "asc" }, { id: "asc" }], take: 25, select: { id: true } });
      for (const job of jobs) await this.jobs.run(job.id, async payload => {
        const value = payload as { schoolId?: unknown; key?: unknown };
        if (typeof value?.schoolId !== "string" || typeof value.key !== "string") throw new Error("Invalid cleanup payload");
        await this.storage.delete(value.schoolId, value.key);
      });
    } finally { this.running = false; }
  }
}
