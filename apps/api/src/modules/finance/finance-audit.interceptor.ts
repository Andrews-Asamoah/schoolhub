import {
  Injectable,
  Logger,
  SetMetadata,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { tap, type Observable } from "rxjs";
import { PrismaService } from "../../prisma/prisma.service.js";

/** Marks a handler that writes its own (transactional) audit entry. */
export const FINANCE_SELF_AUDITED = "finance:self-audited";
export const FinanceSelfAudited = () => SetMetadata(FINANCE_SELF_AUDITED, true);

const SENSITIVE_KEYS = /password|token|secret|authorization/i;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitize(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEYS.test(key) ? "[redacted]" : sanitize(inner, depth + 1);
  }
  return out;
}

/**
 * Writes an AuditLog row for every successful finance write request: who
 * (including whether it was a platform superAdmin acting on a school), which
 * school, which route, and the validated input. Routes that audit inside
 * their own database transaction are marked @FinanceSelfAudited() and skipped.
 */
@Injectable()
export class FinanceAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(FinanceAuditInterceptor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    if (request.method === "GET" || request.method === "HEAD") return next.handle();
    const selfAudited = this.reflector.get<boolean>(FINANCE_SELF_AUDITED, context.getHandler());
    // Platform admin actions are always logged here too, because this row carries the stated reason.
    if (selfAudited && request.session?.user?.role !== "superAdmin") return next.handle();
    return next.handle().pipe(
      tap({
        next: (result) => {
          void this.record(request, result);
        },
      }),
    );
  }

  private async record(request: any, result: unknown) {
    try {
      const user = request.session?.user;
      if (!user) return;
      const body = result as { id?: string; payrollRecord?: { id?: string } } | null | undefined;
      const params = (request.params ?? {}) as Record<string, string>;
      const entityId =
        body?.id ?? body?.payrollRecord?.id ?? Object.values(params).filter(Boolean).at(-1) ?? "n/a";
      await this.prisma.client.auditLog.create({
        data: {
          userId: user.id,
          schoolId: request.school?.id ?? null,
          action: request.method === "POST" ? "CREATE" : "UPDATE",
          entityType: `FINANCE ${request.method} ${request.route?.path ?? request.path}`,
          entityId: String(entityId),
          newValues: {
            params,
            body: sanitize(request.body),
            actorPlatformRole: user.role ?? null,
            actorSchoolRole: request.schoolRole ?? null,
            actedAsSuperAdmin: user.role === "superAdmin",
            supportReason: request.supportReason ?? null,
          } as object,
          ipAddress: request.ip ?? null,
          userAgent: request.headers?.["user-agent"] ?? null,
        },
      });
    } catch (error) {
      // Never fail a committed financial request because its audit write failed.
      this.logger.error(`Finance audit write failed: ${(error as Error).message}`);
    }
  }
}
