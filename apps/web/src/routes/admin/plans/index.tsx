import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Check, CreditCard, Edit3, Layers3, Plus, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/superadmin/page-header";
import { EmptyPanel, ErrorPanel, LoadingPanel } from "@/components/superadmin/state-panels";

import { SubscriptionPlanEditor, type SubscriptionPlan } from "@/components/superadmin/subscription-plan-editor";

export const Route = createFileRoute("/admin/plans/")({ component: SubscriptionPlansPage });

type Plan = SubscriptionPlan;
const money = (v: string | number, currency: string) => new Intl.NumberFormat("en-GH", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(v));
const limitLabel = (n: number | null) => n === null ? "Unlimited" : n.toLocaleString();

function SubscriptionPlansPage() {
  const [editing, setEditing] = useState<Plan | "new" | null>(null);
  const [notice, setNotice] = useState("");
  const plans = useQuery({ queryKey: ["superadmin", "subscription-plans"], queryFn: () => apiFetch<Plan[]>("/super-admin/subscription-plans"), retry: false });

  return <div className="space-y-6">
    <PageHeader eyebrow="Commercial configuration" title="Subscription plans" description="Define what each school can use, the user capacity included, and the price charged. Changes are versioned and audited." />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Summary label="Published plans" value={plans.data?.filter(p => p.isActive && p.isPublic).length ?? "—"} icon={Layers3} />
      <Summary label="Active plans" value={plans.data?.filter(p => p.isActive).length ?? "—"} icon={ShieldCheck} />
      <Summary label="Configured limits" value={plans.data?.length ?? "—"} icon={Users} />
      <Summary label="Currency" value="GHS" icon={CreditCard} />
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-base font-semibold text-foreground">Plan catalogue</h2><p className="mt-1 text-sm text-muted-foreground">Unlimited is explicit; archived plans remain in the audit trail.</p></div>
      <button type="button" onClick={() => { setNotice(""); setEditing("new"); }} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"><Plus className="size-4" /> Create plan</button>
    </div>
    {notice && <p role="status" className="rounded-xl border border-success/20 bg-success/10 p-3 text-sm text-success">{notice}</p>}
    {plans.isPending ? <LoadingPanel label="Loading subscription plans…" /> : plans.error ? <ErrorPanel message={`Plans could not be loaded: ${plans.error.message}`} onRetry={() => void plans.refetch()} /> : plans.data.length === 0 ? <EmptyPanel icon={<Layers3 className="size-8" />} title="No plans configured" description="Create your first plan to define subscription pricing and school capacity." /> :
      <div className="grid gap-4 xl:grid-cols-2">{plans.data.map(plan => <article key={plan.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-bold text-foreground">{plan.name}</h3><span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{plan.code}</span></div><p className="mt-1 max-w-xl text-sm text-muted-foreground">{plan.description || "No description provided."}</p>
            <div className="mt-3 flex flex-wrap gap-2"><StateTag active={plan.isActive} label={plan.isActive ? "Active" : "Archived"} /><StateTag active={plan.isPublic} label={plan.isPublic ? "Public" : "Private"} /></div></div>
          <button type="button" onClick={() => { setNotice(""); setEditing(plan); }} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted"><Edit3 className="size-3.5" /> Edit</button>
        </div>
        <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3">
          <Price label="Monthly" value={money(plan.monthlyPrice, plan.currency)} />
          <Price label="Annual" value={money(plan.yearlyPrice, plan.currency)} />
          <Price label="Storage" value={plan.maxStorageMb === null ? "Unlimited" : `${(plan.maxStorageMb / 1024).toFixed(plan.maxStorageMb % 1024 ? 1 : 0)} GB`} />
        </div>
        <div className="border-t border-border p-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Included capacity</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Limit label="Students" value={limitLabel(plan.maxStudents)} /><Limit label="Teachers" value={limitLabel(plan.maxTeachers)} /><Limit label="Guardians" value={limitLabel(plan.maxGuardians)} /><Limit label="Other staff" value={limitLabel(plan.maxStaff)} /></div>
        </div>
        <div className="border-t border-border bg-muted/20 px-5 py-4"><p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Feature entitlements</p><div className="flex flex-wrap gap-1.5">{(Array.isArray(plan.features) ? plan.features : []).length ? (plan.features as string[]).map(feature => <span key={feature} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"><Check className="size-3 text-success" />{feature}</span>) : <span className="text-xs text-muted-foreground">No feature list defined</span>}</div><p className="mt-3 text-[11px] text-muted-foreground">Plan version {plan.version} · Changes apply to future assignments; existing subscriptions need an explicit upgrade/downgrade.</p></div>
      </article>)}</div>}
    {editing && <SubscriptionPlanEditor plan={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setNotice(editing === "new" ? "Subscription plan created." : "Subscription plan updated."); setEditing(null); }} />}

  </div>;
}

function Summary({ label, value, icon: Icon }: { label: string; value: string | number; icon: LucideIcon }) { return <div className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="flex items-center justify-between gap-2"><span className="text-sm text-muted-foreground">{label}</span><Icon className="size-4 text-primary" /></div><p className="mt-3 text-2xl font-bold tabular-nums text-foreground">{value}</p></div>; }
function Price({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-base font-bold text-foreground">{value}</p></div>; }
function Limit({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold text-foreground">{value}</p></div>; }
function StateTag({ active, label }: { active: boolean; label: string }) { return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>{label}</span>; }
