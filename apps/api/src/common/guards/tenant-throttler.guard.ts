import { createHash } from "node:crypto";
import { type ExecutionContext, Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

/** Guards listed on a route that already enforce throttling themselves. */
const GUARDS_METADATA = "__guards__";

function declaresThrottlerGuard(target: unknown): boolean {
  if (!target) return false;
  const guards = Reflect.getMetadata(GUARDS_METADATA, target as object) as unknown[] | undefined;
  return Boolean(guards?.some((guard) => typeof guard === "function" && (guard === ThrottlerGuard || guard.prototype instanceof ThrottlerGuard)));
}

const digest = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 24);

function credentialOf(req: Record<string, any>): string | null {
  const authorization = req.headers?.authorization;
  if (typeof authorization === "string" && authorization) return authorization;
  const cookie = req.headers?.cookie;
  if (typeof cookie === "string") {
    const session = /(?:^|;\s*)([^=;\s]*session_token[^=;\s]*)=([^;]+)/.exec(cookie);
    if (session) return `${session[1]}=${session[2]}`;
  }
  return null;
}

/**
 * Applied to every route. The bucket is tenant plus the signed-in user, falling back to the client
 * IP only for anonymous callers. Keying by user matters because a whole school often shares one
 * public IP, so an IP-only limit would lock out every pupil and teacher at once.
 *
 * Controllers that already declare their own ThrottlerGuard keep their stricter rules and are
 * skipped here, so a request is never counted twice.
 */
@Injectable()
export class TenantThrottlerGuard extends ThrottlerGuard {
  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (declaresThrottlerGuard(context.getHandler()) || declaresThrottlerGuard(context.getClass())) return true;
    return super.shouldSkip(context);
  }

  protected override async getTracker(req: Record<string, any>): Promise<string> {
    const tenant = typeof req.headers?.["x-school-subdomain"] === "string" ? req.headers["x-school-subdomain"] : "none";
    const credential = credentialOf(req);
    return `${tenant}:${credential ? `u-${digest(credential)}` : `ip-${req.ip ?? "unknown"}`}`;
  }
}
