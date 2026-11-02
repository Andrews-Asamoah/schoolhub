import type { z } from "zod";
import { apiFetch, publicFetch } from "@/lib/api";
import {
  assertFeature,
  assertMobileRole,
  type MobileRole,
} from "@/lib/permissions";
import { sessionStore } from "@/lib/session";
type Options = {
  params?: Record<string, string>;
  signal?: AbortSignal;
  body?: unknown;
  subdomain?: string;
};
const publicPaths = new Set([
  "/schools/public/:subdomain",
  "/schools/public/:subdomain/resolve-login",
  "/account/password-recovery/request",
  "/account/password-recovery/complete",
]);
export function defineEndpoint<T>(definition: {
  method: "GET" | "POST";
  path: string;
  roles: readonly MobileRole[];
  scope?: "discovery" | "public" | "account";
  request?: z.ZodType;
  response: z.ZodType<T>;
}) {
  return async (options: Options = {}): Promise<T> => {
    const session = sessionStore.getSnapshot();
    if (definition.scope === "public") {
      if (!publicPaths.has(definition.path))
        throw new Error("Unsupported anonymous endpoint.");
    } else {
      if (!session.token || !session.subdomain)
        throw new Error("A school session is required.");
      if (definition.scope === "account") {
        if (session.status === "ready") {
          assertMobileRole(session.activeRole);
          if (!session.roles.includes(session.activeRole))
            throw new Error("Role is not assigned to this account.");
        }
        if (
          definition.path !== "/account/change-password" ||
          !["ready", "needsPasswordChange"].includes(session.status)
        )
          throw new Error("Complete the required account steps first.");
      } else if (definition.scope === "discovery") {
        if (definition.path !== "/schools/roles")
          throw new Error("Unsupported role-discovery endpoint.");
      } else {
        assertMobileRole(session.activeRole);
        if (
          session.status !== "ready" ||
          !session.roles.includes(session.activeRole) ||
          !definition.roles.includes(session.activeRole)
        )
          throw new Error("This feature is unavailable for the active role.");
        assertFeature(
          session.activeRole,
          /(?:^|\/)(?:external-exams|bece)(?:\/|$)/.test(definition.path)
            ? "bece"
            : "announcements",
        );
      }
    }
    const path = definition.path.replace(
      /:([A-Za-z][A-Za-z0-9_]*)/g,
      (_, name: string) => {
        const v = options.params?.[name];
        if (!v) throw new Error("A required route parameter is missing.");
        return encodeURIComponent(v);
      },
    );
    const body = definition.request
      ? JSON.stringify(definition.request.parse(options.body))
      : undefined;
    const init = { method: definition.method, signal: options.signal, body };
    return definition.response.parse(
      definition.scope === "public"
        ? await publicFetch<unknown>(
            path,
            options.subdomain ?? options.params?.subdomain ?? "",
            init,
          )
        : await apiFetch<unknown>(path, init),
    );
  };
}
