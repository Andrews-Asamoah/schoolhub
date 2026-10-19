/** Roles that give management access, so only the school owner may grant or take them away. */
export const OWNER_ONLY_ROLES = ["admin", "headmistress"] as const;

export interface RoleChangeRequest {
  /** The primary role of the person making the change. */
  actorRole: string;
  /** The member being edited. */
  target: { role: string; roles: string[] };
  /** Every role the member should have afterwards (primary role included). */
  requested: string[];
}

export type RoleChangeResult =
  | { ok: true; roles: string[] }
  | { ok: false; kind: "bad-request" | "forbidden"; message: string };

/**
 * Pure rules for changing a member's roles. `roles` in the result is what is
 * stored: the additional roles only, since the primary role lives in its own column.
 */
export function checkRoleChange({ actorRole, target, requested }: RoleChangeRequest): RoleChangeResult {
  const wanted = new Set(requested);

  if (!wanted.has(target.role)) {
    return { ok: false, kind: "bad-request", message: "The membership's primary role must remain assigned." };
  }
  if (wanted.has("owner") && target.role !== "owner") {
    return { ok: false, kind: "bad-request", message: "Owner access cannot be granted as an additional role." };
  }

  const existing = new Set([target.role, ...target.roles]);
  const changesManagementAccess = OWNER_ONLY_ROLES.some((role) => existing.has(role) !== wanted.has(role));
  if (changesManagementAccess && actorRole !== "owner") {
    return {
      ok: false,
      kind: "forbidden",
      message: "Only the school owner can grant or remove administrator or headmistress access.",
    };
  }

  return { ok: true, roles: [...wanted].filter((role) => role !== target.role) };
}
