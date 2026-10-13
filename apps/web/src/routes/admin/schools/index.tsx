import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, School, Search } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { SchoolRow } from "@/components/superadmin/school-row";

export const Route = createFileRoute("/admin/schools/")({
  component: SchoolsListPage,
});

interface SchoolSummary {
  id: string;
  name: string;
  code: string;
  subdomain: string;
  createdAt: string;
  organization: { subscriptionStatus: string };
  students: { id: string }[];
  teachers: { id: string }[];
}

interface SchoolsListResponse {
  data: SchoolSummary[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

function SchoolsListPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const limit = 20;

  const { data, isPending } = useQuery({
    queryKey: ["superadmin", "schools", page],
    queryFn: () =>
      apiFetch<SchoolsListResponse>(
        `/super-admin/schools?page=${page}&limit=${limit}`,
      ),
  });

  const filtered = data?.data.filter(
    (s) =>
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Schools</h1>
          <p className="mt-1 text-sm text-slate-500">
            {data ? `${data.meta.total} schools registered` : "Loading…"}
          </p>
        </div>
        <Link
          to="/admin/schools/new"
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
        >
          <Plus className="size-4" />
          Enroll School
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          placeholder="Search schools by name or code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 sm:max-w-sm"
        />
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {isPending ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex items-center gap-3 text-sm text-slate-400">
              <span className="size-2 animate-pulse rounded-full bg-indigo-500" />
              Loading schools…
            </div>
          </div>
        ) : !filtered || filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <School className="mb-3 size-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-500">
              {search ? "No schools match your search" : "No schools enrolled yet"}
            </p>
            {!search && (
              <>
                <p className="mb-4 mt-1 text-xs text-slate-400">
                  Enroll your first school to get started
                </p>
                <Link
                  to="/admin/schools/new"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  Enroll a School
                </Link>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100">
                    {[
                      "School Name",
                      "Code",
                      "Students",
                      "Teachers",
                      "Subscription",
                      "Enrolled",
                      "",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((school) => (
                    <SchoolRow key={school.id} school={school} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {data && data.meta.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
                <p className="text-xs text-slate-500">
                  Page {data.meta.page} of {data.meta.totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={page >= data.meta.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
