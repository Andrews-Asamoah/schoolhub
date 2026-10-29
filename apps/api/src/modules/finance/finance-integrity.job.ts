import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import { DurableJobsService } from "../../common/jobs/durable-jobs.service.js";
import { FinanceLedgerIntegrityService } from "./finance-ledger-integrity.service.js";

/** Most recent scheduled check at 02:00 UTC; startup catches up even after that hour. */
export function financeIntegrityDueDay(now: Date) {
  return new Date(now.getTime() - 2 * 3600_000).toISOString().slice(0, 10);
}

@Injectable()
export class FinanceIntegrityJob implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(FinanceIntegrityJob.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(private readonly prisma: PrismaService, private readonly integrity: FinanceLedgerIntegrityService,
    private readonly jobs: DurableJobsService) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === "test" || process.env.FINANCE_INTEGRITY_JOB === "off") return;
    const poll = () => { void this.tick().catch(() => this.logger.error(JSON.stringify({ event: "finance.integrity.poll.failed" }))); };
    this.timer = setInterval(poll, 60_000); this.timer.unref(); poll();
  }
  onApplicationShutdown() { if (this.timer) clearInterval(this.timer); }

  async tick(now = new Date()) {
    if (this.running) return;
    this.running = true;
    try {
      const day = financeIntegrityDueDay(now);
      let after: string | undefined;
      while (true) {
        const schools = await this.prisma.client.school.findMany({ where: { createdAt: { lte: now }, ...(after ? { id: { gt: after } } : {}) },
          select: { id: true }, orderBy: { id: "asc" }, take: 100 });
        for (const school of schools) await this.jobs.enqueue(`finance-integrity:${school.id}:${day}`, "finance-integrity", school.id, { schoolId: school.id, scheduledDay: day });
        if (schools.length < 100) break;
        after = schools[schools.length - 1]!.id;
      }
      const pending = await this.prisma.client.backgroundJob.findMany({ where: { kind: "finance-integrity", nextAttempt: { lte: now },
        OR: [{ status: "PENDING" }, { status: "RUNNING", leaseUntil: { lt: now } }] },
        select: { id: true }, orderBy: [{ nextAttempt: "asc" }, { id: "asc" }], take: 25 });
      for (const job of pending) await this.jobs.run(job.id, async payload => {
        const data = payload as { schoolId?: unknown; scheduledDay?: unknown };
        if (typeof data.schoolId !== "string") throw new Error("Invalid integrity job");
        if (!await this.prisma.client.school.findUnique({ where: { id: data.schoolId }, select: { id: true } })) return;
        const report = await this.integrity.check(data.schoolId);
        if ([report.I1.status, report.I2.status, report.I3.status].some(status => status !== "PASS")) {
          this.logger.error(JSON.stringify({ event: "finance.integrity.failed", schoolId: data.schoolId, scheduledDay: data.scheduledDay,
            checkedAt: new Date().toISOString(), I1: report.I1.status, I2: report.I2.status, I3: report.I3.status }));
          throw new Error("Ledger integrity check failed");
        }
        this.logger.log(JSON.stringify({ event: "finance.integrity.passed", schoolId: data.schoolId, scheduledDay: data.scheduledDay, checkedAt: new Date().toISOString() }));
      }, now);
    } finally { this.running = false; }
  }
}
