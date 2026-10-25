import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";

/** Fixed-size sliding window counter, keyed by caller. In-memory (per API instance). */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records a hit; returns how many ms to wait when over the limit, or 0 when allowed. */
  hit(key: string): number {
    const now = this.now();
    const recent = (this.hits.get(key) ?? []).filter((time) => now - time < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return this.windowMs - (now - recent[0]!);
    }
    recent.push(now);
    this.hits.set(key, recent);
    // Opportunistic cleanup so the map cannot grow without bound.
    if (this.hits.size > 5000) {
      for (const [k, times] of this.hits) {
        if (!times.some((time) => now - time < this.windowMs)) this.hits.delete(k);
      }
    }
    return 0;
  }
}

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
export const FINANCE_WRITES_PER_MINUTE = 60;
const limiter = new SlidingWindowLimiter(FINANCE_WRITES_PER_MINUTE, 60_000);

/** Throttles finance writes per user and school, so a stuck client or abuse cannot flood the ledger. */
@Injectable()
export class FinanceWriteRateLimitGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (!WRITE_METHODS.has(request.method)) return true;
    const userId = request.session?.user?.id ?? "anonymous";
    const key = `${userId}:${request.school?.id ?? "none"}`;
    const waitMs = limiter.hit(key);
    if (waitMs > 0) {
      throw new HttpException(
        `Too many financial changes in a short time. Please wait ${Math.ceil(waitMs / 1000)} seconds and try again.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}

export const SUPPORT_REASON_HEADER = "x-support-reason";
export const MIN_SUPPORT_REASON_LENGTH = 10;

/**
 * Platform superAdmins may change a school's finances (e.g. at the school's
 * request) but must state why. The reason is recorded in the audit log.
 */
@Injectable()
export class SuperAdminReasonGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (!WRITE_METHODS.has(request.method)) return true;
    if (request.session?.user?.role !== "superAdmin") return true;
    const raw = request.headers?.[SUPPORT_REASON_HEADER];
    const reason = (Array.isArray(raw) ? raw[0] : raw)?.toString().trim() ?? "";
    if (reason.length < MIN_SUPPORT_REASON_LENGTH) {
      throw new BadRequestException(
        `Platform administrators must state why they are changing a school's finances: send the "${SUPPORT_REASON_HEADER}" header (at least ${MIN_SUPPORT_REASON_LENGTH} characters).`,
      );
    }
    request.supportReason = reason.slice(0, 500);
    return true;
  }
}
