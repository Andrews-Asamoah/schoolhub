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

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
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
