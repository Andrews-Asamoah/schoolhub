import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";

export interface SchoolPublicInfo {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  subdomain: string;
  logo?: string | null;
  motto?: string | null;
  primaryColor?: string;
  secondaryColor?: string;
  currency?: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

const RESERVED_SUBDOMAINS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "staging",
  "demo",
  "mail",
  "docs",
]);

/**
 * Extracts the current school subdomain from hostname or query override.
 *
 * Supported formats:
 * - Production: `achimota.schoolhub.gh`, `presec.schoolhub.app`
 * - Localhost dev: `achimota.localhost:5173`
 * - Dev query override: `?school=achimota` or `?subdomain=achimota`
 */
export function getTenantSubdomain(): string | null {
  if (typeof window === "undefined") return null;

  // 1. Check URL query override (handy for testing in development)
  const params = new URLSearchParams(window.location.search);
  const override = params.get("school") || params.get("subdomain");
  if (override && override.trim().length > 0) {
    const cleanOverride = override.trim().toLowerCase();
    if (!RESERVED_SUBDOMAINS.has(cleanOverride)) {
      return cleanOverride;
    }
  }

  // 2. Parse hostname
  const hostname = window.location.hostname.toLowerCase();

  // Localhost subdomain: e.g. "achimota.localhost"
  if (hostname.endsWith(".localhost")) {
    const parts = hostname.split(".");
    if (parts.length >= 2) {
      const sub = parts[0]?.toLowerCase();
      if (sub && !RESERVED_SUBDOMAINS.has(sub)) {
        return sub;
      }
    }
  }

  // Multi-part domain: e.g. "achimota.schoolhub.gh" or "presec.schoolhub.app"
  const parts = hostname.split(".");
  if (parts.length >= 3) {
    const sub = parts[0]?.toLowerCase();
    if (sub && !RESERVED_SUBDOMAINS.has(sub)) {
      return sub;
    }
  }

  return null;
}

/**
 * Hook to retrieve public school information based on current subdomain.
 */
export function useTenantSchool() {
  const subdomain = getTenantSubdomain();

  const query = useQuery({
    queryKey: ["tenant-school-public", subdomain],
    queryFn: async () => {
      if (!subdomain) return null;
      return apiFetch<SchoolPublicInfo>(`/schools/public/${subdomain}`);
    },
    enabled: Boolean(subdomain),
    staleTime: 1000 * 60 * 15, // Cache for 15 minutes
    retry: 1,
  });

  return {
    subdomain,
    isTenantSite: Boolean(subdomain),
    school: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}

/**
 * Builds the canonical portal URL for a school.
 */
export function buildSchoolPortalUrl(subdomain: string, path = "/"): string {
  if (typeof window === "undefined") return path;

  const hostname = window.location.hostname;
  const port = window.location.port ? `:${window.location.port}` : "";
  const protocol = window.location.protocol;

  // If local development on localhost
  if (hostname.includes("localhost")) {
    return `${protocol}//${subdomain}.localhost${port}${path}`;
  }

  // If on schoolhub root domain
  if (hostname.includes("schoolhub.")) {
    const domainParts = hostname.split(".");
    const baseDomain = domainParts.slice(-2).join("."); // e.g. "schoolhub.gh"
    return `${protocol}//${subdomain}.${baseDomain}${port}${path}`;
  }

  // Fallback query parameter
  return `${protocol}//${hostname}${port}${path}?school=${subdomain}`;
}
