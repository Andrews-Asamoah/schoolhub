import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, BellRing, CalendarCheck, CircleCheck, FileText, Lock, Receipt, WalletCards, type LucideIcon } from "lucide-react";
import { AccountantFinanceCharts } from "@/components/portal/accountant-finance-charts";
import { apiFetch } from "@/lib/api";
import { useSchoolOrganization } from "@/components/school/school-organization";

interface Term { id: string; name: string; isCurrent: boolean }
interface Year { id: string; name: string; isCurrent: boolean; terms: Term[] }
interface Summary {
  asOf: string;
  billed: string;
  collected: string;
  outstanding: string;
  overdue: string;
  collectionRate: string | null;
  byMethod: { method: string; amount: string; receiptCount: number }[];
  byClass: { classId: string | null; className: string; billed: string; collected: string; outstanding: string; billCount: number }[];
  ageing: { days0To30: string; days31To60: string; days61To90: string; days90Plus: string; notDue: string };
}
interface Expense {
  amount: number | string;
  date: string;
  category?: string | null;
  customCategory?: { name: string } | null;
  registryCategory?: { name: string } | null;
}
interface Page<T> { items: T[]; nextCursor: string | null; total: number }
interface RecentPayment { id: string; paymentNumber: string; amount: number | string; paymentDate: string; student: { firstName?: string | null; lastName?: string | null; admissionNumber?: string | null } }
interface ReminderSchedule { id: string; name: string; isActive: boolean; installments: { id: string; sendDate: string; sent: boolean }[] }
interface PeriodLock { lockedThrough: string | null; reason: string | null }

const money = new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 2 });
const gh = (value: string | number | null | undefined) => money.format(Number(value ?? 0));
const dateFmt = new Intl.DateTimeFormat("en-GH", { dateStyle: "medium" });

function Tile({ label, value, detail, icon: Icon, tone, page }: { label: string; value: string; detail: string; icon: LucideIcon; tone: string; page: string }) {
  return (
    <Link to="/$page" params={{ page }} className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-3 break-words text-2xl font-bold tracking-tight text-foreground">{value}</p>
        </div>
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon className="size-[18px]" /></span>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">{detail}</p>
    </Link>
  );
}

/**
 * The accountant's landing page: what to act on today, then the term's collection picture.
 * It loads finance data only. It never calls school-wide census analytics.
 */
