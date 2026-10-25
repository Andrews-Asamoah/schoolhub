import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, LoaderCircle, Plus, ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/api";

type BandDraft = { width: string; rate: string };
type TaxBand = { id: string; order: number; width: string | null; rate: string };
type TaxSchedule = {
  id: string; name: string; effectiveFrom: string; effectiveTo?: string | null;
  status: "DRAFT" | "PENDING_APPROVAL" | "ACTIVE" | "ARCHIVED"; needsVerification: boolean;
  verificationNotes?: string | null; sourceNote?: string | null; bands: TaxBand[];
};
type ContributionScheme = {
  id: string; code: string; label: string; trusteeName?: string | null; employeeRate: string; employerRate: string;
  base: string; effectiveFrom: string; effectiveTo?: string | null; status: "DRAFT" | "PENDING_APPROVAL" | "ACTIVE" | "ARCHIVED";
  needsVerification: boolean; verificationNotes?: string | null; sourceNote?: string | null; tier3ReliefCap?: string | null;
};
const field = "min-h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";
const button = "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const secondary = "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50";
const defaultBands: BandDraft[] = [
  { width: "588", rate: "0" }, { width: "80", rate: "5" }, { width: "100", rate: "10" },
  { width: "2900", rate: "17.5" }, { width: "16000", rate: "25" }, { width: "30332", rate: "30" }, { width: "", rate: "35" },
];
const today = () => new Date().toISOString().slice(0, 10);
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";

