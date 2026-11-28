import { platform } from "@schoolhub/platform";
import { requestContextVersion, assertRequestContext } from "./request-context";
import { getTenantSubdomain as getClientSubdomain } from "./tenant-subdomain";
import { downloadBlob, XLSX_MIME } from "./download";

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

const API_BASE = platform.apiBase;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: unknown,
    /** Set on HTTP 429 from the Retry-After header. */
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const retryAfterOf = (response: Response) => {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
};

/**
 * Runs a request and, if the server answers 429, waits (Retry-After, else a short backoff) and tries
 * again. Bulk loops use it so a rate limit slows them down instead of stopping them part-way.
 * A 429 is returned before the handler runs, so retrying never repeats work.
 */
export async function retryOnRateLimit<T>(task: () => Promise<T>, attempts = 4): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await task();
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 429 || attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, Math.min(error.retryAfterMs ?? 2_000 * attempt, 30_000)));
    }
  }
}

/** The message to show for a failed request or action. */
export function errorText(error: unknown, fallback = "Something went wrong.") {
  return error instanceof Error ? error.message : fallback;
}

export { getTenantSubdomain as getClientSubdomain } from "./tenant-subdomain";

const ROLE_KEY = "schoolhub-active-role";
const ACCOUNTANT_PERIOD_KEY = "schoolhub-accountant-academic-view";

/** Tenant, active-role and accountant-period headers shared by every API call. */
function buildHeaders(path: string, initial?: HeadersInit): Headers {
  const headers = new Headers(initial);
  const subdomain = getClientSubdomain();
  if (subdomain) headers.set("x-school-subdomain", subdomain);
  if (typeof window === "undefined" || path === "/schools/roles") return headers;

  const activeRole = window.localStorage.getItem(ROLE_KEY);
  if (activeRole) headers.set("x-school-role", activeRole);
  if (activeRole === "accountant") {
    const period = window.sessionStorage.getItem(ACCOUNTANT_PERIOD_KEY);
    if (period) {
      try {
        const parsed = JSON.parse(period) as { academicYearId?: unknown; termId?: unknown };
        if (typeof parsed.academicYearId === "string" && typeof parsed.termId === "string") {
          headers.set("x-academic-year-id", parsed.academicYearId);
          headers.set("x-academic-term-id", parsed.termId);
        }
      } catch {
        window.sessionStorage.removeItem(ACCOUNTANT_PERIOD_KEY);
      }
    }
  }
  return headers;
}

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;
/** Registered once by the app shell so an expired session can use SPA navigation. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
}

// Paths where a 401 is an expected answer (wrong password, no session yet), not an expiry.
const AUTH_PAGES = ["/login", "/forgot-password", "/reset-password", "/apply", "/change-password", "/two-factor-setup", "/subscription-inactive"];

/** Redirects for account gates (password change, subscription, 2FA) and session expiry. */
function handleGate(status: number, body: unknown, path: string) {
  if (typeof window === "undefined") return;
  const info = body as { error?: string; reason?: string; audience?: string };
  const here = window.location.pathname;

  if (status === 401) {
    if (path.startsWith("/auth") || AUTH_PAGES.includes(here)) return;
    unauthorizedHandler?.();
    return;
  }
  if (status !== 403) return;
  // An administrator-issued password is still in force: every business endpoint refuses until it is replaced.
  if (info.error === "PASSWORD_CHANGE_REQUIRED" && here !== "/change-password") {
    window.location.assign("/change-password");
  }
  // The school's subscription is suspended, cancelled or expired: show one clear explanation.
  if (info.error === "SUBSCRIPTION_INACTIVE" && here !== "/subscription-inactive") {
    window.location.assign(`/subscription-inactive?reason=${encodeURIComponent(info.reason ?? "EXPIRED")}`);
  }
  // A second factor is mandatory for this account but not set up yet.
  if (info.error === "TWO_FACTOR_REQUIRED" && here !== "/two-factor-setup") {
    window.location.assign(`/two-factor-setup?audience=${encodeURIComponent(info.audience ?? "school-admin")}`);
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const contextVersion=requestContextVersion();
  const headers = buildHeaders(path, init?.headers);
  // Let the browser set the multipart boundary for file uploads.
  if (!(init?.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const res = await platform.fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include", // send session cookie
    headers,
  });

  assertRequestContext(contextVersion);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    assertRequestContext(contextVersion);
    handleGate(res.status, body, path);
    throw new ApiError(
      res.status,
      (body as { message?: string }).message ?? res.statusText,
      body,
      retryAfterOf(res),
    );
  }

  // 204 No Content — return undefined cast to T
  if (res.status === 204) return undefined as T;

  const data=await res.json() as T;
  assertRequestContext(contextVersion);
  return data;
}

