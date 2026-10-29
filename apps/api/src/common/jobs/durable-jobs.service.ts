import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service.js";

const LEASE_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;

@Injectable()
export class DurableJobsService {
  private readonly logger = new Logger(DurableJobsService.name);
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(id: string, kind: string, schoolId: string | null, payload: Prisma.InputJsonValue,
    db: Pick<Prisma.TransactionClient, "backgroundJob"> = this.prisma.client) {
    return db.backgroundJob.upsert({ where: { id }, create: { id, kind, schoolId, payload }, update: {} });
  }

  async run(id: string, handler: (payload: Prisma.JsonValue) => Promise<void>, now = new Date()) {
    await this.prisma.client.backgroundJob.updateMany({ where: { id, status: "RUNNING", leaseUntil: { lt: now }, attempts: { gte: MAX_ATTEMPTS } },
      data: { status: "DEAD", leaseToken: null, leaseUntil: null, lastError: "Worker lease expired after the retry limit." } });
    const token = randomUUID();
    const claimed = await this.prisma.client.backgroundJob.updateMany({
      where: { id, attempts: { lt: MAX_ATTEMPTS }, nextAttempt: { lte: now }, OR: [
        { status: "PENDING" }, { status: "RUNNING", leaseUntil: { lt: now } },
      ] },
      data: { status: "RUNNING", attempts: { increment: 1 }, leaseToken: token,
        leaseUntil: new Date(now.getTime() + LEASE_MS), heartbeatAt: now },
    });
    if (!claimed.count) return false;
    const job = await this.prisma.client.backgroundJob.findUniqueOrThrow({ where: { id } });
    const heartbeat = setInterval(() => {
      void this.prisma.client.backgroundJob.updateMany({ where: { id, leaseToken: token, status: "RUNNING" },
        data: { heartbeatAt: new Date(), leaseUntil: new Date(Date.now() + LEASE_MS) } }).catch(() => {
        this.logger.error(JSON.stringify({ event: "job.heartbeat.failed", jobId: id, kind: job.kind }));
      });
    }, 60_000);
    heartbeat.unref();
    try {
      await handler(job.payload);
      await this.prisma.client.backgroundJob.updateMany({ where: { id, leaseToken: token, status: "RUNNING" },
        data: { status: "SUCCEEDED", completedAt: new Date(), lastError: null, leaseToken: null, leaseUntil: null } });
      return true;
    } catch {
      const dead = job.attempts >= MAX_ATTEMPTS;
      // Do not persist provider errors, query text or pupil data.
      await this.prisma.client.backgroundJob.updateMany({ where: { id, leaseToken: token, status: "RUNNING" },
        data: { status: dead ? "DEAD" : "PENDING", lastError: "Job execution failed; inspect restricted operator logs.",
          nextAttempt: new Date(Date.now() + Math.min(3600_000, 60_000 * 2 ** Math.min(job.attempts, 6))),
          leaseToken: null, leaseUntil: null } });
      this.logger.error(JSON.stringify({ event: dead ? "job.dead" : "job.retry", jobId: id, kind: job.kind, schoolId: job.schoolId, attempt: job.attempts }));
      return false;
    } finally {
      clearInterval(heartbeat);
    }
  }
}
