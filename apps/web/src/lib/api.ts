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
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include", // send session cookie
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
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
