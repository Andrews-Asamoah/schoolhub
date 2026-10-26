import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, UserRoundCog } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useSchoolOrganization } from "@/components/school/school-organization";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ACTIVE_ROLE_STORAGE_KEY = "schoolhub-active-role";
const ROLE_CHANGE_EVENT = "schoolhub-role-change";

const roleLabels: Record<string, string> = {
  owner: "School owner",
  admin: "Administrator",
  headteacher: "Headteacher",
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
    primaryRole: query.data?.primaryRole ?? null,
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
      <span
        role="alert"
        className="inline-flex items-center gap-1.5 rounded-md border border-destructive/20 bg-destructive/10 px-2.5 py-1 text-xs text-destructive"
      >
        <CircleAlert className="size-3.5 shrink-0" />
        Role unavailable: {error.message}
      </span>
    );
  }
  if (!activeRole) return null;

  // Single role static badge
  if (roles.length <= 1) {
    return (
      <div className="flex h-9 min-w-0 items-center gap-2 rounded-lg border border-border/80 bg-card/90 px-3 text-xs font-semibold text-foreground/80 shadow-xs">
        <UserRoundCog className="size-4 shrink-0 text-primary" />
        <span className="truncate max-w-[min(6.5rem,24vw)] sm:max-w-44">
          {roleLabels[activeRole] ?? activeRole}
        </span>
      </div>
    );
  }

  return (
    <Select value={activeRole} onValueChange={(val) => void selectRole(val)}>
      <SelectTrigger aria-label="Switch school role" className="group h-9 max-w-[min(9rem,32vw)] gap-1.5 px-2 sm:max-w-44 sm:gap-2 sm:px-3 cursor-pointer">
        <UserRoundCog className="size-4 shrink-0 text-primary" />
        <SelectValue>
          <span className="block max-w-[min(5.5rem,22vw)] truncate text-left sm:max-w-40">
            {roleLabels[activeRole] ?? activeRole}
          </span>
        </SelectValue>
      </SelectTrigger>

      <SelectContent align="end">
        {roles.map((role) => (
          <SelectItem key={role} value={role}>
            {roleLabels[role] ?? role}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}