import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronDown, CircleAlert } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export function useSchoolOrganization() {
  const queryClient = useQueryClient();
  const { data: activeOrganization, isPending: activePending } =
    authClient.useActiveOrganization();
  const { data: organizations, isPending: organizationsPending } =
    authClient.useListOrganizations();
  const [selectionError, setSelectionError] = useState<string | null>(null);

  useEffect(() => {
    if (
      activePending ||
      organizationsPending ||
      activeOrganization ||
      organizations?.length !== 1
    ) {
      return;
    }

    void authClient.organization
      .setActive({ organizationId: organizations[0]!.id })
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
    organizations,
    organizationsPending,
    queryClient,
  ]);

  async function selectOrganization(organizationId: string) {
    setSelectionError(null);
    try {
      const { error } = await authClient.organization.setActive({
        organizationId,
      });
      if (error) {
        setSelectionError(error.message ?? "Could not select your school.");
        return;
      }
      await queryClient.invalidateQueries();
    } catch (error) {
      setSelectionError(
        error instanceof Error ? error.message : "Could not select your school.",
      );
    }
  }

  return {
    activeOrganization,
    organizations: organizations ?? [],
    isPending: activePending || organizationsPending,
    selectionError,
    selectOrganization,
  };
}

export function SchoolOrganizationPicker({
  compact = false,
}: {
  compact?: boolean;
}) {
  const {
    activeOrganization,
    organizations,
    isPending,
    selectionError,
    selectOrganization,
  } = useSchoolOrganization();

  if (isPending || organizations.length === 0) return null;

  return (
    <div className="min-w-0">
      <label className="flex min-w-0 items-center gap-2">
        <Building2 className="size-4 shrink-0 text-indigo-600 dark:text-indigo-300" />
        <span className="sr-only">Active school</span>
        <select
          aria-label="Active school"
          value={activeOrganization?.id ?? ""}
          onChange={(event) => void selectOrganization(event.target.value)}
          className={`min-w-0 appearance-none rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-indigo-400/10 ${
            compact ? "max-w-44 py-2 pl-2.5 pr-7" : "w-full py-2.5 pl-3 pr-8"
          }`}
        >
          {!activeOrganization && <option value="">Select a school</option>}
          {organizations.map((organization) => (
            <option key={organization.id} value={organization.id}>
              {organization.name}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none -ml-7 size-3.5 shrink-0 text-slate-400" />
      </label>
      {selectionError && (
        <p role="alert" className="mt-1 flex items-center gap-1 text-[11px] text-rose-700 dark:text-rose-300">
          <CircleAlert className="size-3 shrink-0" />
          {selectionError}
        </p>
      )}
    </div>
  );
}
