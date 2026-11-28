import { toast } from "@/components/ui/toaster";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, LoaderCircle, Plus, Sparkles, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useFinanceAccess } from "@/components/portal/finance-access";
import { LabeledField } from "@/components/forms/labeled-controls";

type Status = "DRAFT" | "ACTIVE" | "RETIRED";
interface TaxSchedule {
  id: string; schoolId: string | null; name: string; effectiveFrom: string; effectiveTo: string | null;
  nonResidentRate: string; status: Status; sourceNote: string | null; approvedById: string | null;
  bands: Array<{ position: number; width: string | null; rate: string }>;
}
interface Scheme {
  id: string; schoolId: string | null; key: string; label: string; base: string; employeeRate: string;
  employerRate: string; memoRate: string; status: Status; effectiveFrom: string; effectiveTo: string | null; sourceNote: string | null;
}
interface SettingsResponse { taxSchedules: TaxSchedule[]; schemes: Scheme[] }
interface Template { taxSchedule: { name: string; effectiveFrom: string; nonResidentRate: string; sourceNote: string; bands: Array<{ width: string | null; rate: string }> } }
type Kind = "tax" | "scheme";

const fieldClass = "h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/30";
const primaryButton = "inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton = "inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";
const day = (value: string | null) => (value ? value.slice(0, 10) : "open-ended");
const tone = (status: Status) => status === "ACTIVE" ? "bg-success/10 text-success" : status === "DRAFT" ? "bg-warning/10 text-foreground" : "bg-muted text-muted-foreground";
const emptyBand = () => ({ width: "", rate: "" });

