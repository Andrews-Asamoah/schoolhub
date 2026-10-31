import { API_BASE } from "./config";
import {
  emitSessionEvent, getAcademicView, getActiveRole, getSubdomain, getToken,
} from "./session";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
  get code(): string | undefined {
    const e = (this.body as { error?: unknown } | null)?.error;
    return typeof e === "string" ? e : undefined;
  }
}

/** Headers every authenticated request carries (mirrors apps/web/src/lib/api.ts). */
export function buildHeaders(path: string, init?: RequestInit): Headers {
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const subdomain = getSubdomain();
  if (subdomain) headers.set("x-school-subdomain", subdomain);

  // /schools/roles is how the role list is discovered, so it must not send a role.
  if (path !== "/schools/roles") {
    const role = getActiveRole();
    if (role) headers.set("x-school-role", role);
    if (role === "accountant") {
      const view = getAcademicView();
      if (view) {
        headers.set("x-academic-year-id", view.academicYearId);
        headers.set("x-academic-term-id", view.termId);
      }
    }
  }
  return headers;
}

function handleSessionErrors(status: number, body: unknown) {
  const b = (body ?? {}) as { error?: string; reason?: string; audience?: string };
  if (status === 401) {
    emitSessionEvent({ type: "unauthorized" });
    return;
  }
  if (status !== 403) return;
  if (b.error === "PASSWORD_CHANGE_REQUIRED") emitSessionEvent({ type: "password-change-required" });
  else if (b.error === "SUBSCRIPTION_INACTIVE") emitSessionEvent({ type: "subscription-inactive", reason: b.reason ?? "EXPIRED" });
  else if (b.error === "TWO_FACTOR_REQUIRED") emitSessionEvent({ type: "two-factor-required", audience: b.audience ?? "school-admin" });
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers: buildHeaders(path, init) });

  if (!res.ok) {
    const body: unknown = await res.json().catch(() => ({}));
    handleSessionErrors(res.status, body);
    throw new ApiError(res.status, (body as { message?: string }).message ?? res.statusText, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Anonymous school lookup, used before a session exists (school-code screen).
 * Sends the school code explicitly because the stored one may not be set yet.
 */
export async function publicFetch<T>(path: string, subdomain: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  headers.set("x-school-subdomain", subdomain.trim().toLowerCase());
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as { message?: string }).message ?? res.statusText, body);
  }
  return (await res.json()) as T;
}
