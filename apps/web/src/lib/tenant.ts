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
