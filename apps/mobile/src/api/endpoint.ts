import type { z } from "zod";
import { apiFetch } from "@/lib/api";
import {
  assertFeature,
  assertMobileRole,
  type MobileRole,
} from "@/lib/permissions";
import { sessionStore } from "@/lib/session";

type Options = { params?: Record<string, string>; signal?: AbortSignal };
/** Only this adapter may call the transport; verify-endpoints checks every declaration. */
export function defineEndpoint<T>(definition: {
  method: "GET";
  path: string;
  roles: readonly MobileRole[];
  scope?: "discovery";
  response: z.ZodType<T>;
}) {
  return async (options: Options = {}): Promise<T> => {
    const session = sessionStore.getSnapshot();
    if (!session.token || !session.subdomain)
      throw new Error("A school session is required.");
    if (definition.scope !== "discovery") {
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
    } else if (definition.path !== "/schools/roles") {
      throw new Error("Unsupported role-discovery endpoint.");
    }
    const path = definition.path.replace(
      /:([A-Za-z][A-Za-z0-9_]*)/g,
      (_, name: string) => {
        const value = options.params?.[name];
        if (!value) throw new Error("A required route parameter is missing.");
        return encodeURIComponent(value);
      },
    );
    return definition.response.parse(
      await apiFetch<unknown>(path, {
        method: definition.method,
        signal: options.signal,
      }),
    );
  };
}
