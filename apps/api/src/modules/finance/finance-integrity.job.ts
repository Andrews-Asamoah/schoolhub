import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import { FinanceLedgerIntegrityService } from "./finance-ledger-integrity.service.js";

const HOUR_MS = 3_600_000;
const RUN_HOUR_UTC = 2; // 02:00 UTC, before Ghana's working day (GMT)

/**
 * Nightly I1/I2 check across all schools. A Postgres advisory lock makes it safe on several
 * API instances: only one instance runs a given pass. Disable with FINANCE_INTEGRITY_JOB=off.
 * Failures are logged at error level so existing log alerting picks them up; they are also
 * available on demand from GET /finance/ledger/integrity.
 */
@Injectable()
export class FinanceIntegrityJob implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(FinanceIntegrityJob.name);
  private timer?: NodeJS.Timeout;
  private lastRunDay = "";

  constructor(private readonly prisma: PrismaService, private readonly integrity: FinanceLedgerIntegrityService) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === "test" || process.env.FINANCE_INTEGRITY_JOB === "off") return;
    this.timer = setInterval(() => { void this.tick(); }, HOUR_MS);
    this.timer.unref();
  }

  onApplicationShutdown() { if (this.timer) clearInterval(this.timer); }

  private async tick(now = new Date()) {
    const day = now.toISOString().slice(0, 10);
    if (now.getUTCHours() !== RUN_HOUR_UTC || this.lastRunDay === day) return;
    this.lastRunDay = day;
    await this.runOnce();
  }

  async runOnce() {
    // Transaction-scoped advisory lock: released automatically even if this process dies,
    // and not tied to a pooled connection that could differ between lock and unlock.
    return this.prisma.client.$transaction(async tx => {
      const [lock] = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext('finance_integrity_job')) AS locked`;
      if (!lock?.locked) return null;
      const result = await this.integrity.checkAllSchools();
      if (result.failing.length) this.logger.error(`Ledger integrity FAILED for ${result.failing.length} of ${result.schoolsChecked} schools: ${JSON.stringify(result.failing)}`);
      else this.logger.log(`Ledger integrity passed for ${result.schoolsChecked} schools.`);
      return result;
    }, { timeout: 15 * 60_000, maxWait: 5_000 });
  }
}
