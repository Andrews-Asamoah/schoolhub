import { getTenantSubdomain } from "./tenant-subdomain";
export { getTenantSubdomain } from "./tenant-subdomain";
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
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return `${protocol}//${subdomain}.localhost${port}${path}`;
  }

  // If on schoolhub root domain
  if (hostname.includes("schoolhub.")) {
    const domainParts = hostname.split(".");
    const baseDomain = domainParts.slice(-2).join("."); // e.g. "schoolhub.gh"
    return `${protocol}//${subdomain}.${baseDomain}${port}${path}`;
  }

  // Fallback query parameter
  const url = new URL(path, `${protocol}//${hostname}${port}`);
  url.searchParams.set("school", subdomain);
  return url.href;
}