/** Everything the accountant needs to make a month "ready": draft a schedule, approve it, end it later. */
export function PayrollSettingsPanel() {
  const { canWrite } = useFinanceAccess();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [endingId, setEndingId] = useState<string | null>(null);
  const [endDate, setEndDate] = useState("");
  const [form, setForm] = useState({ name: "", effectiveFrom: "", effectiveTo: "", nonResidentRate: "25", sourceNote: "" });
  const [bands, setBands] = useState([emptyBand()]);

  const settings = useQuery({ queryKey: ["finance", "payroll-settings"], queryFn: () => apiFetch<SettingsResponse>("/finance/payroll/settings"), retry: false });
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["finance", "payroll-settings"] }),
    queryClient.invalidateQueries({ queryKey: ["finance", "payroll-readiness"] }),
  ]);
  const onError = (error: Error) => toast.error(error.message);
  const ok = (text: string) => async () => { toast.success(text); await refresh(); };

  const starter = useMutation({
    mutationFn: () => apiFetch<{ taxSchedules: number; schemes: number }>("/finance/payroll/settings/starter-drafts", { method: "POST" }),
    onSuccess: async (r) => { await refresh(); toast.success(r.taxSchedules + r.schemes ? "Ghana starter drafts created. Review them against the source, then approve each one." : "Starter drafts already exist."); },
    onError,
  });
  const createTax = useMutation({
    mutationFn: () => apiFetch("/finance/payroll/settings/tax-schedules", {
      method: "POST",
      body: JSON.stringify({
        name: form.name.trim(), effectiveFrom: form.effectiveFrom, effectiveTo: form.effectiveTo || null,
        nonResidentRate: form.nonResidentRate, sourceNote: form.sourceNote.trim(),
        bands: bands.map(b => ({ width: b.width.trim() === "" ? null : b.width.trim(), rate: b.rate.trim() })),
      }),
    }),
    onSuccess: async () => { setShowForm(false); setBands([emptyBand()]); await ok("PAYE schedule saved as a draft. Approve it to use it in payroll.")(); },
    onError,
  });
  const activate = useMutation({
    mutationFn: ({ kind, id }: { kind: Kind; id: string }) => apiFetch(`/finance/payroll/settings/${kind}/${id}/activate`, { method: "POST" }),
    onSuccess: ok("Approved. Payroll can now use this setting for periods it covers."), onError,
  });
  const discard = useMutation({
    mutationFn: ({ kind, id }: { kind: Kind; id: string }) => apiFetch(`/finance/payroll/settings/${kind}/${id}`, { method: "DELETE" }),
    onSuccess: ok("Draft discarded."), onError,
  });
  const end = useMutation({
    mutationFn: ({ kind, id }: { kind: Kind; id: string }) =>
      apiFetch(`/finance/payroll/settings/${kind}/${id}/end`, { method: "PATCH", body: JSON.stringify({ effectiveTo: endDate }) }),
    onSuccess: async () => { setEndingId(null); setEndDate(""); await ok("End date saved.")(); }, onError,
  });

  async function loadGhanaTemplate() {
    try {
      const { taxSchedule } = await apiFetch<Template>("/finance/payroll/settings/templates");
      setForm(f => ({ ...f, name: taxSchedule.name, effectiveFrom: taxSchedule.effectiveFrom, nonResidentRate: taxSchedule.nonResidentRate, sourceNote: taxSchedule.sourceNote }));
      setBands(taxSchedule.bands.map(b => ({ width: b.width ?? "", rate: b.rate })));
    } catch (error) { onError(error as Error); }
  }
  function submitTax(event: FormEvent) {
    event.preventDefault();

    createTax.mutate();
  }
  const busy = activate.isPending || discard.isPending || end.isPending;
  // A plain function (not a nested component) so typing in a row's date field never remounts it.
  const renderRow = ({ kind, id, status, own, title, detail, source }: { kind: Kind; id: string; status: Status; own: boolean; title: string; detail: string; source: string | null }) => (
    <li key={id} className="rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title} <span className={cn("ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold", tone(status))}>{status}{!own ? " · PLATFORM" : ""}</span></p>
          <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
          {source && <p className="mt-1 text-xs text-muted-foreground">Source: {source}</p>}
        </div>
        {canWrite && own && <div className="flex flex-wrap gap-2">
          {status === "DRAFT" && <>
            <button type="button" className={primaryButton} disabled={busy} onClick={() => {  activate.mutate({ kind, id }); }}><CheckCircle2 className="size-4" /> Approve</button>
            <button type="button" className={secondaryButton} disabled={busy} onClick={() => {  discard.mutate({ kind, id }); }}><Trash2 className="size-4" /> Discard</button>
          </>}
          {status === "ACTIVE" && <button type="button" className={secondaryButton} onClick={() => { setEndingId(endingId === id ? null : id); setEndDate(""); }}>Set end date</button>}
        </div>}
      </div>
      {endingId === id && <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
        <LabeledField label="Last day this applies"><input type="date" className={fieldClass} value={endDate} onChange={e => setEndDate(e.target.value)} /></LabeledField>
        <button type="button" className={primaryButton} disabled={!endDate || end.isPending} onClick={() => end.mutate({ kind, id })}>Save end date</button>
      </div>}
    </li>
  );

  const data = settings.data;
  const noneActive = !!data && !data.taxSchedules.some(s => s.status === "ACTIVE");
  return <div className="space-y-5">
    <div className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">
      Payroll only uses PAYE schedules and contribution schemes that are <strong className="text-foreground">approved</strong>, carry an official source and cover the pay month. Draft first, then approve (the school's approval settings decide who may approve).
    </div>

    {canWrite && <div className="flex flex-wrap gap-2">
      <button type="button" className={primaryButton} disabled={starter.isPending} onClick={() => {  starter.mutate(); }}>
        {starter.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Create Ghana starter drafts
      </button>
      <button type="button" className={secondaryButton} onClick={() => setShowForm(v => !v)}><Plus className="size-4" /> New PAYE schedule</button>
    </div>}
    {noneActive && <p className="text-sm text-muted-foreground">No PAYE schedule is approved yet, so payroll cannot be generated. Use the starter drafts (Ghana 2026 bands and SSNIT), check them against the source note, then approve.</p>}

    {showForm && canWrite && <form onSubmit={submitTax} className="space-y-3 rounded-xl border border-border p-4">
      <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold text-foreground">New PAYE schedule (monthly bands)</h4><button type="button" className={secondaryButton} onClick={loadGhanaTemplate}>Load Ghana template</button></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <LabeledField label="Name"><input required className={fieldClass} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></LabeledField>
        <LabeledField label="Non-resident flat rate (%)"><input required inputMode="decimal" className={fieldClass} value={form.nonResidentRate} onChange={e => setForm({ ...form, nonResidentRate: e.target.value })} /></LabeledField>
        <LabeledField label="Effective from"><input required type="date" className={fieldClass} value={form.effectiveFrom} onChange={e => setForm({ ...form, effectiveFrom: e.target.value })} /></LabeledField>
        <LabeledField label="Effective to (optional)"><input type="date" className={fieldClass} value={form.effectiveTo} onChange={e => setForm({ ...form, effectiveTo: e.target.value })} /></LabeledField>
      </div>
      <LabeledField label="Official source (required)"><textarea required minLength={5} rows={2} className={cn(fieldClass, "h-auto py-2")} value={form.sourceNote} onChange={e => setForm({ ...form, sourceNote: e.target.value })} placeholder="e.g. GRA PAYE schedule, link or circular number" /></LabeledField>
      <div className="space-y-2">
        <p className="text-xs font-semibold text-foreground">Bands, lowest first. Leave the last width empty: it is open-ended.</p>
        {bands.map((band, i) => <div key={i} className="flex items-end gap-2">
          <LabeledField label={i === 0 ? "Band width (GHS / month)" : "Width"}><input inputMode="decimal" className={fieldClass} value={band.width} placeholder={i === bands.length - 1 ? "open-ended" : "0.00"} onChange={e => setBands(bands.map((b, j) => j === i ? { ...b, width: e.target.value } : b))} /></LabeledField>
          <LabeledField label={i === 0 ? "Rate (%)" : "Rate"}><input required inputMode="decimal" className={fieldClass} value={band.rate} onChange={e => setBands(bands.map((b, j) => j === i ? { ...b, rate: e.target.value } : b))} /></LabeledField>
          <button type="button" className={secondaryButton} aria-label="Remove band" disabled={bands.length === 1} onClick={() => setBands(bands.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
        </div>)}
        <button type="button" className={secondaryButton} onClick={() => setBands([...bands, emptyBand()])}><Plus className="size-4" /> Add band</button>
      </div>
      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <button type="button" className={secondaryButton} onClick={() => setShowForm(false)}>Cancel</button>
        <button type="submit" className={primaryButton} disabled={createTax.isPending}>{createTax.isPending && <LoaderCircle className="size-4 animate-spin" />} Save as draft</button>
      </div>
    </form>}

    {settings.isPending ? <p className="text-sm text-muted-foreground">Loading payroll settings…</p> : settings.error ? <p className="text-sm text-destructive">{settings.error.message}</p> : <>
      <section><h4 className="mb-2 text-sm font-semibold text-foreground">PAYE tax schedules</h4>
        {data!.taxSchedules.length ? <ul className="space-y-2">{data!.taxSchedules.map(s => renderRow({ kind: "tax", id: s.id, status: s.status, own: s.schoolId !== null, title: s.name,
          detail: `${day(s.effectiveFrom)} to ${day(s.effectiveTo)} · ${s.bands.length} bands · non-resident ${Number(s.nonResidentRate)}%`, source: s.sourceNote }))}</ul> : <p className="text-sm text-muted-foreground">None yet.</p>}
      </section>
      <section><h4 className="mb-2 text-sm font-semibold text-foreground">Contribution schemes (SSNIT, Tier 2 and others)</h4>
        {data!.schemes.length ? <ul className="space-y-2">{data!.schemes.map(s => renderRow({ kind: "scheme", id: s.id, status: s.status, own: s.schoolId !== null, title: `${s.label} (${s.key})`,
          detail: `${day(s.effectiveFrom)} to ${day(s.effectiveTo)} · employee ${Number(s.employeeRate)}% · employer ${Number(s.employerRate)}% · memo ${Number(s.memoRate)}% of ${s.base.toLowerCase()}`, source: s.sourceNote }))}</ul> : <p className="text-sm text-muted-foreground">None yet.</p>}
      </section>
    </>}
  </div>;
}
