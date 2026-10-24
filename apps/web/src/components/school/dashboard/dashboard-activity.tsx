import { CreditCard, ReceiptText, UserRoundPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardActivity } from "@/components/school/dashboard/dashboard-data";

const money = new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 2 });
const timestamp = (value: string) => new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export function RecentActivityCard({ activities, isLoading, isError, canViewFinance }: {
  activities: DashboardActivity[];
  isLoading: boolean;
  isError: boolean;
  canViewFinance: boolean;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div><h2 className="text-sm font-semibold text-foreground">Recent activity</h2><p className="mt-1 text-xs text-muted-foreground">Latest changes recorded in this school</p></div>
        <span className="rounded-full border border-border px-2.5 py-1 text-[10px] font-medium text-muted-foreground">Live records</span>
      </div>
      {isLoading ? <div className="space-y-3">{[1,2,3].map((item) => <div key={item} className="h-14 animate-pulse rounded-lg bg-muted/60" />)}</div>
      : isError ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Recent activity could not be loaded.</p>
      : activities.length === 0 ? <div className="rounded-xl border border-dashed border-border p-7 text-center"><p className="text-sm font-medium text-foreground">No recent activity yet</p><p className="mt-1 text-xs text-muted-foreground">New student records and other recorded updates will appear here.</p></div>
      : <div className="divide-y divide-border/70">{activities.map((activity) => {
        const Icon = activity.type === "student" ? UserRoundPlus : activity.type === "payment" ? CreditCard : ReceiptText;
        const iconClass = activity.type === "student" ? "bg-blue-500/10 text-blue-600" : activity.type === "payment" ? "bg-emerald-500/10 text-emerald-600" : "bg-orange-500/10 text-orange-600";
        return <div key={activity.id} className="flex min-w-0 items-center gap-3 py-3.5 first:pt-0 last:pb-0">
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", iconClass)}><Icon className="size-4" /></span>
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-foreground">{activity.title}</p><p className="mt-1 truncate text-[11px] text-muted-foreground">{activity.detail}</p><p className="mt-1 text-[10px] text-muted-foreground">{timestamp(activity.createdAt)}</p></div>
          {canViewFinance && activity.amount !== null && <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">{money.format(activity.amount)}</span>}
        </div>;
      })}</div>}
      {!canViewFinance && <p className="mt-4 border-t border-border/70 pt-3 text-[10px] text-muted-foreground">Financial activity is restricted to authorised school roles.</p>}
    </section>
  );
}
