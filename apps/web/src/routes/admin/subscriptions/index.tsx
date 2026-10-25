import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowUpRight, Clock, CreditCard, Hourglass, PauseCircle, Settings2, ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { describeExpiry, formatDate } from "@/lib/subscription";
import { SubscriptionBadge } from "@/components/superadmin/subscription-badge";
import { SubscriptionDialog, type SubscriptionTarget } from "@/components/superadmin/subscription-dialog";
import { StatCard } from "@/components/superadmin/stat-card";
import { PageHeader } from "@/components/superadmin/page-header";
import { SearchInput } from "@/components/superadmin/search-input";
import { FilterChips } from "@/components/superadmin/filter-chips";
import { Pagination } from "@/components/superadmin/pagination";
import { EmptyPanel, ErrorPanel, LoadingPanel } from "@/components/superadmin/state-panels";
import { useDebouncedValue } from "@/components/superadmin/use-debounced-value";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/subscriptions/")({
  component: SubscriptionsPage,
});

interface SchoolSubscription extends SubscriptionTarget {
  code: string;
  subdomain: string;
  createdAt: string;
  _count: { students: number; teachers: number };
}

interface SchoolsResponse {
  data: SchoolSubscription[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

interface PlatformStats {
  totalSchools: number;
  activeSubscriptions: number;
  trialing: number;
  pastDue: number;
  suspended: number;
  cancelled: number;
  expiringSoon: number;
  lapsed: number;
}

type Filter = "all" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELLED" | "expiring" | "lapsed";

const LIMIT = 15;

function SubscriptionsPage() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [managing, setManaging] = useState<SubscriptionTarget | null>(null);
  const q = useDebouncedValue(search.trim());

  const stats = useQuery({
    queryKey: ["superadmin", "stats"],
    queryFn: () => apiFetch<PlatformStats>("/super-admin/stats"),
  });

  const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
  if (q) params.set("q", q);
  if (filter === "expiring" || filter === "lapsed") params.set("expiry", filter);
  else if (filter !== "all") params.set("status", filter);

  const schools = useQuery({
    queryKey: ["superadmin", "subscriptions", params.toString()],
    queryFn: () => apiFetch<SchoolsResponse>(`/super-admin/schools?${params.toString()}`),
    placeholderData: keepPreviousData,
    retry: false,
  });

  const s = stats.data;
  const choose = (next: Filter) => {
    setFilter((current) => (current === next ? "all" : next));
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform management"
        title="Subscriptions"
        description="Control which schools can use the platform. Changes take effect immediately and are recorded in the audit log."
      />

      <section aria-label="Subscription overview" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active" value={s?.activeSubscriptions ?? "—"} icon={ShieldCheck} color="success" onClick={() => choose("ACTIVE")} active={filter === "ACTIVE"} />
        <StatCard label="On trial" value={s?.trialing ?? "—"} icon={Hourglass} color="info" onClick={() => choose("TRIALING")} active={filter === "TRIALING"} />
        <StatCard label="Expiring in 14 days" value={s?.expiringSoon ?? "—"} icon={Clock} color="warning" delta={s && s.lapsed > 0 ? `${s.lapsed} already lapsed` : undefined} onClick={() => choose("expiring")} active={filter === "expiring"} />
        <StatCard label="Suspended" value={s?.suspended ?? "—"} icon={PauseCircle} color="danger" onClick={() => choose("SUSPENDED")} active={filter === "SUSPENDED"} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <FilterChips<Filter>
            label="Filter subscriptions"
            value={filter}
            onChange={(next) => { setFilter(next); setPage(1); }}
            options={[
              { value: "all", label: "All" },
              { value: "ACTIVE", label: "Active" },
              { value: "TRIALING", label: "Trial" },
              { value: "PAST_DUE", label: "Past due" },
              { value: "expiring", label: "Expiring soon" },
              { value: "lapsed", label: "Lapsed" },
              { value: "SUSPENDED", label: "Suspended" },
              { value: "CANCELLED", label: "Cancelled" },
            ]}
          />
          <SearchInput className="w-full lg:w-72" label="Search schools" placeholder="Search name, code or subdomain…" value={search} onChange={(value) => { setSearch(value); setPage(1); }} />
        </div>

        {schools.isPending ? (
          <LoadingPanel label="Loading subscriptions…" />
        ) : schools.error ? (
          <ErrorPanel message={`Subscriptions could not be loaded: ${schools.error.message}`} onRetry={() => void schools.refetch()} />
        ) : schools.data.data.length === 0 ? (
          <EmptyPanel icon={<CreditCard className="size-8" />} title="No schools match" description={q || filter !== "all" ? "Try a different filter or search term." : "Enroll a school to see its subscription here."} />
        ) : (
          <>
            <div className={cn("overflow-x-auto transition-opacity", schools.isPlaceholderData && "opacity-60")}>
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="px-5 py-3 font-semibold">School</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Status</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Expires</th>
                    <th scope="col" className="hidden px-5 py-3 font-semibold md:table-cell">Students</th>
                    <th scope="col" className="px-5 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {schools.data.data.map((school) => (
                    <tr key={school.id} className="transition hover:bg-muted/40">
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-foreground">{school.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{school.code} · {school.subdomain}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <SubscriptionBadge status={school.organization.subscriptionStatus} expiresAt={school.organization.expiresAt} />
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-foreground">{formatDate(school.organization.expiresAt)}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{school.organization.expiresAt ? describeExpiry(school.organization.expiresAt) : "Never expires"}</p>
                      </td>
                      <td className="hidden px-5 py-3.5 tabular-nums text-foreground md:table-cell">{school._count.students.toLocaleString()}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setManaging(school)} className="superadmin-button-secondary inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold">
                            <Settings2 className="size-3.5" /> Manage
                          </button>
                          <Link to="/admin/schools/$schoolId" params={{ schoolId: school.id }} aria-label={`Open ${school.name}`} className="superadmin-button-secondary inline-flex items-center rounded-lg p-1.5">
                            <ArrowUpRight className="size-3.5" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={schools.data.meta.page} totalPages={schools.data.meta.totalPages} total={schools.data.meta.total} limit={LIMIT} onChange={setPage} />
          </>
        )}
      </section>

      {managing && <SubscriptionDialog school={managing} onClose={() => setManaging(null)} />}
    </div>
  );
}
