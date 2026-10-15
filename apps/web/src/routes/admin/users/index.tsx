import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Building2, ChevronLeft, ChevronRight, CircleAlert, Search, Users } from "lucide-react";
import { apiFetch } from "@/lib/api";

export const Route = createFileRoute("/admin/users/")({
  component: SystemUsersPage,
});

interface PlatformUser {
  id: string;
  name: string;
  email: string;
  role: string;
  banned: boolean;
  createdAt: string;
  members: {
    role: string;
    banned: boolean;
    organization: {
      name: string;
      school: { id: string; name: string; code: string } | null;
    };
  }[];
}

interface UsersResponse {
  data: PlatformUser[];
  meta: { total: number; page: number; totalPages: number };
}

function SystemUsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const { data, isPending, error } = useQuery({
    queryKey: ["superadmin", "users", page],
    queryFn: () =>
      apiFetch<UsersResponse>(`/super-admin/users?page=${page}&limit=20`),
    retry: false,
  });
  const users = data?.data.filter((user) => {
    const term = search.toLowerCase();
    return (
      !term ||
      user.name.toLowerCase().includes(term) ||
      user.email.toLowerCase().includes(term) ||
      user.members.some((member) =>
        member.organization.name.toLowerCase().includes(term),
      )
    );
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600">Platform management</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">System users</h1>
          <p className="mt-1 text-sm text-slate-500">
            School users and their organization memberships. Platform super admins are excluded.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
          <span className="font-semibold text-slate-900">{data?.meta.total ?? "—"}</span>
          <span className="ml-2 text-slate-500">tenant users</span>
        </div>
      </header>

      <label className="relative block sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search this page by name, email, or school"
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
      </label>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {isPending ? (
          <div className="p-10 text-center text-sm text-slate-500">Loading users…</div>
        ) : error ? (
          <div role="alert" className="flex items-center gap-3 p-8 text-sm text-rose-700">
            <CircleAlert className="size-4 shrink-0" />
            Users could not be loaded: {error.message}
          </div>
        ) : !users?.length ? (
          <div className="flex flex-col items-center p-12 text-center">
            <Users className="mb-3 size-8 text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">No users found</p>
            <p className="mt-1 text-xs text-slate-500">
              {search ? "Try a different search." : "School user accounts will appear here."}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left">
                <thead className="bg-slate-50">
                  <tr className="border-b border-slate-100">
                    {["User", "Platform role", "School memberships", "Status", "Joined"].map((heading) => (
                      <th key={heading} className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-slate-800">{user.name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{user.email}</p>
                      </td>
                      <td className="px-5 py-4 text-sm capitalize text-slate-600">{user.role}</td>
                      <td className="max-w-sm px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          {user.members.map((member) => {
                            const school = member.organization.school;
                            return school ? (
                              <Link
                                key={school.id}
                                to="/admin/schools/$schoolId"
                                params={{ schoolId: school.id }}
                                className="superadmin-button-secondary inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-indigo-50 hover:text-indigo-900"
                                title={`${member.role}${member.banned ? " (membership suspended)" : ""}`}
                              >
                                <Building2 className="size-3.5" />
                                {school.name}
                                <span className="text-slate-400">· {member.role}</span>
                              </Link>
                            ) : (
                              <span key={member.organization.name} className="text-xs text-slate-500">
                                {member.organization.name}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${user.banned ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
                          {user.banned ? "Suspended" : "Active"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-500">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data && data.meta.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
                <span className="text-xs text-slate-500">Page {data.meta.page} of {data.meta.totalPages}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((current) => current - 1)}
                    className="superadmin-button-page rounded-lg border border-slate-200 p-2 text-slate-700 disabled:opacity-40"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <button
                    type="button"
                    disabled={page >= data.meta.totalPages}
                    onClick={() => setPage((current) => current + 1)}
                    className="superadmin-button-page rounded-lg border border-slate-200 p-2 text-slate-700 disabled:opacity-40"
                    aria-label="Next page"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
