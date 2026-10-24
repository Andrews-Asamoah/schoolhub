import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, CheckCircle2, CircleAlert, FileText, LoaderCircle, Plus, RefreshCw, Search, Settings2, Tags, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface FeeRegistryItem {
  id: string;
  name: string;
  description?: string | null;
}
interface SchoolClass {
  id: string;
  name: string;
  level?: string;
  isActive: boolean;
}
interface FeeItem {
  id: string;
  name: string;
  amount: number | string;
  isOptional: boolean;
  description?: string | null;
  registryItemId?: string | null;
}
interface FeeStructure {
  id: string;
  name: string;
  description?: string | null;
  classLevel?: string | null;
  termBased: boolean;
  isActive: boolean;
  items: FeeItem[];
  targetClasses: { class: { id: string; name: string } }[];
  _count?: { bills: number };
}
interface FeeItemDraft {
  rowId: string;
  registryItemId: string;
  name: string;
  amount: string;
  isOptional: boolean;
  description: string;
}
interface StructureDraft {
  name: string;
  description: string;
  classLevel: string;
  termBased: boolean;
  targetClassIds: string[];
  items: FeeItemDraft[];
}
interface FeeStructureInput {
  name: string;
  description?: string;
  classLevel?: string;
  termBased: boolean;
  targetClassIds: string[];
  items: { registryItemId?: string; name: string; amount: number; isOptional: boolean; description?: string }[];
}

