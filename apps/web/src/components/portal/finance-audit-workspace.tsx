import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/api";

type Category = "PAYMENTS" | "EXPENSES" | "BILLING" | "PAYROLL" | "CONCESSIONS" | "SETTINGS" | "OTHER";

interface AuditItem {
  id: string;
  createdAt: string;
  actor: { id: string; name: string; email: string };
  category: Category;
  title: string;
  entityType: string;
  entityId: string;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  actedAsSuperAdmin: boolean;
  supportReason: string | null;
  ipAddress: string | null;
}

interface AuditPage {
  items: AuditItem[];
  nextCursor: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  PAYMENTS: "Payments & receipts",
  EXPENSES: "Expenses",
  BILLING: "Bills & fee structures",
  PAYROLL: "Payroll & salaries",
  CONCESSIONS: "Scholarships & discounts",
  SETTINGS: "Closed period & reminders",
};

const inputClass =
  "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary";

function humanize(key: string) {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

/** The interesting fields of a row: the request body for request-level entries, otherwise the saved values. */
function pairsOf(values: Record<string, unknown> | null): Array<[string, unknown]> {
  if (!values) return [];
  const body = values.body;
  if (body && typeof body === "object" && !Array.isArray(body)) return Object.entries(body as Record<string, unknown>);
  return Object.entries(values).filter(([key]) => !["actorPlatformRole", "actorSchoolRole", "actedAsSuperAdmin", "supportReason", "params"].includes(key));
}

function formatWhen(value: string) {
  return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

/** Read-only trail of who changed what in the school's finances. */
export function FinanceAuditWorkspace() {
  const [category, setCategory] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const rangeInvalid = !!from && !!to && from > to;

  const query = useInfiniteQuery({
    queryKey: ["finance", "audit-log", category, from, to],
    enabled: !rangeInvalid,
    initialPageParam: "" as string,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (pageParam) params.set("cursor", pageParam);
      params.set("limit", "50");
      return apiFetch<AuditPage>(`/finance/audit-log?${params.toString()}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2 text-primary"><ShieldCheck className="size-5" /></div>
          <div>
            <h2 className="font-semibold text-foreground">Finance audit trail</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Every payment, reversal, bill run, expense, salary and payroll change, with who made it and when. Entries cannot be edited or removed from here.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="text-sm font-medium">
            Type of change
            <select className={inputClass} value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">All finance changes</option>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            From
            <input type="date" className={inputClass} value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className="text-sm font-medium">
            To
            <input type="date" className={inputClass} value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
        </div>
        {rangeInvalid && <p role="alert" className="mt-3 text-sm text-destructive">The start date must be on or before the end date.</p>}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        {query.isPending && !rangeInvalid ? (
          <p className="text-sm text-muted-foreground">Loading audit entries…</p>
        ) : query.error ? (
          <p role="alert" className="text-sm text-destructive">{query.error.message}</p>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No finance changes match these filters.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {items.map((item) => {
              const after = pairsOf(item.newValues);
              const before = pairsOf(item.oldValues);
              return (
                <details key={item.id} className="group py-3">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{item.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {item.actor.name} · {formatWhen(item.createdAt)}
                        {item.actedAsSuperAdmin && <span className="ml-2 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-bold text-foreground">PLATFORM ADMIN</span>}
                      </p>
                    </div>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
                      {CATEGORY_LABELS[item.category] ?? "Other"}
                    </span>
                  </summary>
                  <div className="mt-3 space-y-3 rounded-xl bg-muted/30 p-3 text-sm">
                    {item.supportReason && (
                      <p><span className="font-semibold">Stated reason: </span>{item.supportReason}</p>
                    )}
                    {before.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Before</p>
                        <dl className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                          {before.map(([key, value]) => (
                            <div key={key}><dt className="text-xs text-muted-foreground">{humanize(key)}</dt><dd className="break-words">{display(value)}</dd></div>
                          ))}
                        </dl>
                      </div>
                    )}
                    {after.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{before.length ? "After" : "Details"}</p>
                        <dl className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                          {after.map(([key, value]) => (
                            <div key={key}><dt className="text-xs text-muted-foreground">{humanize(key)}</dt><dd className="break-words">{display(value)}</dd></div>
                          ))}
                        </dl>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {item.actor.email}{item.ipAddress ? ` · ${item.ipAddress}` : ""} · Record {item.entityId}
                    </p>
                  </div>
                </details>
              );
            })}
          </div>
        )}
        {query.hasNextPage && (
          <div className="mt-4 flex justify-center">
            <button type="button" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()} className="inline-flex min-h-10 items-center rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-60">
              {query.isFetchingNextPage ? "Loading…" : "Load older entries"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
