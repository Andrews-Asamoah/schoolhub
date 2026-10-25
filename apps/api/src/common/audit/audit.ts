import type { AuditAction, Prisma } from "@prisma/client";

/** Who performed an action, captured once at the controller boundary. */
export interface AuditActor {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface AuditEntry {
  action: AuditAction;
  /** Stable, greppable event name, e.g. "super-admin.school.enroll". */
  entityType: string;
  entityId: string;
  schoolId?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
}

const SENSITIVE_KEYS = /password|token|secret|authorization|hash/i;

/** Deep-copies a value, replacing anything that looks like a secret. */
export function redactForAudit(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return value;
  if (depth > 5) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactForAudit(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEYS.test(key) ? "[redacted]" : redactForAudit(inner, depth + 1);
  }
  return out;
}

/**
 * Writes an audit row using the caller's client or transaction, so the record
 * commits (or rolls back) together with the change it describes.
 */
export async function writeAudit(
  client: Pick<Prisma.TransactionClient, "auditLog">,
  actor: AuditActor,
  entry: AuditEntry,
) {
  await client.auditLog.create({
    data: {
      userId: actor.id,
      schoolId: entry.schoolId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      oldValues: (redactForAudit(entry.oldValues) ?? undefined) as Prisma.InputJsonValue | undefined,
      newValues: (redactForAudit(entry.newValues) ?? undefined) as Prisma.InputJsonValue | undefined,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent?.slice(0, 300) ?? null,
    },
  });
}

/** Builds the actor from an Express request that has passed the auth guards. */
export function actorFromRequest(request: {
  session?: { user?: { id: string } };
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}): AuditActor {
  const userAgent = request.headers?.["user-agent"];
  return {
    id: request.session?.user?.id ?? "unknown",
    ipAddress: request.ip ?? null,
    userAgent: Array.isArray(userAgent) ? (userAgent[0] ?? null) : (userAgent ?? null),
  };
}
