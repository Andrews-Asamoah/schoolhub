import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Building2, Users } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { PageHeader } from "@/components/superadmin/page-header";
import { Pagination } from "@/components/superadmin/pagination";
import { SearchInput } from "@/components/superadmin/search-input";
import { EmptyPanel, ErrorPanel, LoadingPanel } from "@/components/superadmin/state-panels";
import { useDebouncedValue } from "@/components/superadmin/use-debounced-value";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/admin/users/")({
  component: SystemUsersPage,
});

interface PlatformUser {
  id: string;
  name: string;
  email: string;
  role: string;
  banned: boolean;
  twoFactorEnabled?: boolean;
  createdAt: string;
  members: {
    role: string;
    roles: string[];
    banned: boolean;
    organization: {
      name: string;
      school: { id: string; name: string; code: string } | null;
    };
  }[];
}

interface UsersResponse {
  data: PlatformUser[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const LIMIT = 20;

function SystemUsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [role, setRole] = useState("");
  const q = useDebouncedValue(search.trim());

  const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
  if (q) params.set("q", q);
  if (schoolId) params.set("schoolId", schoolId);
  if (role) params.set("role", role);

  const { data, isPending, error, isPlaceholderData, refetch } = useQuery({
    queryKey: ["superadmin", "users", params.toString()],
    queryFn: () => apiFetch<UsersResponse>(`/super-admin/users?${params.toString()}`),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const schools = useQuery({
    queryKey: ["superadmin", "school-options"],
    queryFn: () => apiFetch<{ id: string; name: string }[]>("/super-admin/schools/options"),
    staleTime: 5 * 60_000,
  });
  const users = data?.data;
  const filtersActive = Boolean(q || schoolId || role);
  const selectClass = "rounded-xl border border-input bg-card px-3 py-2.5 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

  const columns: DataTableColumn<PlatformUser>[] = [
    {
      id: "user",
      header: "User",
      value: (user) => `${user.name} (${user.email})`,
      cell: (user) => (
        <>
          <p className="text-sm font-semibold text-foreground">{user.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{user.email}</p>
        </>
      ),
    },
    { id: "role", header: "Platform role", value: (user) => user.role, cell: (user) => <span className="capitalize">{user.role}</span> },
    {
      id: "memberships",
      header: "School memberships",
      className: "max-w-sm",
      value: (user) =>
        user.members
          .map((member) => {
            const roles = [member.role, ...member.roles].filter((role, index, all) => all.indexOf(role) === index).join("/");
            return `${member.organization.school?.name ?? member.organization.name} (${roles})`;
          })
          .join("; "),
      cell: (user) => (
        <div className="flex flex-wrap gap-2">
          {user.members.map((member) => {
            const school = member.organization.school;
            return school ? (
              <Link
                key={school.id}
                to="/admin/schools/$schoolId"
                params={{ schoolId: school.id }}
                className="superadmin-button-secondary inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-primary/10 hover:text-primary"
                title={`${member.role}${member.banned ? " (membership suspended)" : ""}`}
              >
                <Building2 className="size-3.5" />
                {school.name}
                <span className="text-muted-foreground">
                  · {[member.role, ...member.roles].filter((role, index, all) => all.indexOf(role) === index).join(", ")}
                </span>
              </Link>
            ) : (
              <span key={member.organization.name} className="text-xs text-muted-foreground">
                {member.organization.name}
              </span>
            );
          })}
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      value: (user) => (user.banned ? "Suspended" : "Active"),
      cell: (user) => (
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", user.banned ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success")}>
          {user.banned ? "Suspended" : "Active"}
        </span>
      ),
    },
    {
      id: "twoFactor",
      header: "2FA",
      value: (user) => (user.twoFactorEnabled ? "On" : "Off"),
      cell: (user) => (
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", user.twoFactorEnabled ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>
          {user.twoFactorEnabled ? "On" : "Off"}
        </span>
      ),
    },
    {
      id: "joined",
      header: "Joined",
      value: (user) => user.createdAt.slice(0, 10),
      cell: (user) => <span className="whitespace-nowrap">{new Date(user.createdAt).toLocaleDateString()}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform management"
        title="System users"
        description="School users and their memberships. Platform super admins are excluded."
        actions={
          <div className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm shadow-sm">
            <span className="font-semibold text-foreground tabular-nums">{data?.meta.total.toLocaleString() ?? "—"}</span>
            <span className="ml-2 text-muted-foreground">{filtersActive ? "matching users" : "tenant users"}</span>
          </div>
        }
      />

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="grid gap-3 border-b border-border p-4 md:grid-cols-[1.5fr_1fr_1fr]">
          <SearchInput label="Search users" placeholder="Search every user by name or email…" value={search} onChange={(value) => { setSearch(value); setPage(1); }} />
          <Select value={schoolId || "__all__"} onValueChange={(value) => { setSchoolId(value === "__all__" ? "" : value); setPage(1); }}>
            <SelectTrigger aria-label="Filter by school" className={selectClass}><SelectValue placeholder="All schools" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All schools</SelectItem>
              {schools.data?.map((school) => <SelectItem key={school.id} value={school.id}>{school.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={role || "__all__"} onValueChange={(value) => { setRole(value === "__all__" ? "" : value); setPage(1); }}>
            <SelectTrigger aria-label="Filter by school role" className={selectClass}><SelectValue placeholder="All roles" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All roles</SelectItem>
              {["owner", "admin", "headteacher", "teacher", "accountant", "student", "guardian"].map((value) => (
                <SelectItem key={value} value={value} className="capitalize">{value}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isPending ? (
          <LoadingPanel label="Loading users…" />
        ) : error ? (
          <ErrorPanel message={`Users could not be loaded: ${error.message}`} onRetry={() => void refetch()} />
        ) : !users?.length ? (
          <EmptyPanel icon={<Users className="size-8" />} title="No users found" description={filtersActive ? "Try different filters or a different search." : "School user accounts will appear here."} />
        ) : (
          <>
            <div className={cn("transition-opacity", isPlaceholderData && "opacity-60")}>
              <DataTable
                embedded
                searchable={false}
                paginate={false}
                canExport
                rows={users}
                columns={columns}
                getRowId={(user) => user.id}
                exportTitle="Platform users"
                emptyTitle="No users"
                emptyDescription="No users to show."
              />
            </div>
            {data && <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} limit={LIMIT} onChange={setPage} />}
          </>
        )}
      </section>
    </div>
  );
}
