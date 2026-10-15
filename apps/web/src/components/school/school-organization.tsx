import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

export function useSchoolOrganization(autoSelectSingle = true) {
  const queryClient = useQueryClient();
  const { data: activeOrganization, isPending: activePending } =
    authClient.useActiveOrganization();
  const { data: organizations, isPending: organizationsPending } =
    authClient.useListOrganizations();
  const [selectionError, setSelectionError] = useState<string | null>(null);

  useEffect(() => {
    const soleOrganizationId =
      organizations?.length === 1 ? organizations[0]?.id : undefined;
    if (
      !autoSelectSingle ||
      activePending ||
      organizationsPending ||
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
    organizations,
    organizationsPending,
    queryClient,
  ]);

  return {
    activeOrganization,
    organizations: organizations ?? [],
    isPending: activePending || organizationsPending,
    selectionError,
  };
}
