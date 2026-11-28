import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Users } from "lucide-react";
import { PLATFORM_SCHOOL_ROLES, platformSchoolRoleLabels, type PlatformSchoolRole } from "@schoolhub/shared";
import { apiFetch, errorText } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { confirmAction } from "@/components/ui/confirm-host";
import { toast } from "@/components/ui/toaster";
import { CredentialsDialog, type CredentialEntry } from "@/components/credentials/credentials-dialog";
import { PageHeader } from "@/components/superadmin/page-header";
import { Pagination } from "@/components/superadmin/pagination";
import { SearchInput } from "@/components/superadmin/search-input";
import { EmptyPanel, ErrorPanel, LoadingPanel } from "@/components/superadmin/state-panels";
import { useDebouncedValue } from "@/lib/use-debounced-value";

export const Route = createFileRoute("/admin/users/")({ component: PlatformTeamPage });

interface School {
  id: string;
  name: string;
  subdomain: string;
}

interface Employee {
  id: string;
  name: string;
  email: string;
  banned: boolean;
  twoFactorEnabled: boolean;
  platformSchoolGrants: { role: PlatformSchoolRole; school: School }[];
}

interface TeamResponse {
  data: Employee[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const LIMIT = 20;
const field = "rounded-lg border border-input bg-background px-3 py-2 text-sm";

function PlatformTeamPage() {
  const cache = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [editing, setEditing] = useState<string>();
  const [schoolId, setSchoolId] = useState("");
  const [role, setRole] = useState<PlatformSchoolRole | "">("");
  const [issued, setIssued] = useState<CredentialEntry | null>(null);
  const q = useDebouncedValue(search.trim());
  const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
  if (q) params.set("q", q);
  const query = useQuery({
    queryKey: ["superadmin", "users", params.toString()],
    queryFn: () => apiFetch<TeamResponse>(`/super-admin/users?${params}`),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const schools = useQuery({
    queryKey: ["superadmin", "school-options"],
    queryFn: () => apiFetch<School[]>("/super-admin/schools/options"),
    enabled: !!editing,
  });
  const invite = useMutation({
    mutationFn: (input: { name: string; email: string }) => apiFetch<{ name: string; credentials: CredentialEntry["credentials"] }>(
      "/super-admin/users", { method: "POST", body: JSON.stringify(input) },
    ),
  });
  const updateRole = useMutation({
    mutationFn: (input: { userId: string; schoolId: string; role: PlatformSchoolRole | null }) =>
      apiFetch(`/super-admin/users/${input.userId}/schools/${input.schoolId}`, {
        method: "PATCH", body: JSON.stringify({ role: input.role }),
      }),
  });
  const setSuspended = useMutation({
    mutationFn: (employee: Employee) => apiFetch(`/super-admin/users/${employee.id}/status`, {
      method: "PATCH", body: JSON.stringify({ banned: !employee.banned }),
    }),
  });
  const refresh = () => cache.invalidateQueries({ queryKey: ["superadmin", "users"] });

  async function addEmployee(event: FormEvent) {
    event.preventDefault();
    try {
      const account = await invite.mutateAsync({ name, email });
      setIssued({ label: account.name, credentials: account.credentials });
      setName("");
      setEmail("");
      await refresh();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      invite.reset();
    }
  }

  async function saveAssignment(event: FormEvent) {
    event.preventDefault();
    if (!editing || !schoolId) return;
    try {
      await updateRole.mutateAsync({ userId: editing, schoolId, role: role || null });
      setEditing(undefined);
      toast.success(role ? "School assignment saved." : "School assignment removed.");
      await refresh();
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  async function changeStatus(employee: Employee) {
    if (!employee.banned && !await confirmAction({
      title: `Suspend ${employee.name}?`, description: "This signs them out and blocks access to their assigned schools.",
      confirmLabel: "Suspend", danger: true,
    })) return;
    try {
      await setSuspended.mutateAsync(employee);
      toast.success(employee.banned ? "Platform access restored." : "Account suspended.");
      await refresh();
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  const columns: DataTableColumn<Employee>[] = [
    { id: "name", header: "Employee", value: (employee) => employee.name,
      cell: (employee) => <><p className="font-semibold">{employee.name}</p><p className="text-xs text-muted-foreground">{employee.email}</p></> },
    { id: "schools", header: "School assignments", value: (employee) => employee.platformSchoolGrants.map(({ school }) => school.name).join(", "),
      cell: (employee) => employee.platformSchoolGrants.length ? (
        <ul className="space-y-1">
          {employee.platformSchoolGrants.map(({ school, role: schoolRole }) => (
            <li key={school.id} className="text-sm">
              <Link to="/admin/schools/$schoolId" params={{ schoolId: school.subdomain }} className="font-semibold text-primary hover:underline">{school.name}</Link>
              <span className="ml-2 text-xs text-muted-foreground">{platformSchoolRoleLabels[schoolRole]}</span>
            </li>
          ))}
        </ul>
      ) : <span className="text-muted-foreground">No schools assigned</span> },
    { id: "status", header: "Status", value: (employee) => employee.banned ? "Suspended" : "Active",
      cell: (employee) => <span>{employee.banned ? "Suspended" : employee.twoFactorEnabled ? "Active · 2FA enabled" : "Active · 2FA pending"}</span> },
    { id: "actions", header: "Actions", cell: (employee) => (
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => { setEditing(employee.id); setSchoolId(""); setRole(""); }}>
          Assign schools
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={setSuspended.isPending} onClick={() => void changeStatus(employee)}>
          {employee.banned ? "Restore access" : "Suspend"}
        </Button>
      </div>
    ) },
  ];
  const employee = query.data?.data.find((person) => person.id === editing);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Platform management" title="Platform team"
        description="Create employee accounts and delegate access to specific schools." />
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-3 font-semibold">Add an employee</h2>
        <form onSubmit={(event) => void addEmployee(event)} className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm">Full name<input className={field} value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} /></label>
          <label className="grid gap-1 text-sm">Work email<input className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <Button disabled={invite.isPending}>{invite.isPending ? "Creating…" : "Create account"}</Button>
        </form>
      </section>
      {employee && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-3 font-semibold">School assignments for {employee.name}</h2>
          {schools.error && <ErrorPanel message="Schools could not be loaded." onRetry={() => void schools.refetch()} />}
          <form onSubmit={(event) => void saveAssignment(event)} className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm">School<select className={field} required value={schoolId} disabled={schools.isPending} onChange={(e) => {
              const selected = e.target.value;
              setSchoolId(selected);
              setRole(employee.platformSchoolGrants.find((grant) => grant.school.id === selected)?.role ?? "");
            }}>
              <option value="">{schools.isPending ? "Loading schools…" : "Choose a school"}</option>
              {schools.data?.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
            </select></label>
            <label className="grid gap-1 text-sm">Access role<select className={field} value={role} onChange={(e) => setRole(e.target.value as PlatformSchoolRole | "")}>
              <option value="">No access</option>
              {PLATFORM_SCHOOL_ROLES.map((value) => <option key={value} value={value}>{platformSchoolRoleLabels[value]}</option>)}
            </select></label>
            <Button disabled={!schoolId || updateRole.isPending}>Save assignment</Button>
            <Button type="button" variant="ghost" disabled={updateRole.isPending} onClick={() => setEditing(undefined)}>Cancel</Button>
          </form>
          <p className="mt-3 text-sm text-muted-foreground">School support can view assigned schools and subscription status. Desktop access managers can also change whether each assigned school can use the desktop app.</p>
        </section>
      )}
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border p-4">
          <SearchInput label="Search employees" placeholder="Search by name or work email…" value={search} onChange={(value) => { setSearch(value); setPage(1); setEditing(undefined); }} />
        </div>
        {query.isPending ? <LoadingPanel label="Loading the platform team…" /> :
          query.error ? <ErrorPanel message={query.error.message} onRetry={() => void query.refetch()} /> :
          !query.data?.data.length ? <EmptyPanel icon={<Users className="size-8" />} title="No employees found" description="Create an account or change your search." /> :
          <>
            <DataTable embedded searchable={false} paginate={false} rows={query.data.data} columns={columns} getRowId={(person) => person.id} emptyTitle="No employees" emptyDescription="Create a platform employee account." />
            <Pagination page={query.data.meta.page} totalPages={query.data.meta.totalPages} total={query.data.meta.total} limit={LIMIT} onChange={(next) => { setEditing(undefined); setPage(next); }} />
          </>}
      </section>
      {issued && <CredentialsDialog entries={[issued]} onClose={() => setIssued(null)} />}
    </div>
  );
}
