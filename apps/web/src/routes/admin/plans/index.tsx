import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, CircleAlert, CreditCard, Edit3, Infinity as InfinityIcon, Layers3, Plus, Save, ShieldCheck, Users, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/superadmin/page-header";
import { EmptyPanel, ErrorPanel, LoadingPanel } from "@/components/superadmin/state-panels";

export const Route = createFileRoute("/admin/plans/")({ component: SubscriptionPlansPage });

type Plan = {
  id: string; code: string; name: string; description: string | null;
  monthlyPrice: string | number; yearlyPrice: string | number; currency: string;
  maxStudents: number | null; maxTeachers: number | null; maxGuardians: number | null;
  maxStaff: number | null; maxStorageMb: number | null; features: string[];
  isPublic: boolean; isActive: boolean; sortOrder: number; version: number;
};
type Draft = Omit<Plan, "id" | "version" | "monthlyPrice" | "yearlyPrice"> & { id?: string; monthlyPrice: string; yearlyPrice: string; featuresText: string };
const blank = (): Draft => ({ code: "", name: "", description: "", monthlyPrice: "0", yearlyPrice: "0", currency: "GHS", maxStudents: 500, maxTeachers: 30, maxGuardians: 1000, maxStaff: 50, maxStorageMb: 5120, features: [], featuresText: "Attendance, Assessments, Report cards", isPublic: true, isActive: true, sortOrder: 0 });
const money = (v: string | number, currency: string) => new Intl.NumberFormat("en-GH", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(v));
const limitLabel = (n: number | null) => n === null ? "Unlimited" : n.toLocaleString();

