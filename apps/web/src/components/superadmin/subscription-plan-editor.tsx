import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, inputClassName } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

export type SubscriptionPlan = {
  id: string; code: string; name: string; description: string | null;
  monthlyPrice: string | number; yearlyPrice: string | number; currency: string;
  maxStudents: number | null; maxTeachers: number | null; maxGuardians: number | null;
  maxStaff: number | null; maxStorageMb: number | null; features: string[];
  isPublic: boolean; isActive: boolean; sortOrder: number; version: number;
};

const capacities = [
  ["maxStudents", "Students", "500"],
  ["maxTeachers", "Teachers", "30"],
  ["maxGuardians", "Guardians", "1000"],
  ["maxStaff", "Other staff", "50"],
  ["maxStorageMb", "Storage (MB)", "5120"],
] as const;
type Capacity = typeof capacities[number][0];
type Draft = {
  code: string; name: string; description: string; currency: string;
  monthlyPrice: string; yearlyPrice: string; sortOrder: string; featuresText: string;
  isPublic: boolean; isActive: boolean;
} & Record<Capacity, string | null>;
type Errors = Partial<Record<keyof Draft, string>>;

function makeDraft(plan: SubscriptionPlan | null): Draft {
  return {
    code: plan?.code ?? "", name: plan?.name ?? "", description: plan?.description ?? "",
    currency: plan?.currency ?? "GHS", monthlyPrice: String(plan?.monthlyPrice ?? ""),
    yearlyPrice: String(plan?.yearlyPrice ?? ""), sortOrder: String(plan?.sortOrder ?? 0),
    featuresText: plan?.features.join("\n") ?? "Attendance\nAssessments\nReport cards",
    isPublic: plan?.isPublic ?? true, isActive: plan?.isActive ?? true,
    ...Object.fromEntries(capacities.map(([key, , fallback]) => [key, plan ? plan[key] === null ? null : String(plan[key]) : fallback])) as Record<Capacity, string | null>,
  };
}

function validate(draft: Draft): Errors {
  const errors: Errors = {};
  if (!/^[A-Z0-9_-]{2,32}$/.test(draft.code.trim())) errors.code = "Use 2–32 letters, numbers, underscores or hyphens.";
  if (draft.name.trim().length < 2 || draft.name.trim().length > 80) errors.name = "Enter a name with 2–80 characters.";
  if (draft.description.trim().length > 500) errors.description = "Use 500 characters or fewer.";
  if (!/^[A-Z]{3}$/.test(draft.currency)) errors.currency = "Choose a currency.";
  for (const [key, max] of [["monthlyPrice", 1_000_000], ["yearlyPrice", 10_000_000]] as const) {
    const value = draft[key];
    if (!/^\d+(\.\d{1,2})?$/.test(value) || !Number.isFinite(Number(value)) || Number(value) > max) {
      errors[key] = `Enter an amount from 0 to ${max.toLocaleString("en-GH")} with up to 2 decimal places.`;
    }
  }
  for (const [key] of capacities) {
    const value = draft[key];
    if (value !== null && (!/^\d+$/.test(value) || Number(value) > 10_000_000)) errors[key] = "Enter a whole number from 0 to 10,000,000 or select Unlimited.";
  }
  if (!/^\d+$/.test(draft.sortOrder) || Number(draft.sortOrder) > 100_000) errors.sortOrder = "Enter a whole number from 0 to 100,000.";
  const features = draft.featuresText.split("\n").map(value => value.trim()).filter(Boolean);
  if (features.length > 40 || features.some(value => value.length > 80)) errors.featuresText = "Use up to 40 features, with 80 characters or fewer per line.";
  return errors;
}

