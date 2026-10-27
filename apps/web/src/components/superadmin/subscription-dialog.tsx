import { DatePicker } from "@/components/ui/date-picker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { evaluateSubscriptionAccess, SUBSCRIPTION_GRACE_DAYS, type SubscriptionStatusValue } from "@schoolhub/shared";
import { CircleAlert, LoaderCircle, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api";
import { describeExpiry } from "@/lib/subscription";
import { cn } from "@/lib/utils";
import { SubscriptionBadge } from "./subscription-badge";

export interface SubscriptionTarget {
  id: string;
  name: string;
  organization: { subscriptionStatus: string; expiresAt: string | null };
  subscription?: { planId: string | null; planName: string; amount: string | number | null; currency: string; billingCycle: "MONTHLY" | "YEARLY" | null } | null;
}

const STATUS_OPTIONS: { value: SubscriptionStatusValue; label: string; hint: string }[] = [
  { value: "ACTIVE", label: "Active", hint: "Paid and in good standing" },
  { value: "TRIALING", label: "Trial", hint: "Evaluating the platform" },
  { value: "PAST_DUE", label: "Past due", hint: "Payment overdue; keeps access until expiry + grace" },
  { value: "SUSPENDED", label: "Suspended", hint: "Blocked immediately" },
  { value: "CANCELLED", label: "Cancelled", hint: "Blocked immediately" },
];

const PRESETS = [
  { label: "+30 days", days: 30 },
  { label: "+90 days", days: 90 },
  { label: "+1 year", days: 365 },
];

const toDateInput = (value: string | null) => (value ? value.slice(0, 10) : "");
const addDays = (days: number, from = new Date()) => new Date(from.getTime() + days * 86_400_000).toISOString().slice(0, 10);

export function SubscriptionDialog({ school, onClose }: { school: SubscriptionTarget; onClose: () => void }) {
  const queryClient = useQueryClient();
  const titleId = useId();
  const initialDate = toDateInput(school.organization.expiresAt);
  const [status, setStatus] = useState<string>(school.organization.subscriptionStatus);
  const [expiry, setExpiry] = useState(initialDate);
  const [note, setNote] = useState("");
  const [planId, setPlanId] = useState(school.subscription?.planId ?? "");
  const [billingCycle, setBillingCycle] = useState<"MONTHLY" | "YEARLY">(school.subscription?.billingCycle ?? "MONTHLY");
  const plans = useQuery({ queryKey: ["superadmin", "subscription-plans"], queryFn: () => apiFetch<Array<{ id: string; name: string; code: string; monthlyPrice: string | number; yearlyPrice: string | number; currency: string; isActive: boolean }>>("/super-admin/subscription-plans") });
  const planMutation = useMutation({ mutationFn: () => apiFetch(`/super-admin/schools/${school.id}/plan`, { method: "PATCH", body: JSON.stringify({ planId, billingCycle }) }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["superadmin"] }); } });
  const firstRef = useRef<HTMLButtonElement>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const body: { status: string; expiresAt?: string | null; note?: string } = { status };
      if (expiry !== initialDate) body.expiresAt = expiry || null;
      if (note.trim()) body.note = note.trim();
      return apiFetch(`/super-admin/schools/${school.id}/subscription`, { method: "PATCH", body: JSON.stringify(body) });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["superadmin"] });
      onClose();
    },
  });

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !mutation.isPending) onClose();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose, mutation.isPending]);

  const effectiveExpiry = expiry ? `${expiry}T23:59:59.999Z` : null;
  const outcome = evaluateSubscriptionAccess(status, effectiveExpiry);
  const unchanged = status === school.organization.subscriptionStatus && expiry === initialDate && !note.trim();

  return createPortal(
    <div className="superadmin-dialog-backdrop fixed inset-0 z-50 flex items-end justify-center bg-overlay p-0 sm:items-center sm:p-4" role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !mutation.isPending) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="superadmin-confirm-dialog max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-border bg-card p-6 shadow-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-bold text-foreground">Manage subscription</h2>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{school.name}</p>
          </div>
          <button type="button" onClick={onClose} disabled={mutation.isPending} aria-label="Close"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-xl bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
          Currently <SubscriptionBadge status={school.organization.subscriptionStatus} expiresAt={school.organization.expiresAt} />
          <span>· expires {describeExpiry(school.organization.expiresAt)}</span>
        </div>


        <section className="mt-5 rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground">Subscription plan &amp; capacity</h3>
          <p className="mt-1 text-xs text-muted-foreground">Assigning a plan snapshots its price and capacity limits to this school.</p>
          {school.subscription?.planName && <p className="mt-2 text-xs text-muted-foreground">Current plan: <span className="font-semibold text-foreground">{school.subscription.planName}</span>{school.subscription.amount !== null && school.subscription.amount !== undefined ? " · " + school.subscription.currency + " " + Number(school.subscription.amount).toFixed(2) + " / " + (school.subscription.billingCycle?.toLowerCase() ?? "cycle") : ""}</p>}
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_140px_auto]">
            <label className="text-xs font-semibold text-muted-foreground">Plan
              <select value={planId} onChange={e => setPlanId(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                <option value="">Choose a plan…</option>
                {(plans.data ?? []).filter(p => p.isActive).map(p => <option key={p.id} value={p.id}>{p.name} · {p.code}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-muted-foreground">Billing cycle
              <select value={billingCycle} onChange={e => setBillingCycle(e.target.value as "MONTHLY" | "YEARLY")} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                <option value="MONTHLY">Monthly</option><option value="YEARLY">Yearly</option>
              </select>
            </label>
            <button type="button" disabled={!planId || planMutation.isPending || plans.isPending} onClick={() => planMutation.mutate()} className="self-end rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">{planMutation.isPending ? "Assigning…" : "Assign plan"}</button>
          </div>
          {planMutation.error && <p role="alert" className="mt-2 text-xs text-destructive">{planMutation.error.message}</p>}
          {planMutation.isSuccess && <p role="status" className="mt-2 text-xs text-success">Plan assignment saved.</p>}
          {plans.error && <p role="alert" className="mt-2 text-xs text-destructive">Plans could not be loaded: {plans.error.message}</p>}
        </section>
        <fieldset className="mt-5">
          <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {STATUS_OPTIONS.map((option, index) => (
              <button key={option.value} type="button" ref={index === 0 ? firstRef : undefined} onClick={() => setStatus(option.value)}
                aria-pressed={status === option.value}
                className={cn("rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  status === option.value ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border hover:border-primary/40")}>
                <span className="block text-sm font-semibold text-foreground">{option.label}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{option.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-5">
          <label htmlFor="sub-expiry" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Expires on</label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <DatePicker id="sub-expiry" value={expiry} onChange={(value) => setExpiry(value)}
              buttonClassName="rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30" />
            {PRESETS.map((preset) => (
              <button key={preset.label} type="button" onClick={() => setExpiry(addDays(preset.days, expiry && expiry > addDays(0) ? new Date(`${expiry}T00:00:00Z`) : new Date()))}
                className="superadmin-button-secondary rounded-lg px-2.5 py-1.5 text-xs font-semibold">
                {preset.label}
              </button>
            ))}
            {expiry && (
              <button type="button" onClick={() => setExpiry("")} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
                No expiry
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Access continues for {SUBSCRIPTION_GRACE_DAYS} grace days after this date, then the school is locked.
          </p>
        </div>

        <div className="mt-5">
          <label htmlFor="sub-note" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reason (kept in the audit log)</label>
          <textarea id="sub-note" rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. Term 1 invoice #204 paid by bank transfer"
            className="mt-2 w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30" />
        </div>

        <div role="status" className={cn("mt-5 flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-xs leading-relaxed",
          outcome.allowed ? "border-success/25 bg-success/10 text-success" : "border-destructive/25 bg-destructive/10 text-destructive")}>
          {outcome.allowed ? <ShieldCheck className="mt-0.5 size-4 shrink-0" /> : <ShieldAlert className="mt-0.5 size-4 shrink-0" />}
          <p>
            {outcome.allowed
              ? outcome.reason === "GRACE_PERIOD"
                ? "The date has passed, so the school is in its grace period and will be locked soon."
                : "After saving, the school and its users keep full access."
              : "After saving, every user of this school is locked out immediately. Platform admins keep access."}
          </p>
        </div>

        {mutation.error && (
          <p role="alert" className="mt-3 flex items-start gap-2 text-xs font-medium text-destructive">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" /> {mutation.error.message}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={mutation.isPending} className="superadmin-button-secondary rounded-xl px-4 py-2.5 text-sm font-semibold">
            Cancel
          </button>
          <button type="button" onClick={() => mutation.mutate()} disabled={unchanged || mutation.isPending}
            className={cn("inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50", outcome.allowed ? "superadmin-button-primary" : "superadmin-button-danger")}>
            {mutation.isPending && <LoaderCircle className="size-4 animate-spin" />}
            {outcome.allowed ? "Save changes" : "Lock school & save"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
