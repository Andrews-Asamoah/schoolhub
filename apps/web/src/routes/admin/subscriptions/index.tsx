import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, CircleAlert, CreditCard } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { SubscriptionBadge } from "@/components/superadmin/subscription-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

export const Route = createFileRoute("/admin/subscriptions/")({
  component: SubscriptionsPage,
});

interface SchoolSubscription {
  id: string;
  name: string;
  code: string;
  subdomain: string;
  createdAt: string;
  organization: { subscriptionStatus: string; expiresAt: string | null };
}

interface SchoolsResponse {
  data: SchoolSubscription[];
  meta: { total: number; page: number; totalPages: number };
}

function SubscriptionsPage() {
  const [page, setPage] = useState(1);
  const { data, isPending, error } = useQuery({
    queryKey: ["superadmin", "subscriptions", page],
    queryFn: () =>
      apiFetch<SchoolsResponse>(`/super-admin/schools?page=${page}&limit=20`),
    retry: false,
  });

  const columns: DataTableColumn<SchoolSubscription>[] = [
    {
      id: "school",
      header: "School",
      value: (school) => `${school.name} (${school.code} · ${school.subdomain})`,
      cell: (school) => (
        <>
          <p className="text-sm font-semibold text-foreground">{school.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{school.code} · {school.subdomain}</p>
        </>
      ),
    },
    {
      id: "status",
      header: "Status",
      value: (school) => school.organization.subscriptionStatus,
      cell: (school) => <SubscriptionBadge status={school.organization.subscriptionStatus} />,
    },
    {
      id: "expires",
      header: "Expires",
      value: (school) => school.organization.expiresAt?.slice(0, 10) ?? "No expiry set",
      cell: (school) => (school.organization.expiresAt ? new Date(school.organization.expiresAt).toLocaleDateString() : "No expiry set"),
    },
    {
      id: "enrolled",
      header: "Enrolled",
      value: (school) => school.createdAt.slice(0, 10),
      cell: (school) => <span className="whitespace-nowrap">{new Date(school.createdAt).toLocaleDateString()}</span>,
    },
    {
      id: "actions",
      header: "",
      className: "text-right",
      cell: (school) => (
        <Link
          to="/admin/schools/$schoolId"
          params={{ schoolId: school.id }}
          className="superadmin-button-secondary inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-50"
        >
          Manage <ArrowUpRight className="size-3.5" />
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600">Platform management</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Subscriptions</h1>
          <p className="mt-1 text-sm text-slate-500">Review each school’s current subscription status and expiry.</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
          <span className="font-semibold text-slate-900">{data?.meta.total ?? "—"}</span>
          <span className="ml-2 text-slate-500">school subscriptions</span>
        </div>
      </header>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {isPending ? (
          <div className="p-10 text-center text-sm text-slate-500">Loading subscriptions…</div>
        ) : error ? (
          <div role="alert" className="flex items-center gap-3 p-8 text-sm text-rose-700">
            <CircleAlert className="size-4 shrink-0" />
            Subscriptions could not be loaded: {error.message}
          </div>
        ) : !data?.data.length ? (
          <div className="flex flex-col items-center p-12 text-center">
            <CreditCard className="mb-3 size-8 text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">No subscriptions yet</p>
            <p className="mt-1 text-xs text-slate-500">Enroll a school to see its subscription here.</p>
          </div>
        ) : (
          <>
            <DataTable
              embedded
              paginate={false}
              canExport
              rows={data.data}
              columns={columns}
              getRowId={(school) => school.id}
              exportTitle="Subscriptions"
              emptyTitle="No subscriptions"
              emptyDescription="No subscriptions to show."
            />
            {data.meta.totalPages > 1 && (
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
