import { useState, type FormEvent } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { FinanceReadOnlyNotice, useFinanceAccess } from "@/components/portal/finance-access";

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

interface FinancePeriodLock {
  lockedThrough: string | null;
  reason: string | null;
  updatedAt: string | null;
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
  const { canWrite } = useFinanceAccess();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [lockDate, setLockDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lockReason, setLockReason] = useState("");
  const [lockFeedback, setLockFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const rangeInvalid = !!from && !!to && from > to;

  const periodLockQuery = useQuery({
    queryKey: ["finance", "period-lock"],
    queryFn: () => apiFetch<FinancePeriodLock>("/finance/period-lock"),
    retry: false,
  });

  const updatePeriodLock = useMutation({
    mutationFn: (input: { lockedThrough: string; reason: string }) =>
      apiFetch<FinancePeriodLock>("/finance/period-lock", {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: async (lock) => {
      setLockFeedback({
        kind: "success",
        text: lock.lockedThrough
          ? `Books are now closed through ${lock.lockedThrough}.`
          : "The period lock was updated.",
      });
      setLockReason("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["finance", "period-lock"] }),
        queryClient.invalidateQueries({ queryKey: ["finance", "audit-log"] }),
      ]);
    },
    onError: (error: Error) => setLockFeedback({ kind: "error", text: error.message }),
  });

  function submitPeriodLock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLockFeedback(null);
    if (lockReason.trim().length < 10) {
      setLockFeedback({ kind: "error", text: "Explain why the books are being closed in at least 10 characters." });
      return;
    }
    if (lockDate > new Date().toISOString().slice(0, 10)) {
      setLockFeedback({ kind: "error", text: "You cannot close the books through a future date." });
      return;
    }
    if (periodLockQuery.data?.lockedThrough && lockDate < periodLockQuery.data.lockedThrough) {
      setLockFeedback({ kind: "error", text: "Only a platform administrator can move the close date backwards or reopen a period." });
      return;
    }
    updatePeriodLock.mutate({ lockedThrough: lockDate, reason: lockReason.trim() });
  }

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
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2 text-primary"><LockKeyhole className="size-5" /></div>
            <div>
              <h2 className="font-semibold text-foreground">Accounting period control</h2>
              <p className="mt-1 max-w-3xl text-sm leading-5 text-muted-foreground">
                Close the books through a posting date so new backdated payments or expenses cannot silently change a closed period. Closing is audited. Reopening or moving the date backwards is reserved for a platform administrator.
              </p>
            </div>
          </div>
          {periodLockQuery.data?.lockedThrough ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-warning/10 px-3 py-1.5 text-xs font-semibold text-foreground">
              <CalendarClock className="size-3.5" /> Closed through {periodLockQuery.data.lockedThrough}
            </span>
          ) : (
            <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">No closed period</span>
          )}
        </div>
        {periodLockQuery.isPending ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading period-lock status…</p>
        ) : periodLockQuery.error ? (
          <p role="alert" className="mt-4 text-sm text-destructive">Period-lock status is unavailable: {periodLockQuery.error.message}</p>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current close</p>
              <p className="mt-2 text-lg font-bold text-foreground">{periodLockQuery.data.lockedThrough ?? "Open"}</p>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                {periodLockQuery.data.lockedThrough
                  ? `Backdated postings on or before ${periodLockQuery.data.lockedThrough} are blocked.`
                  : "Historical posting dates are not currently restricted by a period close."}
              </p>
              {periodLockQuery.data.reason && <p className="mt-3 text-xs leading-5 text-muted-foreground">Last reason: {periodLockQuery.data.reason}</p>}
              {periodLockQuery.data.updatedAt && <p className="mt-1 text-xs text-muted-foreground">Updated {formatWhen(periodLockQuery.data.updatedAt)}</p>}
            </div>
            {canWrite ? (
              <form className="space-y-3" onSubmit={submitPeriodLock}>
                <label className="block text-sm font-medium text-foreground">
                  Close books through
                  <input
                    type="date"
                    required
                    max={new Date().toISOString().slice(0, 10)}
                    min={periodLockQuery.data.lockedThrough ?? undefined}
                    className={inputClass}
                    value={lockDate}
                    onChange={(event) => setLockDate(event.target.value)}
                  />
                </label>
                <label className="block text-sm font-medium text-foreground">
                  Reason for closing this period
                  <textarea
                    required
                    minLength={10}
                    maxLength={500}
                    rows={2}
                    className={inputClass + " h-auto py-2"}
                    value={lockReason}
                    onChange={(event) => setLockReason(event.target.value)}
                    placeholder="e.g. October receipts reconciled and monthly accounts reviewed"
                  />
                </label>
                {lockFeedback && <p role={lockFeedback.kind === "error" ? "alert" : "status"} className={lockFeedback.kind === "error" ? "text-sm text-destructive" : "text-sm text-success"}>{lockFeedback.text}</p>}
                <button type="submit" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50" disabled={updatePeriodLock.isPending || lockReason.trim().length < 10 || !lockDate}>
                  {updatePeriodLock.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <LockKeyhole className="size-4" />}
                  {periodLockQuery.data.lockedThrough ? "Extend / confirm close" : "Close books"}
                </button>
                <p className="text-xs leading-5 text-muted-foreground">Only dates on or after the existing close can be selected here. Platform administrators handle reopening or corrections to a closed period.</p>
              </form>
            ) : (
              <div className="space-y-3"><FinanceReadOnlyNotice /><p className="text-xs leading-5 text-muted-foreground">Closing the books is restricted to authorised finance writers. You can still review period status and the audit trail.</p></div>
            )}
          </div>
        )}
        {lockFeedback?.kind === "error" && periodLockQuery.error && <p role="alert" className="mt-2 text-sm text-destructive">{lockFeedback.text}</p>}
      </section>

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
