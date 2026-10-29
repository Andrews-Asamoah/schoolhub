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

export function getClientSubdomain(): string | null {
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
    // An administrator-issued password is still in force: every business
    // endpoint refuses until it is replaced, so send the user to do that.
    if (
      res.status === 403 &&
      (body as { error?: string }).error === "PASSWORD_CHANGE_REQUIRED" &&
      typeof window !== "undefined" &&
      window.location.pathname !== "/change-password"
    ) {
      window.location.assign("/change-password");
    }
    // The school's subscription is suspended, cancelled or expired: every
    // business endpoint refuses, so show one clear explanation instead of
    // a page full of failed requests.
    if (
      res.status === 403 &&
      (body as { error?: string }).error === "SUBSCRIPTION_INACTIVE" &&
      typeof window !== "undefined" &&
      window.location.pathname !== "/subscription-inactive"
    ) {
      const reason = (body as { reason?: string }).reason ?? "EXPIRED";
      window.location.assign(`/subscription-inactive?reason=${encodeURIComponent(reason)}`);
    }
    // A second factor is mandatory for this account but not set up yet.
    if (
      res.status === 403 &&
      (body as { error?: string }).error === "TWO_FACTOR_REQUIRED" &&
      typeof window !== "undefined" &&
      window.location.pathname !== "/two-factor-setup"
    ) {
      const audience = (body as { audience?: string }).audience ?? "school-admin";
      window.location.assign(`/two-factor-setup?audience=${encodeURIComponent(audience)}`);
    }
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

/**
 * Downloads a binary export through the authenticated API client. This mirrors
 * the tenant and active-role headers used by apiFetch and honors the server's
 * Content-Disposition filename.
 */
async function apiBinary(path: string): Promise<Response> {
  const headers = new Headers();
  const subdomain = getClientSubdomain();
  if (subdomain) headers.set("x-school-subdomain", subdomain);

  if (typeof window !== "undefined" && path !== "/schools/roles") {
    const activeRole = window.localStorage.getItem("schoolhub-active-role");
    if (activeRole) headers.set("x-school-role", activeRole);
    if (activeRole === "accountant") {
      const period = window.sessionStorage.getItem("schoolhub-accountant-academic-view");
      if (period) {
        try {
          const parsed = JSON.parse(period) as { academicYearId?: unknown; termId?: unknown };
          if (typeof parsed.academicYearId === "string" && typeof parsed.termId === "string") {
            headers.set("x-academic-year-id", parsed.academicYearId);
            headers.set("x-academic-term-id", parsed.termId);
          }
        } catch {
          window.sessionStorage.removeItem("schoolhub-accountant-academic-view");
        }
      }
    }
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (response.status === 403 && (body as { error?: string }).error === "PASSWORD_CHANGE_REQUIRED" && typeof window !== "undefined" && window.location.pathname !== "/change-password") {
      window.location.assign("/change-password");
    }
    if (response.status === 403 && (body as { error?: string }).error === "TWO_FACTOR_REQUIRED" && typeof window !== "undefined" && window.location.pathname !== "/two-factor-setup") {
      const audience = (body as { audience?: string }).audience ?? "school-admin";
      window.location.assign(`/two-factor-setup?audience=${encodeURIComponent(audience)}`);
    }
    if (response.status === 403 && (body as { error?: string }).error === "SUBSCRIPTION_INACTIVE" && typeof window !== "undefined" && window.location.pathname !== "/subscription-inactive") {
      const reason = (body as { reason?: string }).reason ?? "EXPIRED";
      window.location.assign(`/subscription-inactive?reason=${encodeURIComponent(reason)}`);
    }
    throw new ApiError(response.status, (body as { message?: string }).message ?? response.statusText, body);
  }

  return response;
}

export async function apiBlob(path: string): Promise<Blob> {
  return (await apiBinary(path)).blob();
}

export async function apiDownload(path: string, fallbackFileName?: string): Promise<void> {
  const response = await apiBinary(path);
  const disposition = response.headers.get("content-disposition") ?? "";
  const encodedName = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const plainName = /filename="?([^";]+)"?/i.exec(disposition)?.[1];
  const fileName = fallbackFileName ?? (encodedName ? decodeURIComponent(encodedName) : plainName) ?? "schoolhub-export";
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName.replace(/[\\/:*?"<>|]/g, "_");
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Authenticated, private PDF download; no public file URL is created. */
export async function downloadAcademicReport(path: string, filename: string): Promise<void> {
  const headers = new Headers();
  const school = getClientSubdomain();
  if (school) headers.set("x-school-subdomain", school);
  const role = typeof window !== "undefined" ?
    window.localStorage.getItem("schoolhub-active-role") : null;
  if (role) headers.set("x-school-role", role);
  const result = await fetch(`${API_BASE}${path}`,{
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
  const url = URL.createObjectURL(file);
  try {
    const a = document.createElement("a"); a.href=url;a.download=filename;
    document.body.appendChild(a);a.click();a.remove();
  } finally { URL.revokeObjectURL(url); }
}

/** Authenticated Excel downloads. The file is never exposed on a public URL. */
export async function downloadPrivateExcel(path:string,filename:string):Promise<void>{
  const headers=new Headers();
  const school=getClientSubdomain();
  if(school)headers.set("x-school-subdomain",school);
  if(typeof window!=="undefined"){
    const role=window.localStorage.getItem("schoolhub-active-role");
    if(role)headers.set("x-school-role",role);
  }
  const response=await fetch(`${API_BASE}${path}`,{
    credentials:"include",headers,cache:"no-store",
  });
  if(!response.ok){
    const detail=await response.json().catch(()=>({message:"Excel download rejected."}));
    throw new ApiError(response.status,
      (detail as {message?:string}).message??"Excel download rejected.",detail);
  }
  const type=response.headers.get("content-type")??"";
  if(!type.includes("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")){
    throw new Error("Server did not return a valid Excel workbook.");
  }
  const url=URL.createObjectURL(await response.blob());
  try{
    const a=document.createElement("a");
    a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
  }finally{URL.revokeObjectURL(url);}
}
