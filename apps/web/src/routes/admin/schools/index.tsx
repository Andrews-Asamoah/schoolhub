import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, School } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { SubscriptionBadge } from "@/components/superadmin/subscription-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { PageHeader } from "@/components/superadmin/page-header";
import { Pagination } from "@/components/superadmin/pagination";
import { SearchInput } from "@/components/superadmin/search-input";
import { FilterChips } from "@/components/superadmin/filter-chips";
import { EmptyPanel, ErrorPanel, LoadingPanel } from "@/components/superadmin/state-panels";
import { useDebouncedValue } from "@/components/superadmin/use-debounced-value";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/schools/")({
  component: SchoolsListPage,
});

interface SchoolSummary {
  id: string;
  name: string;
  code: string;
  subdomain: string;
  createdAt: string;
  organization: { subscriptionStatus: string; expiresAt: string | null };
  _count: { students: number; teachers: number };
}

interface SchoolsListResponse {
  data: SchoolSummary[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const LIMIT = 20;

function SchoolsListPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const q = useDebouncedValue(search.trim());

  const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
  if (q) params.set("q", q);
  if (status !== "all") params.set("status", status);

  const { data, isPending, error, isPlaceholderData, refetch } = useQuery({
    queryKey: ["superadmin", "schools", params.toString()],
    queryFn: () => apiFetch<SchoolsListResponse>(`/super-admin/schools?${params.toString()}`),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const filtered = data?.data;

  const columns: DataTableColumn<SchoolSummary>[] = [
    {
      id: "name",
      header: "School Name",
      value: (school) => `${school.name} (${school.subdomain})`,
      cell: (school) => (
        <div>
          <p className="text-sm font-semibold text-foreground">{school.name}</p>
          <p className="text-xs text-muted-foreground">{school.subdomain}</p>
        </div>
      ),
    },
    {
      id: "code",
      header: "Code",
      value: (school) => school.code,
      cell: (school) => <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">{school.code}</code>,
    },
    { id: "students", header: "Students", value: (school) => school._count.students, cell: (school) => <span className="text-sm font-medium text-foreground">{school._count.students}</span> },
    { id: "teachers", header: "Teachers", value: (school) => school._count.teachers, cell: (school) => <span className="text-sm font-medium text-foreground">{school._count.teachers}</span> },
    {
      id: "subscription",
      header: "Subscription",
      value: (school) => school.organization.subscriptionStatus,
      cell: (school) => <SubscriptionBadge status={school.organization.subscriptionStatus} expiresAt={school.organization.expiresAt} />,
    },
    {
      id: "enrolled",
      header: "Enrolled",
      value: (school) => school.createdAt.slice(0, 10),
      cell: (school) => new Date(school.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
    },
    {
      id: "actions",
      header: "",
      className: "text-right",
      cell: (school) => (
        <Link
          to="/admin/schools/$schoolId"
          params={{ schoolId: school.id }}
          className="superadmin-button-secondary rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/15"
        >
          View →
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform management"
        title="Schools"
        description={data ? `${data.meta.total.toLocaleString()} ${q || status !== "all" ? "matching" : "registered"} schools` : "Loading…"}
        actions={
          <Link to="/admin/schools/new" className="superadmin-button-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold">
            <Plus className="size-4" /> Enroll school
          </Link>
        }
      />

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <FilterChips
            label="Filter by subscription"
            value={status}
            onChange={(next) => { setStatus(next); setPage(1); }}
            options={[
              { value: "all", label: "All" },
              { value: "ACTIVE", label: "Active" },
              { value: "TRIALING", label: "Trial" },
              { value: "PAST_DUE", label: "Past due" },
              { value: "SUSPENDED", label: "Suspended" },
            ]}
          />
          <SearchInput className="w-full lg:w-80" label="Search schools" placeholder="Search name, code or subdomain…" value={search} onChange={(value) => { setSearch(value); setPage(1); }} />
        </div>

        {isPending ? (
          <LoadingPanel label="Loading schools…" />
        ) : error ? (
          <ErrorPanel message={`Schools could not be loaded: ${error.message}`} onRetry={() => void refetch()} />
        ) : !filtered || filtered.length === 0 ? (
          <EmptyPanel
            icon={<School className="size-8" />}
            title={q || status !== "all" ? "No schools match your filters" : "No schools enrolled yet"}
            description={q || status !== "all" ? undefined : "Enroll your first school to get started."}
            action={!q && status === "all" ? <Link to="/admin/schools/new" className="superadmin-button-primary rounded-lg px-4 py-2 text-xs font-semibold">Enroll a school</Link> : undefined}
          />
        ) : (
          <>
            <div className={cn("transition-opacity", isPlaceholderData && "opacity-60")}>
              <DataTable
                embedded
                searchable={false}
                paginate={false}
                canExport
                rows={filtered}
                columns={columns}
                getRowId={(school) => school.id}
                exportTitle="Schools"
                emptyTitle="No schools"
                emptyDescription="No schools match your search."
              />
            </div>
            {data && <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} limit={LIMIT} onChange={setPage} />}
          </>
        )}
      </section>
    </div>
  );
}