const money = (amount: number) => new Intl.NumberFormat("en-GH", {
  style: "currency",
  currency: "GHS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(amount);
const blankItem = (): FeeItemDraft => ({
  rowId: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  registryItemId: "",
  name: "",
  amount: "",
  isOptional: false,
  description: "",
});
const freshDraft = (): StructureDraft => ({
  name: "",
  description: "",
  classLevel: "",
  termBased: true,
  targetClassIds: [],
  items: [blankItem()],
});
const fieldClass = "h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/30";
const primaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";

export function FeeStructuresWorkspace() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [createOpen, setCreateOpen] = useState(false);
  const [registryOpen, setRegistryOpen] = useState(false);
  const [draft, setDraft] = useState<StructureDraft>(freshDraft);
  const [registryName, setRegistryName] = useState("");
  const [registryDescription, setRegistryDescription] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const structuresQuery = useQuery({
    queryKey: ["finance", "fee-structures", "all"],
    queryFn: () => apiFetch<FeeStructure[]>("/finance/fee-structures?includeArchived=true"),
    retry: false,
  });
  const registryQuery = useQuery({
    queryKey: ["finance", "fee-item-registry"],
    queryFn: () => apiFetch<FeeRegistryItem[]>("/finance/fee-item-registry"),
    retry: false,
  });
  const classesQuery = useQuery({
    queryKey: ["academics", "classes"],
    queryFn: () => apiFetch<SchoolClass[]>("/academics/classes"),
    retry: false,
  });
  const structures = structuresQuery.data ?? [];
  const registryItems = registryQuery.data ?? [];
  const classes = (classesQuery.data ?? []).filter((schoolClass) => schoolClass.isActive);
  const activeCount = structures.filter((structure) => structure.isActive).length;
  const totalTemplates = structures.length;
  const totalBills = structures.reduce((sum, structure) => sum + (structure._count?.bills ?? 0), 0);

  const filteredStructures = useMemo(() => structures.filter((structure) => {
    const term = search.trim().toLowerCase();
    const matchesSearch = !term
      || structure.name.toLowerCase().includes(term)
      || (structure.description ?? "").toLowerCase().includes(term)
      || structure.items.some((item) => item.name.toLowerCase().includes(term))
      || structure.targetClasses.some((target) => target.class.name.toLowerCase().includes(term));
    const matchesStatus = status === "ALL" || (status === "ACTIVE" ? structure.isActive : !structure.isActive);
    return matchesSearch && matchesStatus;
  }), [structures, search, status]);

  const createStructure = useMutation({
    mutationFn: (input: FeeStructureInput) => apiFetch<FeeStructure>("/finance/fee-structures", {
      method: "POST",
      body: JSON.stringify(input),
    }),
    onSuccess: async (created) => {
      setFeedback({ kind: "success", text: `“${created.name}” was created successfully.` });
      setCreateOpen(false);
      setDraft(freshDraft());
      await queryClient.invalidateQueries({ queryKey: ["finance", "fee-structures"] });
    },
    onError: (error: Error) => setFeedback({ kind: "error", text: error.message }),
  });
  const setActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiFetch<FeeStructure>(`/finance/fee-structures/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: async (_value, variables) => {
      setFeedback({ kind: "success", text: variables.isActive ? "Fee structure reactivated." : "Fee structure archived. Existing bills are retained." });
      await queryClient.invalidateQueries({ queryKey: ["finance", "fee-structures"] });
    },
    onError: (error: Error) => setFeedback({ kind: "error", text: error.message }),
  });
  const createRegistryItem = useMutation({
    mutationFn: (input: { name: string; description?: string }) => apiFetch<FeeRegistryItem>("/finance/fee-item-registry", {
      method: "POST",
      body: JSON.stringify(input),
    }),
    onSuccess: async (item) => {
      setFeedback({ kind: "success", text: `Fee item category “${item.name}” was added.` });
      setRegistryName("");
      setRegistryDescription("");
      await queryClient.invalidateQueries({ queryKey: ["finance", "fee-item-registry"] });
    },
    onError: (error: Error) => setFeedback({ kind: "error", text: error.message }),
  });

  function submitStructure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    if (draft.items.some((item) => !item.name.trim() || item.amount.trim() === "" || !Number.isFinite(Number(item.amount)) || Number(item.amount) < 0)) {
      setFeedback({ kind: "error", text: "Give every fee item a name and a valid non-negative amount." });
      return;
    }
    createStructure.mutate({
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      classLevel: draft.classLevel.trim() || undefined,
      termBased: draft.termBased,
      targetClassIds: draft.targetClassIds,
      items: draft.items.map((item) => ({
        registryItemId: item.registryItemId || undefined,
        name: item.name.trim(),
        amount: Number(item.amount),
        isOptional: item.isOptional,
        description: item.description.trim() || undefined,
      })),
    });
  }

  function updateDraft<K extends keyof StructureDraft>(key: K, value: StructureDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  function updateItem(rowId: string, patch: Partial<FeeItemDraft>) {
    setDraft((current) => ({ ...current, items: current.items.map((item) => item.rowId === rowId ? { ...item, ...patch } : item) }));
  }
  const draftTotal = draft.items.reduce((sum, item) => sum + Math.max(0, Number(item.amount) || 0), 0);

  return (
    <div className="mx-auto w-full min-w-0 max-w-screen-2xl space-y-6">
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Finance & bursary</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">Fee structures</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Build reusable fee templates from standard fee items, assign them to classes, and keep a clear record of which structures have already been billed.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondaryButton} onClick={() => { setFeedback(null); setRegistryOpen(true); }}><Tags className="size-4" /> Fee item categories</button>
          <button type="button" className={primaryButton} onClick={() => { setFeedback(null); setDraft(freshDraft()); setCreateOpen(true); }}><Plus className="size-4" /> Create structure</button>
        </div>
      </section>

      {feedback && <div role={feedback.kind === "error" ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-xl border p-3 text-sm", feedback.kind === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-success/30 bg-success/5 text-foreground")}><span className="min-w-0 flex-1">{feedback.text}</span><button type="button" onClick={() => setFeedback(null)} aria-label="Dismiss message"><X className="size-4" /></button></div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Metric label="Active structures" value={structuresQuery.isPending ? "—" : String(activeCount)} detail="Available for future billing" icon={CheckCircle2} />
        <Metric label="All templates" value={structuresQuery.isPending ? "—" : String(totalTemplates)} detail="Includes archived structures" icon={FileText} />
        <Metric label="Bills issued" value={structuresQuery.isPending ? "—" : String(totalBills)} detail="Bills linked to these structures" icon={Archive} />
      </div>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><input aria-label="Search fee structures" className={cn(fieldClass, "pl-9")} placeholder="Search structure, class or item…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <div className="w-full sm:w-44"><Select value={status} onValueChange={setStatus}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ACTIVE">Active</SelectItem><SelectItem value="ARCHIVED">Archived</SelectItem><SelectItem value="ALL">All structures</SelectItem></SelectContent></Select></div>
        </div>
        {structuresQuery.isPending ? <div className="grid gap-4 pt-5 sm:grid-cols-2 xl:grid-cols-3">{[1,2,3].map(item => <div key={item} className="h-60 animate-pulse rounded-2xl bg-muted" />)}</div>
        : structuresQuery.error ? <ErrorState message={structuresQuery.error.message} />
        : filteredStructures.length ? <div className="grid min-w-0 gap-4 pt-5 sm:grid-cols-2 xl:grid-cols-3">{filteredStructures.map((structure) => <FeeStructureCard key={structure.id} structure={structure} busy={setActive.isPending} onToggle={() => setActive.mutate({ id: structure.id, isActive: !structure.isActive })} />)}</div>
        : <EmptyState title={search ? "No matching structures" : status === "ARCHIVED" ? "No archived fee structures" : "No fee structures yet"} description="Create a reusable fee template and add one or more billing items. You can assign it to specific classes or leave it available to all classes." onCreate={() => { setDraft(freshDraft()); setCreateOpen(true); }} />}
      </section>

      {createOpen && <Modal title="Create fee structure" description="Create a template first. Invoices are generated separately from the Invoices & Billing page." onClose={() => { if (!createStructure.isPending) setCreateOpen(false); }}>
        <form onSubmit={submitStructure} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Structure name"><input className={fieldClass} required minLength={2} maxLength={120} value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} placeholder="e.g. JHS 1 Term Fees" /></Field>
            <Field label="Class level (optional)"><input className={fieldClass} value={draft.classLevel} onChange={(event) => updateDraft("classLevel", event.target.value)} placeholder="e.g. Junior High School" /></Field>
          </div>
          <Field label="Description (optional)"><textarea className={cn(fieldClass, "h-20 py-2")} maxLength={500} value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} placeholder="What this fee structure covers" /></Field>
          <div className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-sm font-semibold text-foreground">Term-based billing</p><p className="mt-1 text-xs text-muted-foreground">Turn off for a one-off or non-term fee template.</p></div>
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.termBased} onChange={(event) => updateDraft("termBased", event.target.checked)} className="size-4 accent-primary" /> Apply per term</label>
          </div>
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-foreground">Applicable classes</h3><p className="mt-1 text-xs text-muted-foreground">Leave all unchecked to make this template available for any class.</p></div><span className="text-xs text-muted-foreground">{draft.targetClassIds.length} selected</span></div>
            {classesQuery.isPending ? <p className="text-sm text-muted-foreground">Loading classes…</p> : classesQuery.error ? <ErrorState message={classesQuery.error.message} /> : classes.length ? <div className="grid max-h-40 gap-2 overflow-y-auto rounded-xl border border-border p-3 sm:grid-cols-2">{classes.map((schoolClass) => <label key={schoolClass.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/50"><input type="checkbox" checked={draft.targetClassIds.includes(schoolClass.id)} onChange={(event) => updateDraft("targetClassIds", event.target.checked ? [...draft.targetClassIds, schoolClass.id] : draft.targetClassIds.filter(id => id !== schoolClass.id))} className="size-4 accent-primary" /><span>{schoolClass.name}</span></label>)}</div> : <p className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">No active classes found. You can still save a general fee structure.</p>}
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold text-foreground">Fee items</h3><p className="mt-1 text-xs text-muted-foreground">Choose a standard category, set its amount and mark optional items.</p></div><button type="button" className={secondaryButton} onClick={() => updateDraft("items", [...draft.items, blankItem()])}><Plus className="size-4" /> Add item</button></div>
            {registryItems.length === 0 && <div className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">There are no standard categories yet. You can create categories using <button type="button" className="font-semibold text-primary underline" onClick={() => setRegistryOpen(true)}>Fee item categories</button>; you can also enter a custom item name below.</div>}
            {draft.items.map((item,index) => <div key={item.rowId} className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
              <div className="flex items-start gap-3"><div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[1fr_140px]">
                <div className="grid gap-1.5"><label className="text-xs font-medium text-muted-foreground">Standard category (optional)</label><Select value={item.registryItemId || "custom"} onValueChange={(value) => { const registry = registryItems.find(candidate => candidate.id === value); updateItem(item.rowId, value === "custom" ? { registryItemId: "", name: "" } : { registryItemId: value, name: registry?.name ?? item.name }); }}><SelectTrigger className="w-full"><SelectValue placeholder="Choose category" /></SelectTrigger><SelectContent><SelectItem value="custom">Custom fee item</SelectItem>{registryItems.map(registry => <SelectItem key={registry.id} value={registry.id}>{registry.name}</SelectItem>)}</SelectContent></Select></div>
                <Field label="Amount (GHS)"><input type="number" required min="0" step="0.01" className={fieldClass} value={item.amount} onChange={(event) => updateItem(item.rowId, { amount: event.target.value })} placeholder="0.00" /></Field>
              </div><button type="button" aria-label={`Remove fee item ${index + 1}`} disabled={draft.items.length === 1} onClick={() => updateDraft("items", draft.items.filter(row => row.rowId !== item.rowId))} className="mt-5 rounded-lg p-2 text-muted-foreground hover:bg-muted disabled:opacity-30"><X className="size-4" /></button></div>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]"><Field label="Item name"><input className={fieldClass} required value={item.name} onChange={(event) => updateItem(item.rowId, { name: event.target.value })} placeholder="e.g. Tuition" /></Field><label className="flex items-center gap-2 text-sm text-foreground sm:mt-6"><input type="checkbox" checked={item.isOptional} onChange={(event) => updateItem(item.rowId, { isOptional: event.target.checked })} className="size-4 accent-primary" /> Optional item</label></div>
              <Field label="Item description (optional)"><input className={fieldClass} value={item.description} onChange={(event) => updateItem(item.rowId, { description: event.target.value })} placeholder="Additional detail for the item" /></Field>
            </div>)}
            <div className="flex items-center justify-between rounded-xl bg-primary/5 p-3"><span className="text-sm font-semibold text-foreground">Structure total</span><span className="text-lg font-bold tabular-nums text-foreground">{money(draftTotal)}</span></div>
          </div>
          {createStructure.error && <ErrorState message={createStructure.error.message} />}
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4"><button type="button" className={secondaryButton} onClick={() => setCreateOpen(false)} disabled={createStructure.isPending}>Cancel</button><button type="submit" className={primaryButton} disabled={createStructure.isPending}>{createStructure.isPending && <LoaderCircle className="size-4 animate-spin" />} Save fee structure</button></div>
        </form>
      </Modal>}

      {registryOpen && <Modal title="Fee item categories" description="Maintain standard fee item names to reuse across fee structures." onClose={() => { if (!createRegistryItem.isPending) setRegistryOpen(false); }}>
        <form onSubmit={(event) => { event.preventDefault(); createRegistryItem.mutate({ name: registryName.trim(), description: registryDescription.trim() || undefined }); }} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Category name"><input className={fieldClass} required minLength={2} maxLength={120} value={registryName} onChange={(event) => setRegistryName(event.target.value)} placeholder="e.g. Tuition, ICT, Transport" /></Field><Field label="Description (optional)"><input className={fieldClass} maxLength={500} value={registryDescription} onChange={(event) => setRegistryDescription(event.target.value)} placeholder="Short description" /></Field></div>
          {createRegistryItem.error && <ErrorState message={createRegistryItem.error.message} />}
          <div className="flex justify-end"><button type="submit" className={primaryButton} disabled={createRegistryItem.isPending || registryName.trim().length < 2}>{createRegistryItem.isPending && <LoaderCircle className="size-4 animate-spin" />} Add category</button></div>
        </form>
        <div className="mt-5 border-t border-border pt-4"><h3 className="text-sm font-semibold text-foreground">Saved categories ({registryItems.length})</h3>{registryQuery.isPending ? <p className="mt-2 text-sm text-muted-foreground">Loading categories…</p> : registryQuery.error ? <ErrorState message={registryQuery.error.message} /> : registryItems.length ? <div className="mt-3 divide-y divide-border">{registryItems.map(item => <div key={item.id} className="flex items-start gap-3 py-2.5"><Tags className="mt-0.5 size-4 text-muted-foreground" /><div><p className="text-sm font-medium text-foreground">{item.name}</p>{item.description && <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>}</div></div>)}</div> : <p className="mt-2 text-sm text-muted-foreground">No categories saved yet.</p>}</div>
      </Modal>}
    </div>
  );
}

function FeeStructureCard({ structure, busy, onToggle }: { structure: FeeStructure; busy: boolean; onToggle: () => void }) {
  const total = structure.items.reduce((sum, item) => sum + Number(item.amount), 0);
  const optional = structure.items.filter(item => item.isOptional).reduce((sum, item) => sum + Number(item.amount), 0);
  const classes = structure.targetClasses.map(target => target.class.name);
  return <article className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
    <div className={cn("h-1 w-full", structure.isActive ? "bg-primary" : "bg-muted-foreground/30")} />
    <div className="flex-1 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-semibold text-foreground">{structure.name}</h2><div className="mt-2 flex flex-wrap gap-1.5">{structure.isActive ? <Badge tone="success">Active</Badge> : <Badge>Archived</Badge>}<Badge>{structure.termBased ? "Per term" : "One-off"}</Badge></div></div><span className="rounded-xl bg-primary/10 p-2 text-primary"><FileText className="size-4" /></span></div>
      {structure.description && <p className="mt-3 line-clamp-2 text-sm leading-5 text-muted-foreground">{structure.description}</p>}
      <p className="mt-3 text-xs text-muted-foreground">Applies to: <span className="font-medium text-foreground">{classes.length ? classes.join(", ") : structure.classLevel || "All classes"}</span></p>
      <div className="mt-4 space-y-2">{structure.items.map(item => <div key={item.id} className="flex items-start justify-between gap-3 text-sm"><div className="min-w-0"><p className="break-words font-medium text-foreground">{item.name}{item.isOptional && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Optional</span>}</p>{item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}</div><span className="shrink-0 tabular-nums text-foreground">{money(Number(item.amount))}</span></div>)}</div>
      <div className="mt-4 space-y-1 border-t border-border pt-3"><div className="flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">Structure total</span><span className="font-bold tabular-nums text-foreground">{money(total)}</span></div>{optional > 0 && <p className="text-[11px] text-muted-foreground">{money(optional)} of the total is marked optional.</p>}</div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/20 px-4 py-3"><span className="text-xs text-muted-foreground">{structure._count?.bills ?? 0} linked bill(s)</span><button type="button" className={cn("inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold transition hover:bg-muted disabled:opacity-50", structure.isActive ? "text-muted-foreground" : "text-primary")} disabled={busy} onClick={onToggle}>{busy ? <LoaderCircle className="size-3.5 animate-spin" /> : structure.isActive ? <Archive className="size-3.5" /> : <RefreshCw className="size-3.5" />}{structure.isActive ? "Archive" : "Reactivate"}</button></div>
  </article>;
}
function Metric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof FileText }) {
  return <div className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-muted-foreground">{label}</p><Icon className="size-4 text-primary" /></div><p className="mt-3 text-2xl font-bold tracking-tight text-foreground">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1.5 text-sm font-medium text-foreground">{label}{children}</label>;
}
function Modal({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/70 p-3 sm:p-6" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-label={title} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl sm:p-6"><div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div><button type="button" onClick={onClose} aria-label="Close dialog" className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><X className="size-4" /></button></div>{children}</section></div>;
}
function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "success" }) {
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide", tone === "success" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>{children}</span>;
}
function EmptyState({ title, description, onCreate }: { title: string; description: string; onCreate: () => void }) {
  return <div className="col-span-full rounded-xl border border-dashed border-border bg-muted/20 px-5 py-12 text-center"><FileText className="mx-auto size-8 text-muted-foreground" /><h3 className="mt-3 font-semibold text-foreground">{title}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p><button type="button" className={cn(primaryButton, "mt-4")} onClick={onCreate}><Plus className="size-4" /> Create fee structure</button></div>;
}
function ErrorState({ message }: { message: string }) {
  return <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><CircleAlert className="mr-2 inline size-4" />{message}</div>;
}