function SubscriptionPlansPage() {
  const client = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const plans = useQuery({ queryKey: ["superadmin", "subscription-plans"], queryFn: () => apiFetch<Plan[]>("/super-admin/subscription-plans"), retry: false });
  const save = useMutation({
    mutationFn: (value: Draft) => {
      const { id, featuresText, ...rest } = value;
      const body = { ...rest, monthlyPrice: Number(value.monthlyPrice), yearlyPrice: Number(value.yearlyPrice), features: featuresText.split(",").map(s => s.trim()).filter(Boolean) };
      return apiFetch<Plan>(id ? `/super-admin/subscription-plans/${id}` : "/super-admin/subscription-plans", { method: id ? "PATCH" : "POST", body: JSON.stringify(body) });
    },
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ["superadmin", "subscription-plans"] }); setDraft(null); },
  });
  const startEdit = (p: Plan) => setDraft({ ...p, monthlyPrice: String(p.monthlyPrice), yearlyPrice: String(p.yearlyPrice), featuresText: Array.isArray(p.features) ? p.features.join(", ") : "" });
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(current => current ? { ...current, [key]: value } : current);
  const submit = () => {
    if (!draft || !draft.name.trim() || !draft.code.trim() || Number(draft.monthlyPrice) < 0 || Number(draft.yearlyPrice) < 0) return;
    save.mutate(draft);
  };

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
      <button type="button" onClick={() => setDraft(blank())} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"><Plus className="size-4" /> Create plan</button>
    </div>
    {plans.isPending ? <LoadingPanel label="Loading subscription plans…" /> : plans.error ? <ErrorPanel message={`Plans could not be loaded: ${plans.error.message}`} onRetry={() => void plans.refetch()} /> : plans.data.length === 0 ? <EmptyPanel icon={<Layers3 className="size-8" />} title="No plans configured" description="Create your first plan to define subscription pricing and school capacity." /> :
      <div className="grid gap-4 xl:grid-cols-2">{plans.data.map(plan => <article key={plan.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-bold text-foreground">{plan.name}</h3><span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{plan.code}</span></div><p className="mt-1 max-w-xl text-sm text-muted-foreground">{plan.description || "No description provided."}</p>
            <div className="mt-3 flex flex-wrap gap-2"><StateTag active={plan.isActive} label={plan.isActive ? "Active" : "Archived"} /><StateTag active={plan.isPublic} label={plan.isPublic ? "Public" : "Private"} /></div></div>
          <button type="button" onClick={() => startEdit(plan)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted"><Edit3 className="size-3.5" /> Edit</button>
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
    {draft && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !save.isPending) setDraft(null); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="plan-editor-title" className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-border bg-card p-5 shadow-2xl sm:rounded-3xl sm:p-7">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-primary">Plan configuration</p><h2 id="plan-editor-title" className="mt-1 text-xl font-bold text-foreground">{draft.id ? "Edit subscription plan" : "Create subscription plan"}</h2><p className="mt-1 text-sm text-muted-foreground">Use explicit caps to protect performance and keep pricing predictable.</p></div><button type="button" onClick={() => setDraft(null)} disabled={save.isPending} aria-label="Close editor" className="rounded-lg p-2 hover:bg-muted"><X className="size-4" /></button></div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="Plan code" hint="Stable internal identifier"><input value={draft.code} onChange={e => set("code", e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))} disabled={Boolean(draft.id)} maxLength={32} required placeholder="e.g. GROWTH" className="field" /></Field>
          <Field label="Display name"><input value={draft.name} onChange={e => set("name", e.target.value)} maxLength={80} required placeholder="Growth" className="field" /></Field>
          <Field label="Description"><input value={draft.description ?? ""} onChange={e => set("description", e.target.value)} maxLength={500} placeholder="For growing basic and secondary schools" className="field" /></Field>
          <Field label="Currency"><select value={draft.currency} onChange={e => set("currency", e.target.value)} className="field"><option value="GHS">GHS — Ghana cedi</option><option value="USD">USD — US dollar</option></select></Field>
          <Field label="Monthly price"><input type="number" min="0" step="0.01" value={draft.monthlyPrice} onChange={e => set("monthlyPrice", e.target.value)} required className="field" /></Field>
          <Field label="Annual price"><input type="number" min="0" step="0.01" value={draft.yearlyPrice} onChange={e => set("yearlyPrice", e.target.value)} required className="field" /></Field>
          <LimitField label="Maximum students" value={draft.maxStudents} onChange={v => set("maxStudents", v)} />
          <LimitField label="Maximum teachers" value={draft.maxTeachers} onChange={v => set("maxTeachers", v)} />
          <LimitField label="Maximum guardians" value={draft.maxGuardians} onChange={v => set("maxGuardians", v)} />
          <LimitField label="Maximum other staff" value={draft.maxStaff} onChange={v => set("maxStaff", v)} />
          <LimitField label="Storage allowance (MB)" value={draft.maxStorageMb} onChange={v => set("maxStorageMb", v)} />
          <Field label="Display order"><input type="number" min="0" max="100000" value={draft.sortOrder} onChange={e => set("sortOrder", Math.max(0, Number(e.target.value)))} className="field" /></Field>
          <Field label="Features (comma separated)" hint="Display/entitlement identifiers"><textarea value={draft.featuresText} onChange={e => set("featuresText", e.target.value)} rows={3} className="field" placeholder="Attendance, Reports, Finance" /></Field>
          <div className="flex flex-col justify-center gap-3 rounded-xl border border-border p-4"><Toggle label="Visible to schools" checked={draft.isPublic} onChange={v => set("isPublic", v)} /><Toggle label="Plan active" checked={draft.isActive} onChange={v => set("isActive", v)} /></div>
        </div>
        {save.error && <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><CircleAlert className="mt-0.5 size-4 shrink-0" />{save.error.message}</p>}
        <div className="mt-6 flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => setDraft(null)} disabled={save.isPending} className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted">Cancel</button><button type="button" onClick={submit} disabled={save.isPending || !draft.code.trim() || !draft.name.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Save className="size-4" />{save.isPending ? "Saving…" : draft.id ? "Save changes" : "Create plan"}</button></div>
      </section>
    </div>}
  </div>;
}

function Summary({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Layers3 }) { return <div className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="flex items-center justify-between gap-2"><span className="text-sm text-muted-foreground">{label}</span><Icon className="size-4 text-primary" /></div><p className="mt-3 text-2xl font-bold tabular-nums text-foreground">{value}</p></div>; }
function Price({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-base font-bold text-foreground">{value}</p></div>; }
function Limit({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold text-foreground">{value}</p></div>; }
function StateTag({ active, label }: { active: boolean; label: string }) { return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>{label}</span>; }
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) { return <label className="block min-w-0"><span className="block text-sm font-semibold text-foreground">{label}</span>{hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}{children}</label>; }
function LimitField({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number | null) => void }) { return <Field label={label} hint="Leave blank for unlimited"><input type="number" min="0" step="1" value={value ?? ""} onChange={e => onChange(e.target.value === "" ? null : Math.max(0, Math.floor(Number(e.target.value))))} className="field" /></Field>; }
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="flex items-center justify-between gap-3 text-sm text-foreground"><span>{label}</span><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="size-4 accent-primary" /></label>; }

