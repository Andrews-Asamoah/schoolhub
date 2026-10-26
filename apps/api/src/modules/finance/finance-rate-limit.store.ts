import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import { FINANCE_WRITES_PER_MINUTE, FINANCE_RATE_LIMIT_WINDOW_MS as WINDOW_MS, type FinanceRateLimitStore } from "./finance-safeguards.js";

/**
 * Shared store: one atomic upsert per write, so every API instance sees the same
 * counter. Fixed window per key; a stale window resets in the same statement.
 */
@Injectable()
export class DatabaseFinanceRateLimitStore implements FinanceRateLimitStore {
  constructor(private readonly prisma: PrismaService) {}

  async hit(key: string): Promise<number> {
    const rows = await this.prisma.client.$queryRaw<Array<{ hits: number; waitMs: number }>>`
      INSERT INTO finance_rate_limits ("key", "windowStart", "hits")
      VALUES (${key}, timezone('utc', now()), 1)
      ON CONFLICT ("key") DO UPDATE SET
        "hits" = CASE WHEN finance_rate_limits."windowStart" < timezone('utc', now()) - (${WINDOW_MS} * interval '1 millisecond')
                      THEN 1 ELSE finance_rate_limits."hits" + 1 END,
        "windowStart" = CASE WHEN finance_rate_limits."windowStart" < timezone('utc', now()) - (${WINDOW_MS} * interval '1 millisecond')
                             THEN timezone('utc', now()) ELSE finance_rate_limits."windowStart" END
      RETURNING "hits", GREATEST(0, (EXTRACT(EPOCH FROM (finance_rate_limits."windowStart" + (${WINDOW_MS} * interval '1 millisecond') - timezone('utc', now()))) * 1000))::int AS "waitMs"`;
    const row = rows[0];
    return row && row.hits > FINANCE_WRITES_PER_MINUTE ? Math.max(row.waitMs, 1000) : 0;
  }
}
