import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { useTenantSchool } from "@/lib/tenant";

export function useSchoolOrganization(autoSelectSingle = true) {
  const queryClient = useQueryClient();
  const { data: activeOrganization, isPending: activePending } =
    authClient.useActiveOrganization();
  const { data: organizations, isPending: organizationsPending } =
    authClient.useListOrganizations();
  const { school: tenantSchool, isTenantSite, isLoading: tenantLoading } = useTenantSchool();
  const [selectionError, setSelectionError] = useState<string | null>(null);

  useEffect(() => {
    if (activePending || organizationsPending || tenantLoading) return;

    // 1. If on a tenant subdomain, lock and auto-select that school's organization
    if (isTenantSite && tenantSchool) {
      const targetOrgId = tenantSchool.organizationId;
      const isMember = organizations?.some((org) => org.id === targetOrgId);

      if (organizations && organizations.length > 0 && !isMember) {
        setSelectionError(
          `Your account is not registered under ${tenantSchool.name}. You cannot access this school portal.`,
        );
        return;
      }

      if (activeOrganization?.id !== targetOrgId && targetOrgId) {
        void authClient.organization
          .setActive({ organizationId: targetOrgId })
          .then(({ error }) => {
            if (error) {
              setSelectionError(error.message ?? "Could not connect to this school.");
              return;
            }
            setSelectionError(null);
            return queryClient.invalidateQueries();
          })
          .catch((error: unknown) => {
            setSelectionError(
              error instanceof Error ? error.message : "Could not connect to this school.",
            );
          });
      }
      return;
    }

    // 2. Default single-org fallback on root/central domain
    const soleOrganizationId =
      organizations?.length === 1 ? organizations[0]?.id : undefined;
    if (
      !autoSelectSingle ||
      activeOrganization ||
      !soleOrganizationId
    ) {
      return;
    }

    void authClient.organization
      .setActive({ organizationId: soleOrganizationId })
      .then(({ error }) => {
        if (error) {
          setSelectionError(error.message ?? "Could not select your school.");
          return;
        }
        setSelectionError(null);
        return queryClient.invalidateQueries();
      })
      .catch((error: unknown) => {
        setSelectionError(
          error instanceof Error ? error.message : "Could not select your school.",
        );
      });
  }, [
    activeOrganization,
    activePending,
    autoSelectSingle,
    isTenantSite,
    organizations,
    organizationsPending,
    queryClient,
    tenantLoading,
    tenantSchool,
  ]);

  return {
    activeOrganization,
    organizations: organizations ?? [],
    isPending: activePending || organizationsPending || tenantLoading,
    selectionError,
    tenantSchool,
    isTenantSite,
  };
}
