import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, ChevronRight, Info, LoaderCircle, OctagonAlert } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

import { formatGhs as money } from "@/lib/format";
type Severity = "critical" | "warning" | "info";
interface ActionItem { id: string; severity: Severity; title: string; detail: string; page: string; count?: number; amount?: string }
interface ActionCentre { generatedAt: string; items: ActionItem[] }

const look: Record<Severity, { icon: typeof Info; box: string; label: string }> = {
  critical: { icon: OctagonAlert, box: "border-destructive/30 bg-destructive/5", label: "Blocking" },
  warning: { icon: AlertTriangle, box: "border-warning/30 bg-warning/5", label: "Needs action" },
  info: { icon: Info, box: "border-border bg-muted/30", label: "Coming up" },
};

/** The accountant's daily inbox: everything that needs attention, ranked, each linking to where it is fixed. */
export function AccountantActionCentre() {
  const query = useQuery({
    queryKey: ["finance", "action-centre"],
    queryFn: () => apiFetch<ActionCentre>("/finance/action-centre"),
    retry: false, staleTime: 60_000, refetchInterval: 5 * 60_000,
  });
  const items = query.data?.items ?? [];
  return <section aria-label="Action centre" className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div><h2 className="text-lg font-semibold text-foreground">Action centre</h2><p className="mt-0.5 text-xs text-muted-foreground">What needs your attention today, worked out from your live records.</p></div>
      {query.data && <p className="text-xs text-muted-foreground">Checked {new Date(query.data.generatedAt).toLocaleTimeString()}</p>}
    </div>
    {query.isPending && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Checking your records…</p>}
    {query.isError && <p role="alert" className="text-sm text-destructive">The action centre could not be loaded. {query.error.message}</p>}
    {query.data && !items.length && <p className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/5 p-3 text-sm text-foreground"><CheckCircle2 className="size-4 text-success" /> You’re all caught up. Nothing needs attention right now.</p>}
    {!!items.length && <ul className="grid gap-2 lg:grid-cols-2">
      {items.map(item => {
        const { icon: Icon, box, label } = look[item.severity];
        return <li key={item.id}>
          <Link to="/$page" params={{ page: item.page }} className={cn("group flex h-full items-start gap-3 rounded-xl border p-3 transition hover:shadow-sm", box)}>
            <Icon className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">{item.title}{item.amount ? ` · ${money(item.amount)}` : ""}</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{item.detail}</span>
              <span className="mt-1 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
            </span>
            <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </li>;
      })}
    </ul>}
  </section>;
}