export function PayrollSettingsWorkspace({ role }: { role: string }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"tax" | "schemes" | "profiles">("tax");
  const [name, setName] = useState("PAYE schedule");
  const [effectiveFrom, setEffectiveFrom] = useState(today());
  const [sourceNote, setSourceNote] = useState("");
  const [bands, setBands] = useState<BandDraft[]>(defaultBands);
  const [verificationNotes, setVerificationNotes] = useState("");
  const [schemeCode, setSchemeCode] = useState("SSNIT_TIER1");
  const [schemeLabel, setSchemeLabel] = useState("SSNIT Tier 1");
  const [trusteeName, setTrusteeName] = useState("");
  const [employeeRate, setEmployeeRate] = useState("5.5");
  const [employerRate, setEmployerRate] = useState("13");
  const [base, setBase] = useState("BASIC");
  const [insurableMinimum, setInsurableMinimum] = useState("587.80");
  const [insurableMaximum, setInsurableMaximum] = useState("69000");
  const [tier3ReliefCap, setTier3ReliefCap] = useState("");
  const [schemeSourceNote, setSchemeSourceNote] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const canApprove = role === "owner" || role === "headteacher";

  const schedulesQuery = useQuery({ queryKey: ["finance", "payroll-settings", "tax-schedules"], queryFn: () => apiFetch<TaxSchedule[]>("/finance/payroll-settings/tax-schedules"), retry: false });
  const schemesQuery = useQuery({ queryKey: ["finance", "payroll-settings", "contribution-schemes"], queryFn: () => apiFetch<ContributionScheme[]>("/finance/payroll-settings/contribution-schemes"), retry: false });
  const refresh = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["finance", "payroll-settings", "tax-schedules"] }),
    queryClient.invalidateQueries({ queryKey: ["finance", "payroll-settings", "contribution-schemes"] }),
  ]);
  const createSchedule = useMutation({
    mutationFn: () => apiFetch<TaxSchedule>("/finance/payroll-settings/tax-schedules", { method: "POST", body: JSON.stringify({
      name, effectiveFrom, effectiveTo: null, sourceNote,
      bands: bands.map((band, index) => ({ width: index === bands.length - 1 ? null : band.width, rate: band.rate })),
    }) }),
    onSuccess: async () => { setFeedback({ kind: "success", text: "Draft PAYE schedule saved. It remains unverified and cannot be used until an authorized reviewer verifies and approves it." }); await refresh(); },
    onError: (error: Error) => setFeedback({ kind: "error", text: error.message }),
  });
  const createScheme = useMutation({
    mutationFn: () => apiFetch<ContributionScheme>("/finance/payroll-settings/contribution-schemes", { method: "POST", body: JSON.stringify({
      code: schemeCode, label: schemeLabel, trusteeName: trusteeName || null, employeeRate, employerRate, base,
      insurableMinimum: schemeCode === "SSNIT_TIER1" ? insurableMinimum : null,
      insurableMaximum: schemeCode === "SSNIT_TIER1" ? insurableMaximum : null,
      whoPays: "SHARED", employeeShareTaxDeductible: true, tier3ReliefCap: schemeCode === "TIER3" ? tier3ReliefCap || null : null,
      carvedFromSchemeId: null, carveType: "ADDITIONAL", effectiveFrom, effectiveTo: null, sourceNote: schemeSourceNote,
    }) }),
    onSuccess: async () => { setFeedback({ kind: "success", text: "Draft contribution scheme saved. It remains unverified until its official source is reviewed." }); await refresh(); },
    onError: (error: Error) => setFeedback({ kind: "error", text: error.message }),
  });
  const scheduleAction = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "submit" | "verify" | "approve" }) =>
      apiFetch<TaxSchedule>(`/finance/payroll-settings/tax-schedules/${encodeURIComponent(id)}/${action}`, {
        method: "POST",
        ...(action === "verify" ? { body: JSON.stringify({ verificationNotes }) } : {}),
      }),
    onSuccess: async (_data, variables) => { setFeedback({ kind: "success", text: `PAYE schedule ${variables.action === "verify" ? "verified" : variables.action === "approve" ? "approved" : "submitted"}.` }); await refresh(); },
    onError: (error: Error) => setFeedback({ kind: "error", text: error.message }),
  });
  const schemeAction = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "submit" | "verify" | "approve" }) =>
      apiFetch<ContributionScheme>(`/finance/payroll-settings/contribution-schemes/${encodeURIComponent(id)}/${action}`, {
        method: "POST",
        ...(action === "verify" ? { body: JSON.stringify({ verificationNotes }) } : {}),
      }),
    onSuccess: async (_data, variables) => { setFeedback({ kind: "success", text: `Contribution scheme ${variables.action === "verify" ? "verified" : variables.action === "approve" ? "approved" : "submitted"}.` }); await refresh(); },
    onError: (error: Error) => setFeedback({ kind: "error", text: error.message }),
  });

  const updateBand = (index: number, key: keyof BandDraft, value: string) =>
    setBands((current) => current.map((band, position) => position === index ? { ...band, [key]: value } : band));
  const schedules = schedulesQuery.data ?? [];
  const schemes = schemesQuery.data ?? [];

  return <div className="mx-auto w-full min-w-0 max-w-screen-2xl space-y-6">
    <header className="space-y-2">
      <div className="flex items-center gap-3"><div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ShieldCheck className="size-5" /></div><div><h1 className="text-2xl font-semibold tracking-tight text-foreground">Payroll statutory settings</h1><p className="text-sm text-muted-foreground">Manage effective-dated PAYE and pension rules with independent verification and approval.</p></div></div>
      <div role="alert" className="flex gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm text-foreground"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><p>Seeded legacy values are explicitly unverified. Do not approve rates, Tier 3 relief, or employer-borne-share tax treatment until official guidance has been checked and recorded. A draft never affects payroll.</p></div>
    </header>
    {feedback && <div role="status" className={`rounded-xl border p-3 text-sm ${feedback.kind === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-success/30 bg-success/5 text-foreground"}`}>{feedback.text}</div>}
    <div className="flex flex-wrap gap-2 border-b border-border pb-3">
      {([{ id: "tax", label: "PAYE bands" }, { id: "schemes", label: "Pension schemes" }, { id: "profiles", label: "Employee profiles" }] as const).map((item) => <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`rounded-xl px-4 py-2 text-sm font-medium ${tab === item.id ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted"}`}>{item.label}</button>)}
    </div>

    {tab === "tax" && <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div><h2 className="font-semibold text-foreground">Create PAYE schedule</h2><p className="mt-1 text-xs text-muted-foreground">Enter monetary widths and percentage rates as decimal text. The last band must be open-ended.</p></div>
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); createSchedule.mutate(); }}>
          <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1.5 text-sm"><span className="text-muted-foreground">Schedule name</span><input required className={field} value={name} onChange={(event) => setName(event.target.value)} /></label><label className="space-y-1.5 text-sm"><span className="text-muted-foreground">Effective from</span><input required type="date" className={field} value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></label></div>
          <label className="block space-y-1.5 text-sm"><span className="text-muted-foreground">Official source note</span><textarea required minLength={10} className={`${field} min-h-20`} value={sourceNote} onChange={(event) => setSourceNote(event.target.value)} placeholder="Official GRA notice and effective date; do not mark as verified until checked." /></label>
          <div className="space-y-2"><div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground"><span>Band width (GHS)</span><span>Rate (%)</span><span>Band</span></div>
            {bands.map((band, index) => <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2"><input aria-label={`Band ${index + 1} width`} disabled={index === bands.length - 1} className={field} value={index === bands.length - 1 ? "Open-ended" : band.width} onChange={(event) => updateBand(index, "width", event.target.value)} /><input aria-label={`Band ${index + 1} rate`} required className={field} value={band.rate} onChange={(event) => updateBand(index, "rate", event.target.value)} /><span className="w-8 text-center text-xs text-muted-foreground">{index + 1}</span></div>)}
            <button type="button" className={secondary} onClick={() => setBands((current) => [...current.slice(0, -1), { width: "1000", rate: current[current.length - 1]?.rate ?? "35" }, { width: "", rate: "35" }])}><Plus className="size-4" /> Add band</button>
          </div>
          <button className={button} type="submit" disabled={createSchedule.isPending}>{createSchedule.isPending && <LoaderCircle className="size-4 animate-spin" />} Save unverified draft</button>
        </form>
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold text-foreground">Schedules and approval inbox</h2>
        {schedulesQuery.isLoading && <p className="text-sm text-muted-foreground">Loading schedules…</p>}
        {schedulesQuery.error && <p role="alert" className="text-sm text-destructive">{errorMessage(schedulesQuery.error)}</p>}
        {schedules.map((schedule) => <article key={schedule.id} className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold text-foreground">{schedule.name}</h3><p className="mt-1 text-xs text-muted-foreground">Effective {schedule.effectiveFrom.slice(0, 10)}{schedule.effectiveTo ? ` to ${schedule.effectiveTo.slice(0, 10)}` : " onward"}</p></div><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">{schedule.status.replaceAll("_", " ")}</span></div>
          {schedule.needsVerification && <p className="text-xs font-medium text-warning">Needs official-source verification — cannot be approved or used.</p>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{schedule.bands.map((band) => <div key={band.id} className="rounded-lg bg-muted/30 p-2 text-xs"><p className="text-muted-foreground">Band {band.order}</p><p className="mt-1 font-medium text-foreground">{band.width ?? "Open-ended"} · {band.rate}%</p></div>)}</div>
          <div className="flex flex-wrap gap-2">
            {schedule.status === "DRAFT" && <button className={secondary} type="button" onClick={() => scheduleAction.mutate({ id: schedule.id, action: "submit" })} disabled={scheduleAction.isPending}>Submit for approval</button>}
            {canApprove && schedule.needsVerification && <button className={secondary} type="button" onClick={() => scheduleAction.mutate({ id: schedule.id, action: "verify" })} disabled={scheduleAction.isPending || verificationNotes.trim().length < 10}>Verify source</button>}
            {canApprove && schedule.status === "PENDING_APPROVAL" && <button className={button} type="button" onClick={() => scheduleAction.mutate({ id: schedule.id, action: "approve" })} disabled={scheduleAction.isPending || schedule.needsVerification}>Approve</button>}
          </div>
        </article>)}
        {canApprove && <label className="block space-y-1.5 rounded-xl border border-border bg-card p-3 text-sm"><span className="font-medium text-foreground">Verification notes (required before approval)</span><textarea className={`${field} min-h-20`} value={verificationNotes} onChange={(event) => setVerificationNotes(event.target.value)} placeholder="Record the official source checked and the verified values." /></label>}
      </section>
    </div>}

    {tab === "schemes" && <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div><h2 className="font-semibold text-foreground">Create pension scheme</h2><p className="mt-1 text-xs text-muted-foreground">Tier 2 and Tier 3 remain optional. Legal values must be verified before approval.</p></div>
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); createScheme.mutate(); }}>
          <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1.5 text-sm"><span className="text-muted-foreground">Scheme code</span><select className={field} value={schemeCode} onChange={(event) => { setSchemeCode(event.target.value); setSchemeLabel(event.target.value.replaceAll("_", " ")); }}><option value="SSNIT_TIER1">SSNIT Tier 1</option><option value="TIER2">Tier 2</option><option value="TIER3">Tier 3</option><option value="CUSTOM">Custom</option></select></label><label className="space-y-1.5 text-sm"><span className="text-muted-foreground">Label</span><input required className={field} value={schemeLabel} onChange={(event) => setSchemeLabel(event.target.value)} /></label></div>
          <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1.5 text-sm"><span className="text-muted-foreground">Employee rate (%)</span><input required className={field} value={employeeRate} onChange={(event) => setEmployeeRate(event.target.value)} /></label><label className="space-y-1.5 text-sm"><span className="text-muted-foreground">Employer rate (%)</span><input required className={field} value={employerRate} onChange={(event) => setEmployerRate(event.target.value)} /></label></div>
          <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1.5 text-sm"><span className="text-muted-foreground">Contribution base</span><select className={field} value={base} onChange={(event) => setBase(event.target.value)}><option value="BASIC">Basic salary</option><option value="GROSS">Gross salary</option><option value="PENSIONABLE_ITEMS">Pensionable items</option></select></label><label className="space-y-1.5 text-sm"><span className="text-muted-foreground">Trustee name (if applicable)</span><input className={field} value={trusteeName} onChange={(event) => setTrusteeName(event.target.value)} /></label></div>
          {schemeCode === "SSNIT_TIER1" && <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1.5 text-sm"><span className="text-muted-foreground">Insurable minimum (GHS)</span><input className={field} value={insurableMinimum} onChange={(event) => setInsurableMinimum(event.target.value)} /></label><label className="space-y-1.5 text-sm"><span className="text-muted-foreground">Insurable maximum (GHS)</span><input className={field} value={insurableMaximum} onChange={(event) => setInsurableMaximum(event.target.value)} /></label></div>}
          {schemeCode === "TIER3" && <label className="block space-y-1.5 text-sm"><span className="text-muted-foreground">Verified Tier 3 relief cap (GHS)</span><input required className={field} value={tier3ReliefCap} onChange={(event) => setTier3ReliefCap(event.target.value)} /></label>}
          <label className="block space-y-1.5 text-sm"><span className="text-muted-foreground">Effective from</span><input type="date" required className={field} value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></label>
          <label className="block space-y-1.5 text-sm"><span className="text-muted-foreground">Official source note</span><textarea required minLength={10} className={`${field} min-h-20`} value={schemeSourceNote} onChange={(event) => setSchemeSourceNote(event.target.value)} placeholder="Official SSNIT, NPRA or GRA source and effective date." /></label>
          <button className={button} type="submit" disabled={createScheme.isPending}>{createScheme.isPending && <LoaderCircle className="size-4 animate-spin" />} Save unverified scheme</button>
        </form>
      </section>
      <section className="space-y-3"><h2 className="font-semibold text-foreground">Contribution schemes and approval inbox</h2>
        {schemesQuery.isLoading && <p className="text-sm text-muted-foreground">Loading schemes…</p>}
        {schemesQuery.error && <p role="alert" className="text-sm text-destructive">{errorMessage(schemesQuery.error)}</p>}
        {schemes.map((scheme) => <article key={scheme.id} className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold text-foreground">{scheme.label}</h3><p className="mt-1 text-xs text-muted-foreground">{scheme.code} · {scheme.base} · Effective {scheme.effectiveFrom.slice(0, 10)}</p></div><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">{scheme.status.replaceAll("_", " ")}</span></div>
          <div className="grid grid-cols-2 gap-2"><div className="rounded-lg bg-muted/30 p-2 text-sm"><p className="text-xs text-muted-foreground">Employee rate</p><p className="font-semibold text-foreground">{scheme.employeeRate}%</p></div><div className="rounded-lg bg-muted/30 p-2 text-sm"><p className="text-xs text-muted-foreground">Employer rate</p><p className="font-semibold text-foreground">{scheme.employerRate}%</p></div></div>
          {scheme.trusteeName && <p className="text-xs text-muted-foreground">Trustee: {scheme.trusteeName}</p>}
          {scheme.needsVerification && <p className="text-xs font-medium text-warning">Needs official-source verification — cannot be approved or used.</p>}
          <div className="flex flex-wrap gap-2">
            {scheme.status === "DRAFT" && <button className={secondary} type="button" onClick={() => schemeAction.mutate({ id: scheme.id, action: "submit" })} disabled={schemeAction.isPending}>Submit for approval</button>}
            {canApprove && scheme.needsVerification && <button className={secondary} type="button" onClick={() => schemeAction.mutate({ id: scheme.id, action: "verify" })} disabled={schemeAction.isPending || verificationNotes.trim().length < 10}>Verify source</button>}
            {canApprove && scheme.status === "PENDING_APPROVAL" && <button className={button} type="button" onClick={() => schemeAction.mutate({ id: scheme.id, action: "approve" })} disabled={schemeAction.isPending || scheme.needsVerification}>Approve</button>}
          </div>
        </article>)}
      </section>
    </div>}

    {tab === "profiles" && <section className="rounded-2xl border border-border bg-card p-6"><h2 className="font-semibold text-foreground">Employee pay profiles</h2><p className="mt-2 text-sm text-muted-foreground">Profile editing, enrolment management, and audited bank-detail reveal are being wired to the protected pay-profile endpoints. Bank details must remain encrypted at rest and masked by default.</p></section>}
  </div>;
}
