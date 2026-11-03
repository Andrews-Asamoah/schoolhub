import { assertMobileRole } from "./permissions";
import { API_BASE } from "./config";
import {
  emitSessionEvent,
  sessionStore,
  getActiveRole,
  getSubdomain,
  getToken,
} from "./session";

import { ApiError, SessionChangedError } from "./api-error";
export { ApiError } from "./api-error";

/** Headers every authenticated request carries (mirrors apps/web/src/lib/api.ts). */
export function buildHeaders(path: string, init?: RequestInit): Headers {
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  // Never accept caller-supplied identity or unsupported finance scope headers.
  for (const name of [
    "authorization",
    "x-school-role",
    "x-school-subdomain",
    "x-academic-year-id",
    "x-academic-term-id",
  ])
    headers.delete(name);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const subdomain = getSubdomain();
  if (subdomain) headers.set("x-school-subdomain", subdomain);

  // /schools/roles is how the role list is discovered, so it must not send a role.
  if (path.split("?")[0]?.replace(/\/+$/, "") !== "/schools/roles") {
    const role = getActiveRole();
    if (role) {
      assertMobileRole(role);
      headers.set("x-school-role", role);
    }
  }
  return headers;
}

function handleSessionErrors(status: number, body: unknown) {
  const b = (body ?? {}) as {
    error?: string;
    reason?: string;
    audience?: string;
  };
  if (status === 401) {
    emitSessionEvent({ type: "unauthorized" });
    return;
  }
  if (status !== 403) return;
  if (b.error === "PASSWORD_CHANGE_REQUIRED")
    emitSessionEvent({ type: "password-change-required" });
  else if (b.error === "SUBSCRIPTION_INACTIVE")
    emitSessionEvent({
      type: "subscription-inactive",
      reason: b.reason ?? "EXPIRED",
    });
  else if (b.error === "TWO_FACTOR_REQUIRED")
    emitSessionEvent({
      type: "two-factor-required",
      audience: b.audience ?? "school-admin",
    });
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const { response, revision } = await authenticatedRequest(path, init);
  if (response.status === 204) return undefined as T;
  const body = await response.json();
  if (sessionStore.getRevision() !== revision) throw new SessionChangedError();
  return body as T;
}

export async function apiBytes(
  path: string,
  init?: RequestInit,
): Promise<Uint8Array> {
  const { response, revision } = await authenticatedRequest(path, init);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (sessionStore.getRevision() !== revision) throw new SessionChangedError();
  return bytes;
}

async function authenticatedRequest(
  path: string,
  init?: RequestInit,
): Promise<{ response: Response; revision: number }> {
  const revision = sessionStore.getRevision();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: buildHeaders(path, init),
  });

  if (sessionStore.getRevision() !== revision) throw new SessionChangedError();
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => ({}));
    if (sessionStore.getRevision() !== revision)
      throw new SessionChangedError();
    handleSessionErrors(res.status, body);
    throw new ApiError(
      res.status,
      (body as { message?: string }).message ?? res.statusText,
      body,
    );
  }
  return { response: res, revision };
}

/**
 * Anonymous school lookup, used before a session exists (school-code screen).
 * Sends the school code explicitly because the stored one may not be set yet.
 */
export async function publicFetch<T>(
  path: string,
  subdomain?: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  for (const name of [
    "authorization",
    "x-school-role",
    "x-school-subdomain",
    "x-academic-year-id",
    "x-academic-term-id",
  ])
    headers.delete(name);
  if (subdomain?.trim())
    headers.set("x-school-subdomain", subdomain.trim().toLowerCase());
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      (body as { message?: string }).message ?? res.statusText,
      body,
    );
  }
  return (await res.json()) as T;
}