export function SubscriptionPlanEditor({ plan, onClose, onSaved }: {
  plan: SubscriptionPlan | null; onClose: () => void; onSaved: () => void;
}) {
  const client = useQueryClient();
  const prefix = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [initial] = useState(() => makeDraft(plan));
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [discarding, setDiscarding] = useState(false);
  const dirty = JSON.stringify(initial) !== JSON.stringify(draft);
  const save = useMutation({
    mutationFn: () => {
      const { featuresText, ...fields } = draft;
      const body = {
        ...fields, code: draft.code.trim(), name: draft.name.trim(), description: draft.description.trim() || null,
        monthlyPrice: Number(draft.monthlyPrice), yearlyPrice: Number(draft.yearlyPrice), sortOrder: Number(draft.sortOrder),
        ...Object.fromEntries(capacities.map(([key]) => [key, draft[key] === null ? null : Number(draft[key])])),
        features: [...new Set(featuresText.split("\n").map(value => value.trim()).filter(Boolean))],
      };
      return apiFetch<SubscriptionPlan>(plan ? `/super-admin/subscription-plans/${plan.id}` : "/super-admin/subscription-plans", {
        method: plan ? "PATCH" : "POST", body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["superadmin"] });
      onSaved();
    },
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    dialog?.querySelector<HTMLInputElement>('input[name="code"]')?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  function close() {
    if (save.isPending) return;
    if (dirty) setDiscarding(true);
    else onClose();
  }
  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: undefined }));
    save.reset();
  }
  function fieldProps(key: keyof Draft) {
    return { id: `${prefix}-${key}`, name: key, "aria-invalid": Boolean(errors[key]), "aria-describedby": `${prefix}-${key}-help` };
  }
  function field(label: string, key: keyof Draft, control: ReactNode, hint?: string) {
    return <div className="min-w-0 space-y-2">
      <label htmlFor={`${prefix}-${key}`} className="block text-sm font-semibold text-foreground">{label}</label>
      {control}
      <p id={`${prefix}-${key}-help`} className={`text-xs leading-5 ${errors[key] ? "text-destructive" : "text-muted-foreground"}`}>{errors[key] || hint}</p>
    </div>;
  }

  return <dialog ref={dialogRef} aria-labelledby={`${prefix}-title`} aria-describedby={`${prefix}-description`}
    onCancel={event => { event.preventDefault(); close(); }}
    className="fixed inset-0 m-auto max-h-[94dvh] w-[calc(100%-2rem)] max-w-3xl overflow-hidden rounded-2xl border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-overlay backdrop:backdrop-blur-sm">
    <form ref={formRef} noValidate aria-busy={save.isPending} onSubmit={event => {
      event.preventDefault();
      if (save.isPending || discarding) return;
      const next = validate(draft);
      setErrors(next);
      if (Object.keys(next).length) {
        requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
        return;
      }
      save.mutate();
    }} className="flex max-h-[94dvh] flex-col">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-5 sm:px-7">
        <div><h2 id={`${prefix}-title`} className="text-xl font-bold">{plan ? "Edit subscription plan" : "Create subscription plan"}</h2>
          <p id={`${prefix}-description`} className="mt-1 text-sm text-muted-foreground">Set pricing, school capacity and availability.</p></div>
        <Button type="button" variant="ghost" size="icon" onClick={close} disabled={save.isPending} aria-label="Close plan editor"><X className="size-5" aria-hidden="true" /></Button>
      </header>
      <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-5 py-6 sm:px-7">
        {discarding ? <section aria-labelledby={`${prefix}-discard`} className="space-y-4 rounded-xl border border-warning/30 bg-warning/10 p-5">
          <h3 id={`${prefix}-discard`} className="font-semibold">Discard unsaved changes?</h3>
          <p className="text-sm text-muted-foreground">Your changes to this plan have not been saved.</p>
          <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" autoFocus onClick={() => setDiscarding(false)}>Keep editing</Button><Button type="button" variant="destructive" onClick={onClose}>Discard changes</Button></div>
        </section> : <fieldset disabled={save.isPending} className="min-w-0 space-y-7">
          <Section title="Plan details" description="Give the plan a recognisable name and a stable code.">
            {field("Plan code *", "code", <Input {...fieldProps("code")} autoFocus value={draft.code} onChange={e => set("code", e.target.value.toUpperCase())} readOnly={Boolean(plan)} maxLength={32} required placeholder="GROWTH" />, plan ? "The plan code cannot be changed here." : "2–32 letters, numbers, underscores or hyphens.")}
            {field("Display name *", "name", <Input {...fieldProps("name")} value={draft.name} onChange={e => set("name", e.target.value)} maxLength={80} required placeholder="Growth" />)}
            <div className="sm:col-span-2">{field("Description", "description", <Textarea {...fieldProps("description")} value={draft.description} onChange={e => set("description", e.target.value)} maxLength={500} rows={2} placeholder="For growing basic and secondary schools" />, "Optional · up to 500 characters.")}</div>
          </Section>
          <Section title="Pricing" description="Enter the total charged for each billing cycle. Enter 0 for a free plan.">
            {field("Currency *", "currency", <select {...fieldProps("currency")} value={draft.currency} onChange={e => set("currency", e.target.value)} className={inputClassName}><option value="GHS">GHS — Ghana cedi</option><option value="USD">USD — US dollar</option>{!["GHS", "USD"].includes(draft.currency) && <option value={draft.currency}>{draft.currency}</option>}</select>)}
            <div className="hidden sm:block" />
            {field(`Monthly price (${draft.currency}) *`, "monthlyPrice", <Input {...fieldProps("monthlyPrice")} type="number" inputMode="decimal" min="0" max="1000000" step="0.01" value={draft.monthlyPrice} onChange={e => set("monthlyPrice", e.target.value)} required placeholder="0.00" />, "Total per month.")}
            {field(`Annual price (${draft.currency}) *`, "yearlyPrice", <Input {...fieldProps("yearlyPrice")} type="number" inputMode="decimal" min="0" max="10000000" step="0.01" value={draft.yearlyPrice} onChange={e => set("yearlyPrice", e.target.value)} required placeholder="0.00" />, "Total for the full year.")}
          </Section>
          <Section title="Included capacity" description="Set a whole-number limit or explicitly choose Unlimited. A limit of 0 includes no capacity.">
            {capacities.map(([key, label, fallback]) => <div key={key} className="space-y-2 rounded-xl border border-border p-4">
              {field(label, key, <Input {...fieldProps(key)} type="number" inputMode="numeric" min="0" max="10000000" step="1" disabled={save.isPending || draft[key] === null} value={draft[key] ?? ""} onChange={e => set(key, e.target.value)} placeholder={draft[key] === null ? "Unlimited" : fallback} />, key === "maxStorageMb" ? "1,024 MB = 1 GB." : undefined)}
              <label className="flex min-h-8 items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={draft[key] === null} onChange={e => set(key, e.target.checked ? null : fallback)} aria-label={`Unlimited ${label.toLowerCase()}`} />Unlimited</label>
            </div>)}
          </Section>
          <Section title="Features" description="List the features included in this plan, one per line.">
            <div className="sm:col-span-2">{field("Included features", "featuresText", <Textarea {...fieldProps("featuresText")} value={draft.featuresText} onChange={e => set("featuresText", e.target.value)} rows={4} placeholder={"Attendance\nAssessments\nReport cards"} />, "Up to 40 features · 80 characters per line. Existing feature names are preserved.")}</div>
          </Section>
          <Section title="Availability" description="Control whether this plan is available for assignment and visible to schools.">
            <div className="space-y-4 rounded-xl border border-border p-4">
              <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={draft.isActive} onChange={e => set("isActive", e.target.checked)} className="mt-1 size-4 accent-primary" /><span><span className="block font-semibold">Plan active</span><span className="mt-1 block text-xs text-muted-foreground">Available for new assignments.</span></span></label>
              <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={draft.isPublic} onChange={e => set("isPublic", e.target.checked)} className="mt-1 size-4 accent-primary" /><span><span className="block font-semibold">Visible to schools</span><span className="mt-1 block text-xs text-muted-foreground">Public visibility is separate from active status.</span></span></label>
            </div>
            {field("Display order", "sortOrder", <Input {...fieldProps("sortOrder")} type="number" min="0" max="100000" step="1" value={draft.sortOrder} onChange={e => set("sortOrder", e.target.value)} />, "Lower numbers appear first.")}
            <p className="text-xs leading-5 text-muted-foreground sm:col-span-2">Saving changes updates the catalogue. Existing school subscriptions retain their assigned pricing and capacity until explicitly reassigned.</p>
          </Section>
        </fieldset>}
        {Object.values(errors).some(Boolean) && !discarding && <p role="alert" className="text-sm text-destructive">Check the highlighted fields before saving.</p>}
        {save.error && <p role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{save.error.message}</p>}
      </div>
      {!discarding && <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <p className="text-xs text-muted-foreground">* Required fields</p>
        <div className="flex gap-2"><Button type="button" variant="outline" className="flex-1 sm:flex-none" onClick={close} disabled={save.isPending}>Cancel</Button><Button type="submit" className="flex-1 sm:flex-none" loading={save.isPending}><Save className="size-4" aria-hidden="true" />{save.isPending ? "Saving…" : plan ? "Save changes" : "Create plan"}</Button></div>
      </footer>}
    </form>
  </dialog>;
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="space-y-4"><div><h3 className="text-base font-semibold">{title}</h3><p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p></div><div className="grid gap-4 sm:grid-cols-2">{children}</div></section>;
}