/**
 * Downloads a binary export through the authenticated API client. This mirrors
 * the tenant and active-role headers used by apiFetch and honors the server's
 * Content-Disposition filename.
 */
async function apiBinary(path: string): Promise<Response> {
  const contextVersion=requestContextVersion();
  const headers = buildHeaders(path);

  const response = await platform.fetch(`${API_BASE}${path}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers,
  });
  assertRequestContext(contextVersion);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    assertRequestContext(contextVersion);
    handleGate(response.status, body, path);
    throw new ApiError(response.status, (body as { message?: string }).message ?? response.statusText, body);
  }

  return response;
}

export async function apiBlob(path: string): Promise<Blob> {
  const contextVersion=requestContextVersion();
  const blob=await (await apiBinary(path)).blob();
  assertRequestContext(contextVersion);
  return blob;
}

export async function apiDownload(path: string, fallbackFileName?: string): Promise<void> {
  const contextVersion=requestContextVersion();
  const response = await apiBinary(path);
  const disposition = response.headers.get("content-disposition") ?? "";
  const encodedName = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const plainName = /filename="?([^";]+)"?/i.exec(disposition)?.[1];
  const fileName = fallbackFileName ?? (encodedName ? decodeURIComponent(encodedName) : plainName) ?? "schoolhub-export";
  const blob = await response.blob();
  assertRequestContext(contextVersion);
  downloadBlob(blob, fileName.replace(/[\\/:*?"<>|]/g, "_"));
}

/** Authenticated, private PDF download; no public file URL is created. */
export async function downloadAcademicReport(path: string, filename: string): Promise<void> {
  const contextVersion=requestContextVersion();
  const headers = new Headers();
  const school = getClientSubdomain();
  if (school) headers.set("x-school-subdomain", school);
  const role = typeof window !== "undefined" ?
    window.localStorage.getItem("schoolhub-active-role") : null;
  if (role) headers.set("x-school-role", role);
  const result = await platform.fetch(`${API_BASE}${path}`,{
    method:"GET",credentials:"include",headers,cache:"no-store",
  });
  if (!result.ok) {
    const detail = await result.json().catch(()=>({message:"Report download was rejected."}));
    throw new ApiError(result.status,
      (detail as {message?:string}).message ?? "Report download was rejected.",detail);
  }
  if (!result.headers.get("content-type")?.includes("application/pdf")) {
    throw new Error("The server did not return a valid PDF.");
  }
  const file = await result.blob();
  assertRequestContext(contextVersion);
  const url = URL.createObjectURL(file);
  try {
    const a = document.createElement("a"); a.href=url;a.download=filename;
    document.body.appendChild(a);a.click();a.remove();
  } finally { URL.revokeObjectURL(url); }
}

/** Authenticated Excel downloads. The file is never exposed on a public URL. */
export async function downloadPrivateExcel(path:string,filename:string):Promise<void>{
  const contextVersion=requestContextVersion();
  const headers=new Headers();
  const school=getClientSubdomain();
  if(school)headers.set("x-school-subdomain",school);
  if(typeof window!=="undefined"){
    const role=window.localStorage.getItem("schoolhub-active-role");
    if(role)headers.set("x-school-role",role);
  }
  const response=await platform.fetch(`${API_BASE}${path}`,{
    credentials:"include",headers,cache:"no-store",
  });
  if(!response.ok){
    const detail=await response.json().catch(()=>({message:"Excel download rejected."}));
    throw new ApiError(response.status,
      (detail as {message?:string}).message??"Excel download rejected.",detail);
  }
  const type=response.headers.get("content-type")??"";
  if(!type.includes(XLSX_MIME)){
    throw new Error("Server did not return a valid Excel workbook.");
  }
  const blob=await response.blob();
  assertRequestContext(contextVersion);
  downloadBlob(blob,filename);
}
