import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import type { z } from "zod";
import { apiBytes, apiFetch, publicFetch } from "@/lib/api";
import {
  assertFeature,
  assertMobileRole,
  type MobileRole,
} from "@/lib/permissions";
import { sessionStore } from "@/lib/session";

type QueryValue = string | number | boolean | null | undefined;
type Query = Readonly<Record<string, QueryValue | readonly QueryValue[]>>;
export type EndpointQuery = Query;
type BaseOptions = {
  params?: Readonly<Record<string, string>>;
  query?: Query;
  subdomain?: string;
  signal?: AbortSignal;
};
type EndpointOptions<TRequest> = BaseOptions & { request?: TRequest };
type EndpointArguments<TRequestSchema extends z.ZodType | undefined> =
  TRequestSchema extends z.ZodType
    ? [
        options: EndpointOptions<z.input<TRequestSchema>> & {
          request: z.input<TRequestSchema>;
        },
      ]
    : [options?: EndpointOptions<never>];
type EndpointScope = "public" | "session" | "discovery";

const publicEndpoints = new Set([
  "GET /schools/public/:subdomain",
  "POST /schools/public/:subdomain/resolve-login",
  "POST /account/password-recovery/request",
  "POST /account/password-recovery/complete",
]);
const sessionEndpoints = new Set(["POST /account/change-password"]);
const discoveryEndpoints = new Set(["GET /schools/roles"]);
let downloadSequence = 0;

function assertDefinition(
  method: string,
  path: string,
  scope: EndpointScope | undefined,
  roles: readonly MobileRole[],
) {
  if (!path.startsWith("/") || path.startsWith("/api/") || /[?#]/.test(path))
    throw new Error("Endpoint paths must be API-relative route templates.");
  if (/(?:^|\/)(?:external-exams|bece)(?:\/|$)/.test(path))
    throw new Error("External examinations are unavailable on mobile.");

  const key = `${method} ${path}`;
  if (scope === "public" && !publicEndpoints.has(key))
    throw new Error("Unsupported anonymous mobile endpoint.");
  if (scope === "session" && !sessionEndpoints.has(key))
    throw new Error("Unsupported role-independent session endpoint.");
  if (scope === "discovery" && !discoveryEndpoints.has(key))
    throw new Error("Unsupported role-discovery endpoint.");
  if (scope && scope !== "discovery" && roles.length)
    throw new Error("Non-role endpoints cannot declare school roles.");
  if (!scope && !roles.length)
    throw new Error("A school endpoint must declare at least one mobile role.");
}

function buildPath(path: string, options: BaseOptions): string {
  const resolved = path.replace(
    /:([A-Za-z][A-Za-z0-9_]*)/g,
    (_, name: string) => {
      const value = options.params?.[name];
      if (value === undefined || value.length === 0)
        throw new Error("A required route parameter is missing.");
      return encodeURIComponent(value);
    },
  );
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry !== null && entry !== undefined)
          search.append(key, String(entry));
      }
    } else if (value !== null && value !== undefined) {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `${resolved}?${query}` : resolved;
}

function assertScope(
  scope: EndpointScope | undefined,
  roles: readonly MobileRole[],
) {
  const session = sessionStore.getSnapshot();
  if (scope === "public") return session;
  if (!session.token || !session.subdomain)
    throw new Error("A school session is required.");
  if (scope === "discovery" || scope === "session") return session;
  assertMobileRole(session.activeRole);
  if (
    session.status !== "ready" ||
    !session.roles.includes(session.activeRole) ||
    !roles.includes(session.activeRole)
  )
    throw new Error("This feature is unavailable for the active role.");
  return session;
}

/** Only this adapter may call the transport; verify-endpoints checks every declaration. */
export function defineEndpoint<
  TResponse,
  TRequestSchema extends z.ZodType | undefined = undefined,
>(definition: {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  roles: readonly MobileRole[];
  scope?: EndpointScope;
  request?: TRequestSchema;
  response: z.ZodType<TResponse>;
}) {
  assertDefinition(
    definition.method,
    definition.path,
    definition.scope,
    definition.roles,
  );
  return async (
    ...args: EndpointArguments<TRequestSchema>
  ): Promise<TResponse> => {
    const options = args[0] ?? {};
    assertScope(definition.scope, definition.roles);
    if (
      definition.scope !== "public" &&
      /(?:^|\/)(?:external-exams|bece)(?:\/|$)/.test(definition.path)
    )
      assertFeature(sessionStore.getSnapshot().activeRole, "bece");

    const path = buildPath(definition.path, options);
    let body: string | undefined;
    if (definition.request) {
      body = JSON.stringify(definition.request.parse(options.request));
    } else if (options.request !== undefined) {
      throw new Error("This endpoint does not accept a request body.");
    }
    const init: RequestInit = {
      method: definition.method,
      signal: options.signal,
      ...(body === undefined ? {} : { body }),
    };
    const result =
      definition.scope === "public"
        ? await publicFetch<unknown>(
            path,
            options.subdomain ?? options.params?.subdomain,
            init,
          )
        : await apiFetch<unknown>(path, init);
    return definition.response.parse(result);
  };
}

/** Authenticated PDF download that shares from cache and removes the temporary file. */
export function defineDownload(definition: {
  method: "GET";
  path: string;
  roles: readonly MobileRole[];
}) {
  assertDefinition(
    definition.method,
    definition.path,
    undefined,
    definition.roles,
  );
  return async (options: BaseOptions = {}): Promise<void> => {
    assertScope(undefined, definition.roles);
    const path = buildPath(definition.path, options);
    const bytes = await apiBytes(path, {
      method: definition.method,
      signal: options.signal,
    });
    const filename = `schoolhub-document-${Date.now()}-${++downloadSequence}.pdf`;
    const file = new File(Paths.cache, filename);
    try {
      await file.write(bytes);
      if (!(await Sharing.isAvailableAsync()))
        throw new Error("File sharing is not available on this device.");
      await Sharing.shareAsync(file.uri, {
        dialogTitle: "Share PDF",
        mimeType: "application/pdf",
      });
    } finally {
      if (file.exists) await file.delete();
    }
  };
}