export function AccountantOverview({ today, greetingName }: { today: string; greetingName: string }) {
  const { activeOrganization } = useSchoolOrganization();
  const org = activeOrganization?.id;
  const enabled = Boolean(org);
  const isoToday = new Date().toISOString().slice(0, 10);

  const yearsQuery = useQuery({ queryKey: ["accountant-home", "years", org], queryFn: () => apiFetch<Year[]>("/schools/academic-years"), enabled, retry: false, staleTime: 60_000 });
  const year = yearsQuery.data?.find((item) => item.isCurrent);
  const term = year?.terms.find((item) => item.isCurrent);
  const termParams = new URLSearchParams();
  if (year) termParams.set("yearId", year.id);
  if (term) termParams.set("termId", term.id);
  const termQs = termParams.size ? `?${termParams.toString()}` : "";
  const ready = enabled && !yearsQuery.isPending;

  const summaryQuery = useQuery({ queryKey: ["accountant-home", "summary", org, year?.id, term?.id], queryFn: () => apiFetch<Summary>(`/finance/summary${termQs}`), enabled: ready, retry: false, refetchInterval: 60_000 });
  const todayQuery = useQuery({ queryKey: ["accountant-home", "today", org, isoToday], queryFn: () => apiFetch<Summary>(`/finance/summary?from=${isoToday}&to=${isoToday}`), enabled, retry: false, refetchInterval: 60_000 });
  const recentQuery = useQuery({ queryKey: ["accountant-home", "recent", org], queryFn: () => apiFetch<Page<RecentPayment>>("/finance/payments?status=COMPLETED&limit=5"), enabled, retry: false, refetchInterval: 60_000 });
  const termBillsQuery = useQuery({ queryKey: ["accountant-home", "term-bills", org, term?.id], queryFn: () => apiFetch<Page<unknown>>(`/finance/bills?limit=1${term ? `&termId=${term.id}` : ""}`), enabled: ready, retry: false });
  const remindersQuery = useQuery({ queryKey: ["accountant-home", "reminders", org], queryFn: () => apiFetch<ReminderSchedule[]>("/finance/fee-reminders"), enabled, retry: false });
  const lockQuery = useQuery({ queryKey: ["accountant-home", "period-lock", org], queryFn: () => apiFetch<PeriodLock>("/finance/period-lock"), enabled, retry: false });
  const expensesQuery = useQuery({ queryKey: ["accountant-home", "expenses", org], queryFn: () => apiFetch<Expense[]>("/finance/expenses"), enabled, retry: false, refetchInterval: 60_000 });

  const collectedToday = todayQuery.data ? gh(todayQuery.data.collected) : "—";
  const receiptsToday = todayQuery.data?.byMethod.reduce((n, row) => n + row.receiptCount, 0) ?? 0;
  const dueReminders = (remindersQuery.data ?? []).filter((s) => s.isActive).flatMap((s) => s.installments).filter((i) => !i.sent && i.sendDate.slice(0, 10) <= isoToday).length;
  const termBillCount = termBillsQuery.data?.total;

  const attention: { key: string; text: string; page: string; action: string }[] = [];
  if (summaryQuery.data && Number(summaryQuery.data.overdue) > 0) attention.push({ key: "overdue", text: `${gh(summaryQuery.data.overdue)} is overdue.`, page: "outstanding", action: "See debtors" });
  if (term && termBillCount === 0) attention.push({ key: "bills", text: `No bills have been generated for ${term.name} yet.`, page: "invoices", action: "Generate bills" });
  if (dueReminders > 0) attention.push({ key: "reminders", text: `${dueReminders} fee reminder${dueReminders === 1 ? " is" : "s are"} due to send.`, page: "fee-reminders", action: "Review reminders" });
  if (lockQuery.data && !lockQuery.data.lockedThrough && term) attention.push({ key: "lock", text: "No period has been closed yet. Close completed periods once reconciled.", page: "term-end-review", action: "Open term-end review" });
  const attentionLoaded = !summaryQuery.isPending && !termBillsQuery.isPending && !remindersQuery.isPending && !lockQuery.isPending;
  const loadFailed = summaryQuery.isError || todayQuery.isError;

  return (
    <main className="mx-auto max-w-[1440px] space-y-6 px-4 py-7 sm:px-6 lg:px-9 lg:py-9">
      <header>
        <p className="mb-2 text-xs font-medium text-muted-foreground">{today}{term ? ` · ${term.name}` : ""}</p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[30px]">Good day, {greetingName}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">What needs doing today, then where collections stand.</p>
      </header>

      {loadFailed && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Finance figures could not be loaded. Check your finance permissions and connection, then refresh.</p>}

      <section aria-label="Today and this term" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Collected today" value={collectedToday} detail={todayQuery.data ? `${receiptsToday} receipt${receiptsToday === 1 ? "" : "s"} recorded today` : "Loading…"} icon={WalletCards} tone="bg-success/10 text-success" page="payments" />
        <Tile label="Outstanding" value={summaryQuery.data ? gh(summaryQuery.data.outstanding) : "—"} detail={summaryQuery.data?.collectionRate ? `${summaryQuery.data.collectionRate}% of billed collected` : "Billed less collected this term"} icon={Receipt} tone="bg-warning/10 text-warning" page="outstanding" />
        <Tile label="Overdue" value={summaryQuery.data ? gh(summaryQuery.data.overdue) : "—"} detail="Past due date and unpaid" icon={AlertTriangle} tone="bg-destructive/10 text-destructive" page="outstanding" />
        <Tile label="Bills this term" value={termBillCount === undefined ? "—" : String(termBillCount)} detail={term ? `Generated for ${term.name}` : "No current term set"} icon={FileText} tone="bg-primary/10 text-primary" page="invoices" />
      </section>

      <section aria-label="Needs attention" className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border bg-muted/30 px-5 py-3"><h2 className="text-sm font-bold text-foreground">Needs attention</h2></div>
        {!attentionLoaded ? <div className="h-16 animate-pulse bg-muted/40" /> : attention.length === 0 ? (
          <p className="flex items-center gap-2 px-5 py-4 text-sm text-muted-foreground"><CircleCheck className="size-4 text-success" />Nothing needs action right now.</p>
        ) : (
          <ul className="divide-y divide-border">
            {attention.map((item) => (
              <li key={item.key} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <span className="text-sm text-foreground">{item.text}</span>
                <Link to="/$page" params={{ page: item.page }} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent">{item.action}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-5 xl:grid-cols-3" aria-label="Recent activity">
        <article className="rounded-2xl border border-border bg-card p-5 shadow-sm xl:col-span-2">
          <div className="flex items-center justify-between"><h2 className="text-sm font-bold text-foreground">Latest payments</h2><Link to="/$page" params={{ page: "payments" }} className="text-xs font-semibold text-primary hover:underline">All payments</Link></div>
          {recentQuery.isPending ? <div className="mt-3 h-24 animate-pulse rounded-xl bg-muted/50" /> : recentQuery.isError ? <p role="alert" className="mt-3 text-xs text-destructive">Latest payments could not be loaded.</p> : (recentQuery.data?.items.length ?? 0) === 0 ? <p className="mt-3 text-xs text-muted-foreground">No payments recorded yet.</p> : (
            <ul className="mt-3 divide-y divide-border">
              {recentQuery.data!.items.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0"><span className="block truncate font-medium text-foreground">{[p.student.firstName, p.student.lastName].filter(Boolean).join(" ") || p.student.admissionNumber || "Student"}</span><span className="block text-[11px] text-muted-foreground">{p.paymentNumber} · {dateFmt.format(new Date(p.paymentDate))}</span></span>
                  <span className="shrink-0 font-semibold text-foreground">{gh(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </article>
        <article className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-bold text-foreground">Books and reminders</h2>
          <p className="flex items-start gap-2 text-xs text-muted-foreground"><Lock className="mt-0.5 size-4 shrink-0 text-primary" />{lockQuery.isPending ? "Checking period lock…" : lockQuery.isError ? "Period lock could not be loaded." : lockQuery.data?.lockedThrough ? `Books closed through ${dateFmt.format(new Date(lockQuery.data.lockedThrough))}.` : "No period closed yet."}</p>
          <p className="flex items-start gap-2 text-xs text-muted-foreground"><BellRing className="mt-0.5 size-4 shrink-0 text-primary" />{remindersQuery.isPending ? "Checking reminders…" : remindersQuery.isError ? "Reminders could not be loaded." : `${(remindersQuery.data ?? []).filter((s) => s.isActive).length} active reminder schedule(s); ${dueReminders} due to send.`}</p>
          <Link to="/$page" params={{ page: "term-end-review" }} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"><CalendarCheck className="size-3.5" />Term-end review and close</Link>
        </article>
      </section>

      <section aria-label="Collections and expenses" className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Collections and expenses</h2>
        {summaryQuery.isPending || expensesQuery.isPending ? (
          <div className="grid gap-5 xl:grid-cols-2"><div className="h-80 animate-pulse rounded-2xl bg-muted/60" /><div className="h-80 animate-pulse rounded-2xl bg-muted/60" /></div>
        ) : summaryQuery.isError || expensesQuery.isError ? (
          <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Finance charts could not load. Check your finance permissions and connection, then refresh.</p>
        ) : (
          <AccountantFinanceCharts summary={summaryQuery.data ?? null} expenses={expensesQuery.data ?? []} />
        )}
      </section>
    </main>
  );
}
