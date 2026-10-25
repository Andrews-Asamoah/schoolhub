import { TableExportMenu } from "@/components/ui/data-table";
import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronDown, FileClock, KeyRound, LogIn, Pencil, PlusCircle, ShieldAlert, Trash2, Wallet } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";
import { SUPER_ADMIN_AUDIT_ACTIONS } from "@schoolhub/shared";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/subscription";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/superadmin/page-header";
import { Pagination } from "@/components/superadmin/pagination";
import { SearchInput } from "@/components/superadmin/search-input";
import { EmptyPanel, ErrorPanel, LoadingPanel } from "@/components/superadmin/state-panels";
import { useDebouncedValue } from "@/components/superadmin/use-debounced-value";

export const Route = createFileRoute("/admin/audit/")({
  component: AuditLogPage,
});

interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string; role: string };
  school: { id: string; name: string; code: string } | null;
}

interface AuditResponse {
  data: AuditEntry[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const LIMIT = 25;

const EVENT_LABELS: Record<string, string> = {
  "super-admin.school.enroll": "School enrolled",
  "super-admin.school.update": "School details updated",
  "super-admin.school.access": "Opened school data",
  "super-admin.subscription.update": "Subscription changed",
  "super-admin.school-admin.add": "Administrator added",
  "super-admin.school-admin.ban": "Administrator suspended",
  "super-admin.school-admin.unban": "Administrator restored",
  "super-admin.school-admin.remove": "Administrator removed",
  "super-admin.school-owner.credentials": "Owner credentials issued",
};

const ACTION_STYLE: Record<string, { icon: ReactNode; tone: string }> = {
  CREATE: { icon: <PlusCircle className="size-4" />, tone: "bg-success/10 text-success" },
  UPDATE: { icon: <Pencil className="size-4" />, tone: "bg-info/10 text-info" },
  DELETE: { icon: <Trash2 className="size-4" />, tone: "bg-destructive/10 text-destructive" },
  CREDENTIALS_ISSUED: { icon: <KeyRound className="size-4" />, tone: "bg-warning/10 text-warning" },
  PASSWORD_RESET: { icon: <KeyRound className="size-4" />, tone: "bg-warning/10 text-warning" },
  ACCESS_CHANGED: { icon: <ShieldAlert className="size-4" />, tone: "bg-warning/10 text-warning" },
  SUBSCRIPTION_CHANGED: { icon: <Wallet className="size-4" />, tone: "bg-primary/10 text-primary" },
  SCHOOL_ACCESSED: { icon: <LogIn className="size-4" />, tone: "bg-muted text-muted-foreground" },
};

const eventLabel = (entry: AuditEntry) => EVENT_LABELS[entry.entityType] ?? entry.entityType.replace(/^super-admin\./, "").replace(/[._-]+/g, " ");
const prettyAction = (action: string) => action.toLowerCase().replace(/_/g, " ");

const display = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

function Changes({ entry }: { entry: AuditEntry }) {
  const keys = Array.from(new Set([...Object.keys(entry.oldValues ?? {}), ...Object.keys(entry.newValues ?? {})]));
  if (keys.length === 0) return <p className="text-xs text-muted-foreground">No further detail was recorded.</p>;
  return (
    <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-[max-content_1fr]">
      {keys.map((key) => {
        const before = entry.oldValues?.[key];
        const after = entry.newValues?.[key];
        const changed = entry.oldValues && key in entry.oldValues && display(before) !== display(after);
        return (
          <Fragment key={key}>
            <dt className="font-semibold text-muted-foreground">{key}</dt>
            <dd className="min-w-0 break-words text-foreground">
              {changed ? (
                <>
                  <span className="rounded bg-destructive/10 px-1 text-destructive line-through">{display(before)}</span>
                  <span className="mx-1.5 text-muted-foreground">→</span>
                  <span className="rounded bg-success/10 px-1 text-success">{display(after)}</span>
                </>
              ) : (
                display(after ?? before)
              )}
            </dd>
          </Fragment>
        );
      })}
    </dl>
  );
}

function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const q = useDebouncedValue(search.trim());

  const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
  if (action) params.set("action", action);
  if (schoolId) params.set("schoolId", schoolId);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (q) params.set("q", q);

  const options = useQuery({
    queryKey: ["superadmin", "school-options"],
    queryFn: () => apiFetch<{ id: string; name: string; code: string }[]>("/super-admin/schools/options"),
    staleTime: 5 * 60_000,
  });
  const logs = useQuery({
    queryKey: ["superadmin", "audit", params.toString()],
    queryFn: () => apiFetch<AuditResponse>(`/super-admin/audit-logs?${params.toString()}`),
    placeholderData: keepPreviousData,
    retry: false,
  });

  const reset = <T,>(setter: (value: T) => void) => (value: T) => { setter(value); setPage(1); };
  const filtersActive = Boolean(action || schoolId || from || to || q);
  const selectClass = "rounded-xl border border-input bg-card px-3 py-2.5 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Security"
        title="Audit log"
        description="A tamper-evident record of who did what across the platform: enrolments, subscription changes, access changes and school-data access."
        actions={
          {logs.data?.data.length ? <TableExportMenu build={() => ({ title: "Platform audit log page " + page, headers: ["When", "Event", "Action", "Actor", "Actor email", "School", "Record", "IP address", "Details"], columnTypes: ["date","text","text","text","text","text","text","text","text"], rows: logs.data!.data.map(entry => [entry.createdAt, eventLabel(entry), entry.action, entry.user.name, entry.user.email, entry.school?.name ?? "Platform", entry.entityId, entry.ipAddress ?? "", JSON.stringify({ before: entry.oldValues, after: entry.newValues })]), reportInfo: { filters: { page, action, schoolId, from, to, search: q } } })} note="Exports the current filtered page only." /> : undefined}
        }
      />

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_auto_auto]">
          <SearchInput label="Search events" placeholder="Search events (e.g. subscription)…" value={search} onChange={reset(setSearch)} />
          <select aria-label="Filter by action" value={action} onChange={(event) => reset(setAction)(event.target.value)} className={selectClass}>
            <option value="">All actions</option>
            {SUPER_ADMIN_AUDIT_ACTIONS.map((value) => <option key={value} value={value}>{prettyAction(value)}</option>)}
          </select>
          <select aria-label="Filter by school" value={schoolId} onChange={(event) => reset(setSchoolId)(event.target.value)} className={selectClass}>
            <option value="">All schools</option>
            {options.data?.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
          </select>
          <input aria-label="From date" type="date" value={from} max={to || undefined} onChange={(event) => reset(setFrom)(event.target.value)} className={selectClass} />
          <input aria-label="To date" type="date" value={to} min={from || undefined} onChange={(event) => reset(setTo)(event.target.value)} className={selectClass} />
        </div>
        {filtersActive && (
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
            <span>Filters applied · {logs.data?.meta.total.toLocaleString() ?? "…"} matching events</span>
            <button type="button" className="font-semibold text-primary hover:underline" onClick={() => { setAction(""); setSchoolId(""); setFrom(""); setTo(""); setSearch(""); setPage(1); }}>
              Clear all
            </button>
          </div>
        )}

        {logs.isPending ? (
          <LoadingPanel label="Loading audit log…" />
        ) : logs.error ? (
          <ErrorPanel message={`The audit log could not be loaded: ${logs.error.message}`} onRetry={() => void logs.refetch()} />
        ) : logs.data.data.length === 0 ? (
          <EmptyPanel icon={<FileClock className="size-8" />} title="No events found" description={filtersActive ? "No events match these filters." : "Platform activity will appear here as it happens."} />
        ) : (
          <>
            <ul className={cn("divide-y divide-border transition-opacity", logs.isPlaceholderData && "opacity-60")}>
              {logs.data.data.map((entry) => {
                const style = ACTION_STYLE[entry.action] ?? { icon: <FileClock className="size-4" />, tone: "bg-muted text-muted-foreground" };
                const expanded = open === entry.id;
                return (
                  <li key={entry.id}>
                    <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : entry.id)}
                      className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", style.tone)}>{style.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold capitalize text-foreground">{eventLabel(entry)}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {entry.user.name} · {entry.school ? entry.school.name : "Platform"}
                        </span>
                      </span>
                      <time dateTime={entry.createdAt} className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:block">{formatDateTime(entry.createdAt)}</time>
                      <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} aria-hidden />
                    </button>
                    {expanded && (
                      <div className="space-y-4 border-t border-border bg-muted/30 px-5 py-4 pl-[4.25rem]">
                        <Changes entry={entry} />
                        <dl className="grid gap-x-6 gap-y-1 text-[11px] text-muted-foreground sm:grid-cols-2">
                          <div><dt className="inline font-semibold">When: </dt><dd className="inline">{formatDateTime(entry.createdAt)}</dd></div>
                          <div><dt className="inline font-semibold">Actor: </dt><dd className="inline">{entry.user.email} ({entry.user.role})</dd></div>
                          <div><dt className="inline font-semibold">IP address: </dt><dd className="inline">{entry.ipAddress ?? "unknown"}</dd></div>
                          <div><dt className="inline font-semibold">Record: </dt><dd className="inline font-mono">{entry.entityId}</dd></div>
                          <div className="sm:col-span-2"><dt className="inline font-semibold">Device: </dt><dd className="inline break-all">{entry.userAgent ?? "unknown"}</dd></div>
                        </dl>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <Pagination page={logs.data.meta.page} totalPages={logs.data.meta.totalPages} total={logs.data.meta.total} limit={LIMIT} onChange={setPage} />
          </>
        )}
      </section>
    </div>
  );
}
