/**
 * Typed API fetch utility.
 *
 * Wraps the native `fetch` with:
 *   - Base URL from environment (falls back to /api for Vite proxy)
 *   - Automatic JSON headers
 *   - Error throwing on non-2xx responses
 *
 * Usage:
 *   const students = await apiFetch<Student[]>("/students");
 *   const student  = await apiFetch<Student>("/students", {
 *     method: "POST",
 *     body: JSON.stringify(data),
 *   });
 */

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function getClientSubdomain(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const override = params.get("school") || params.get("subdomain");
  if (override && override.trim().length > 0) return override.trim().toLowerCase();

  const hostname = window.location.hostname.toLowerCase();
  if (hostname.endsWith(".localhost")) {
    const parts = hostname.split(".");
    if (parts.length >= 2 && parts[0] && !["www", "app", "api", "admin"].includes(parts[0])) {
      return parts[0];
    }
  }
  const parts = hostname.split(".");
  if (parts.length >= 3 && parts[0] && !["www", "app", "api", "admin"].includes(parts[0])) {
    return parts[0];
  }
  return null;
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  // Let the browser set the multipart boundary for file uploads.
  if (!(init?.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const subdomain = getClientSubdomain();
  if (subdomain) {
    headers.set("x-school-subdomain", subdomain);
  }

  if (
    typeof window !== "undefined" &&
    path !== "/schools/roles"
  ) {
    const activeRole = window.localStorage.getItem("schoolhub-active-role");
    if (activeRole) headers.set("x-school-role", activeRole);
    if (activeRole === "accountant") {
      const period = window.sessionStorage.getItem(
        "schoolhub-accountant-academic-view",
      );
      if (period) {
        try {
          const parsed = JSON.parse(period) as {
            academicYearId?: unknown;
            termId?: unknown;
          };
          if (
            typeof parsed.academicYearId === "string" &&
            typeof parsed.termId === "string"
          ) {
            headers.set("x-academic-year-id", parsed.academicYearId);
            headers.set("x-academic-term-id", parsed.termId);
          }
        } catch {
          window.sessionStorage.removeItem(
            "schoolhub-accountant-academic-view",
          );
        }
      }
    }
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include", // send session cookie
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      (body as { message?: string }).message ?? res.statusText,
      body,
    );
  }

  // 204 No Content — return undefined cast to T
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}
