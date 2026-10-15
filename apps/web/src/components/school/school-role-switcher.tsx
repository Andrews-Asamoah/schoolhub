import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, UserRoundCog } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useSchoolOrganization } from "@/components/school/school-organization";

const ACTIVE_ROLE_STORAGE_KEY = "schoolhub-active-role";
const ROLE_CHANGE_EVENT = "schoolhub-role-change";

const roleLabels: Record<string, string> = {
  owner: "School owner",
  admin: "Administrator",
  headmistress: "Headmistress",
  teacher: "Teacher",
  accountant: "Accountant",
  staff: "Staff",
  student: "Student",
  guardian: "Parent / guardian",
};

export function schoolRoleLabel(role: string | null | undefined) {
  return role ? roleLabels[role] ?? role : "School member";
}

interface SchoolRoles {
  primaryRole: string;
  roles: string[];
}

export function useSchoolRole() {
  const { activeOrganization, organizations } = useSchoolOrganization(false);
  const queryClient = useQueryClient();
  const [storedRole, setStoredRole] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem(ACTIVE_ROLE_STORAGE_KEY),
  );
  const query = useQuery({
    queryKey: ["schools", "roles"],
    queryFn: () => apiFetch<SchoolRoles>("/schools/roles"),
    enabled: !!activeOrganization && organizations.length === 1,
    retry: false,
  });

  useEffect(() => {
    const syncRole = () =>
      setStoredRole(window.localStorage.getItem(ACTIVE_ROLE_STORAGE_KEY));
    window.addEventListener(ROLE_CHANGE_EVENT, syncRole);
    window.addEventListener("storage", syncRole);
    return () => {
      window.removeEventListener(ROLE_CHANGE_EVENT, syncRole);
      window.removeEventListener("storage", syncRole);
    };
  }, []);

  useEffect(() => {
    if (!query.data) return;
    if (storedRole && !query.data.roles.includes(storedRole)) {
      window.localStorage.removeItem(ACTIVE_ROLE_STORAGE_KEY);
      setStoredRole(null);
      window.dispatchEvent(new Event(ROLE_CHANGE_EVENT));
    }
  }, [query.data, storedRole]);

  const activeRole =
    query.data?.roles.includes(storedRole ?? "")
      ? storedRole!
      : query.data?.primaryRole ?? null;

  async function selectRole(role: string) {
    if (!query.data?.roles.includes(role)) return;
    window.localStorage.setItem(ACTIVE_ROLE_STORAGE_KEY, role);
    setStoredRole(role);
    window.dispatchEvent(new Event(ROLE_CHANGE_EVENT));
    await queryClient.invalidateQueries();
  }

  return {
    activeRole,
    roles: query.data?.roles ?? [],
    isPending: query.isPending,
    error: query.error,
    selectRole,
  };
}

export function SchoolRoleSwitcher() {
  const { activeRole, roles, isPending, error, selectRole } = useSchoolRole();
  if (isPending) return null;
  if (error) {
    return (
      <span role="alert" className="inline-flex items-center gap-1.5 text-xs text-rose-700 dark:text-rose-300">
        <CircleAlert className="size-3.5" />
        Role unavailable: {error.message}
      </span>
    );
  }
  if (!activeRole) return null;

  return (
    <label className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm dark:border-white/10 dark:bg-slate-900 dark:text-slate-200">
      <UserRoundCog className="size-4 shrink-0 text-indigo-600 dark:text-indigo-300" />
      <span className="sr-only">Active role</span>
      <select
        aria-label="Switch role"
        value={activeRole}
        disabled={roles.length < 2}
        onChange={(event) => void selectRole(event.target.value)}
        className="max-w-36 cursor-pointer bg-transparent outline-none disabled:cursor-default sm:max-w-44"
      >
        {roles.map((role) => (
          <option key={role} value={role}>
            {roleLabels[role] ?? role}
          </option>
        ))}
      </select>
    </label>
  );
}
