import { DatePicker, DateTimePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronUp,
  ClipboardCheck,
  FileText,
  Layers3,
  LoaderCircle,
  Palette,
  RefreshCw,
  Send,
  Sparkles,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { HeadteacherReportApprovals } from "@/components/school/headteacher-report-approvals";

type Term = { id: string; name: string; termNumber: number; isCurrent: boolean };
type Year = { id: string; name: string; isCurrent: boolean; terms: Term[] };
type Template = {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  layout?: { type?: string; accentColor?: string; showPosition?: boolean; showAssessmentBreakdown?: boolean; sections?: string[] } | null;
};
type ReportSet = {
  id: string;
  name: string;
  status: "DRAFT" | "GENERATING" | "GENERATED" | "PUBLISHED" | "ARCHIVED";
  template: { id: string; name: string };
  academicYear: { id: string; name: string };
  term: { id: string; name: string; termNumber: number };
  classes: { id: string; name: string }[];
  reportCount: number;
  publishAt: string | null;
  publishedAt: string | null;
  isReviewed: boolean;
  reviewedAt: string | null;
  updatedAt: string;
};
type Workspace = { years: Year[]; templates: Template[]; sets: ReportSet[] };
type SchoolClass = { id: string; name: string; level: string; isActive: boolean };
type PreviewSubject = { subject: { id: string; name: string; code: string }; totalScore: number; percentage: number; grade: string | null; position: number | null };
type ReportPreview = {
  id: string;
  data: { student?: { class?: { name?: string; level?: string } | null }; subjects?: PreviewSubject[]; remarks?: { type: string; content: string; teacher: string }[] };
  student: { admissionNumber: string | null; profile: { firstName: string; lastName: string } };
  publishedAt: string | null;
  version?: { id: string; stage: string; version: number; teacherName: string | null;
    teacherRemark: string | null; headName: string | null; headRemark: string | null } | null;
};
type BatchAction = { kind: "create" } | { kind: "generate" | "publish"; id: string };
const statusStyles: Record<ReportSet["status"], string> = {
  DRAFT: "border-border bg-muted text-foreground/80",
  GENERATING: "border-warning/20 bg-warning/10 text-warning",
  GENERATED: "border-primary/20 bg-primary/10 text-primary",
  PUBLISHED: "border-success/20 bg-success/10 text-success",
  ARCHIVED: "border-border bg-muted text-muted-foreground",
};
const fallbackAccents = ["#4f46e5", "#1d4ed8", "#047857", "#4338ca"];
const errorMessage = (error: unknown) => error instanceof ApiError ? error.message : error instanceof Error ? error.message : "The operation failed. Please try again.";

export function ReportPublicationWorkspace({ onOpenSetup }: { onOpenSetup?: () => void }) {
  const client = useQueryClient();
  const workspace = useQuery({ queryKey: ["assessments", "report-cards", "workspace"], queryFn: () => apiFetch<Workspace>("/assessments/report-cards/workspace"), retry: false });
  const classesQuery = useQuery({ queryKey: ["academics", "classes", "report-publication"], queryFn: () => apiFetch<SchoolClass[]>("/academics/classes"), retry: false });
  const [name, setName] = useState("Terminal Report");
  const [yearId, setYearId] = useState("");
  const [termId, setTermId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [classIds, setClassIds] = useState<string[]>([]);
  const [publishAt, setPublishAt] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [expandedSetId, setExpandedSetId] = useState<string | null>(null);

  const years = workspace.data?.years ?? [];
  const templates = workspace.data?.templates ?? [];
  const activeTemplates = templates.filter((template) => template.isActive);
  const classes = (classesQuery.data ?? []).filter((schoolClass) => schoolClass.isActive);
  const chosenYear = years.find((year) => year.id === yearId) ?? years.find((year) => year.isCurrent) ?? years[0];
  const terms = chosenYear?.terms ?? [];
  const effectiveYearId = chosenYear?.id ?? "";
  const effectiveTermId = terms.find((term) => term.id === termId)?.id ?? terms.find((term) => term.isCurrent)?.id ?? terms[0]?.id ?? "";
  const selectedTemplate = activeTemplates.find((template) => template.id === templateId) ?? activeTemplates[0];
  const effectiveTemplateId = selectedTemplate?.id ?? "";
  const readyToCreate = !!effectiveYearId && !!effectiveTermId && !!effectiveTemplateId && classes.length > 0;

  const reportPreview = useQuery({
    queryKey: ["assessments", "report-cards", "review", expandedSetId],
    queryFn: () => apiFetch<ReportPreview[]>(`/assessments/report-cards/sets/${expandedSetId}/reports`),
    enabled: !!expandedSetId,
    retry: false,
  });

  const batchMutation = useMutation({
    mutationFn: async (args: BatchAction) => {
      if (args.kind === "create") {
        return apiFetch<{ id: string }>("/assessments/report-cards/sets", {
          method: "POST",
          body: JSON.stringify({ name: name.trim(), templateId: effectiveTemplateId, academicYearId: effectiveYearId, termId: effectiveTermId, classIds, publishAt: publishAt || null }),
        });
      }
      return apiFetch("/assessments/report-cards/sets/" + args.id + (args.kind === "generate" ? "/generate" : "/publish"), { method: args.kind === "generate" ? "POST" : "PATCH" });
    },
    onSuccess: async (_result, args) => {
      if (args.kind === "create") setMessage("Batch created. Generate reports when you are ready.");
      if (args.kind === "generate") {
        setMessage("Generation complete. Review the student reports before publishing.");
        setExpandedSetId(args.id);
        await client.invalidateQueries({ queryKey: ["assessments", "report-cards", "review", args.id] });
      }
      if (args.kind === "publish") setMessage("Reports published successfully to eligible student and guardian portals.");
      await client.invalidateQueries({ queryKey: ["assessments", "report-cards", "workspace"] });
    },
    onError: (error) => setMessage(errorMessage(error)),
  });

  const reviewMutation = useMutation({
    mutationFn: (setId: string) => apiFetch<{ id: string; isReviewed: boolean; reviewedAt: string }>("/assessments/report-cards/sets/" + setId + "/review", { method: "PATCH" }),
    onSuccess: async (_result, setId) => {
      setMessage("Review recorded. Publishing is now enabled for this batch.");
      await Promise.all([
        client.invalidateQueries({ queryKey: ["assessments", "report-cards", "workspace"] }),
        client.invalidateQueries({ queryKey: ["assessments", "report-cards", "review", setId] }),
      ]);
    },
    onError: (error) => setMessage(errorMessage(error)),
  });

  const templateMutation = useMutation({
    mutationFn: async (templateIdToActivate?: string) => {
      if (templateIdToActivate) return apiFetch<{ id: string; name: string; isActive: boolean }>(`/assessments/report-cards/templates/${templateIdToActivate}/activate`, { method: "PATCH" });
      return apiFetch<{ createdCount: number; activatedCount: number; message: string }>("/assessments/report-cards/templates/initialize-defaults", { method: "POST" });
    },
    onSuccess: async (result) => {
      setMessage("message" in result ? result.message : `${result.name} is now active and available for new batches.`);
      await client.invalidateQueries({ queryKey: ["assessments", "report-cards", "workspace"] });
    },
    onError: (error) => setMessage(errorMessage(error)),
  });

  const sortedSets = useMemo(() => [...(workspace.data?.sets ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [workspace.data?.sets]);
  const publishedCount = sortedSets.filter((set) => set.status === "PUBLISHED").length;
  const reportCount = sortedSets.reduce((total, set) => total + set.reportCount, 0);
  const reviewRows = reportPreview.data ?? [];

  if (workspace.isPending || classesQuery.isPending) return <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading report publication workspace…</div>;
  if (workspace.isError || classesQuery.isError) return <div role="alert" className="rounded-2xl border border-destructive/20 bg-destructive/10 p-5 text-sm text-destructive">Could not load report setup: {workspace.error?.message ?? classesQuery.error?.message ?? "Unable to load reporting data."}<button type="button" onClick={() => { void workspace.refetch(); void classesQuery.refetch(); }} className="ml-3 font-semibold underline">Try again</button></div>;

  const needsYear = !years.length || !terms.length;
  const needsTemplate = !activeTemplates.length;
  const needsClass = !classes.length;
  const setupItems = [
    { label: "Academic calendar", detail: years.length ? (terms.length ? `${years.length} academic year(s) and term(s) available` : "An academic year exists, but it has no terms") : "Create an academic year and its terms", ready: !needsYear, href: "/academic-years" },
    { label: "Report design", detail: activeTemplates.length ? `${activeTemplates.length} active template(s) available` : "Install one of the ready-made report designs", ready: !needsTemplate, href: null },
    { label: "Active classes", detail: classes.length ? `${classes.length} class(es) available` : "Create at least one class before preparing reports", ready: !needsClass, href: "/classes" },
  ];

  return <div className="space-y-7">
    <section className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.07] via-transparent to-info/[0.07]" />
      <div className="relative grid gap-6 p-5 sm:p-7 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="flex flex-col justify-center"><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-primary"><Sparkles className="size-4" />Report studio</div><h2 className="max-w-2xl text-2xl font-black tracking-tight sm:text-3xl">Beautiful reports, ready for every learner.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Prepare term reports from finalized assessment scores, review student results, then publish securely to the student and guardian portals.</p><div className="mt-5 flex flex-wrap gap-3"><a href="#prepare-report-batch" className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90">Prepare a batch <ArrowUpRight className="size-4" /></a>{onOpenSetup && <button type="button" onClick={onOpenSetup} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background/80 px-4 text-sm font-semibold hover:bg-muted">Assessment setup</button>}</div></div>
        <div className="grid grid-cols-2 gap-3 self-stretch sm:grid-cols-3 xl:grid-cols-2"><div className="rounded-2xl border border-border/80 bg-background/80 p-4"><span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Layers3 className="size-4" /></span><p className="mt-4 text-2xl font-black tabular-nums">{activeTemplates.length}</p><p className="mt-1 text-xs text-muted-foreground">Active designs</p></div><div className="rounded-2xl border border-border/80 bg-background/80 p-4"><span className="flex size-9 items-center justify-center rounded-xl bg-info/10 text-info"><FileText className="size-4" /></span><p className="mt-4 text-2xl font-black tabular-nums">{reportCount}</p><p className="mt-1 text-xs text-muted-foreground">Reports prepared</p></div><div className="col-span-2 rounded-2xl border border-border/80 bg-background/80 p-4 sm:col-span-1 xl:col-span-2"><span className="flex size-9 items-center justify-center rounded-xl bg-success/10 text-success"><CheckCircle2 className="size-4" /></span><p className="mt-4 text-2xl font-black tabular-nums">{publishedCount}</p><p className="mt-1 text-xs text-muted-foreground">Published batches</p></div></div>
      </div>
    </section>

    <section className="space-y-3"><div><h2 className="text-lg font-bold">Before you start</h2><p className="text-sm text-muted-foreground">Complete the essentials below. Each item links to its setup page or action.</p></div>
      <div className="grid gap-3 md:grid-cols-3">{setupItems.map((item, index) => <article key={item.label} className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><span className={`flex size-9 items-center justify-center rounded-xl text-sm font-bold ${item.ready ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>{item.ready ? <Check className="size-4" /> : index + 1}</span><span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${item.ready ? "border-success/20 text-success" : "border-warning/20 text-warning"}`}>{item.ready ? "Ready" : "Needs setup"}</span></div><h3 className="mt-3 font-bold">{item.label}</h3><p className="mt-1 min-h-10 text-xs leading-5 text-muted-foreground">{item.detail}</p>{!item.ready && item.href && <a href={item.href} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">Open setup <ArrowUpRight className="size-3.5" /></a>}{!item.ready && item.label === "Report design" && <button type="button" disabled={templateMutation.isPending} onClick={() => templateMutation.mutate()} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline disabled:opacity-50"><Palette className="size-3.5" />Install standard designs</button>}</article>)}</div>
    </section>

    <section className="space-y-3"><div className="flex flex-wrap items-end justify-between gap-2"><div><h2 className="text-lg font-bold">Report design library</h2><p className="text-sm text-muted-foreground">Start with SMS-inspired layouts and choose the style that suits each class.</p></div><button type="button" disabled={templateMutation.isPending} onClick={() => templateMutation.mutate()} className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-semibold hover:bg-muted disabled:opacity-50"><Palette className="size-3.5" />{templateMutation.isPending ? "Updating…" : "Install standard designs"}</button></div>
      {!templates.length ? <div className="rounded-2xl border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">No designs have been installed. Select “Install standard designs” to add four ready-to-use layouts.</div> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{templates.map((template, index) => { const accent = template.layout?.accentColor ?? fallbackAccents[index % fallbackAccents.length]; const selected = template.isActive && selectedTemplate?.id === template.id; return <article key={template.id} className={`overflow-hidden rounded-2xl border bg-card transition ${selected ? "border-primary ring-2 ring-primary/15" : "border-border"}`}><div className="h-1.5" style={{ backgroundColor: accent }} /><div className="p-4"><div className="flex items-start justify-between gap-2"><span className="flex size-9 items-center justify-center rounded-xl" style={{ color: accent, backgroundColor: `${accent}14` }}><Palette className="size-4" /></span><span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${template.isActive ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>{template.isActive ? "Active" : "Inactive"}</span></div><h3 className="mt-3 text-sm font-bold">{template.name}</h3><p className="mt-1 min-h-12 text-xs leading-5 text-muted-foreground">{template.description || "A school report card layout."}</p><div className="mt-3 flex min-h-8 items-center gap-2 text-[10px] text-muted-foreground"><span className="size-2 rounded-full" style={{ backgroundColor: accent }} />{template.layout?.type ? template.layout.type.toUpperCase() : "ACADEMIC"} layout</div>{template.isActive ? <button type="button" onClick={() => setTemplateId(template.id)} className={`mt-3 w-full rounded-xl border px-3 py-2 text-xs font-bold transition ${selected ? "border-primary/20 bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}>{selected ? "Selected for new batch" : "Use this design"}</button> : <button type="button" disabled={templateMutation.isPending} onClick={() => templateMutation.mutate(template.id)} className="mt-3 w-full rounded-xl border border-primary/30 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/5 disabled:opacity-50">Activate design</button>}</div></article>; })}</div>}
    </section>

    <section id="prepare-report-batch" className="scroll-mt-6 rounded-3xl border border-border bg-card shadow-sm"><div className="border-b border-border bg-muted/20 p-5 sm:p-6"><div className="flex items-start gap-3"><span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><CalendarClock className="size-5" /></span><div><h2 className="text-lg font-bold">Prepare a report batch</h2><p className="mt-1 text-sm text-muted-foreground">Choose the academic period, select a design, and include the classes you want to process together.</p></div></div></div>
      <div className="space-y-5 p-5 sm:p-6">
        {!readyToCreate ? <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-5"><p className="font-semibold">Finish setup to create a batch</p><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Create an academic year with at least one term, install or activate a report design, and create an active class. The checklist above tells you which item is missing.</p>{needsTemplate && <button type="button" disabled={templateMutation.isPending} onClick={() => templateMutation.mutate()} className="mt-4 inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"><Sparkles className="size-4" />{templateMutation.isPending ? "Installing designs…" : "Install standard report designs"}</button>}</div> :
        <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); setMessage(null); batchMutation.mutate({ kind: "create" }); }}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><label className="space-y-1.5 text-xs font-semibold">Batch name<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" placeholder="e.g. 2026 Term 1 Terminal Reports" /></label><label className="space-y-1.5 text-xs font-semibold">Academic year<Select value={effectiveYearId} onValueChange={(value) => { setYearId(value); setTermId(""); }} required>
              <SelectTrigger aria-label="Academic year" className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal"><SelectValue /></SelectTrigger>
              <SelectContent>{years.map((year) => <SelectItem key={year.id} value={year.id}>{year.name}{year.isCurrent ? " · Current" : ""}</SelectItem>)}</SelectContent>
            </Select></label><label className="space-y-1.5 text-xs font-semibold">Term<Select value={effectiveTermId} onValueChange={setTermId} required>
              <SelectTrigger aria-label="Term" className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal"><SelectValue /></SelectTrigger>
              <SelectContent>{terms.map((term) => <SelectItem key={term.id} value={term.id}>{term.name}{term.isCurrent ? " · Current" : ""}</SelectItem>)}</SelectContent>
            </Select></label><label className="space-y-1.5 text-xs font-semibold sm:col-span-2 xl:col-span-1">Report design<Select value={effectiveTemplateId} onValueChange={setTemplateId} required>
              <SelectTrigger aria-label="Report design" className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal"><SelectValue /></SelectTrigger>
              <SelectContent>{activeTemplates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}</SelectContent>
            </Select><span className="block text-[11px] font-normal text-muted-foreground">{selectedTemplate?.description}</span></label><label className="space-y-1.5 text-xs font-semibold sm:col-span-2">Earliest publication date/time (optional)<DateTimePicker value={publishAt} onChange={(value) => setPublishAt(value)} buttonClassName="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal outline-none focus:border-primary" /><span className="block text-[11px] font-normal text-muted-foreground">An administrator must still publish the batch manually after this time.</span></label></div>
          <fieldset className="space-y-3"><div className="flex flex-wrap items-end justify-between gap-2"><div><legend className="text-sm font-bold">Classes included</legend><p className="mt-1 text-xs font-normal text-muted-foreground">Select each class that should receive reports for this term.</p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{classIds.length} of {classes.length} selected</span></div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{classes.map((schoolClass) => <label key={schoolClass.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${classIds.includes(schoolClass.id) ? "border-primary/50 bg-primary/[0.045] ring-1 ring-primary/10" : "border-border bg-background hover:bg-muted/40"}`}><input type="checkbox" checked={classIds.includes(schoolClass.id)} onChange={(event) => setClassIds((current) => event.target.checked ? [...current, schoolClass.id] : current.filter((id) => id !== schoolClass.id))} className="size-4 accent-primary" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{schoolClass.name}</span><span className="text-xs text-muted-foreground">{schoolClass.level}</span></span>{classIds.includes(schoolClass.id) && <CheckCircle2 className="size-4 shrink-0 text-primary" />}</label>)}</div><div className="flex flex-wrap gap-3 text-xs"><button type="button" onClick={() => setClassIds(classes.map((schoolClass) => schoolClass.id))} className="font-semibold text-primary hover:underline">Select all</button><button type="button" onClick={() => setClassIds([])} className="font-semibold text-muted-foreground hover:underline">Clear selection</button></div></fieldset>
          <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-xl text-xs leading-5 text-muted-foreground">Only finalized marks are included. Students without any finalized subject scores are omitted until their marks are finalized.</p><button type="submit" disabled={batchMutation.isPending || !name.trim() || !classIds.length} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"><CalendarClock className="size-4" />{batchMutation.isPending ? "Creating batch…" : "Create report batch"}</button></div>
        </form>}
        {message && <div role="status" className="mt-4 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">{message}</div>}
      </div>
    </section>

    <section className="space-y-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-xl font-black tracking-tight">Report batches</h2><p className="mt-1 text-sm text-muted-foreground">Generate, inspect, and publish in a controlled sequence.</p></div><button type="button" onClick={() => { void workspace.refetch(); void classesQuery.refetch(); }} className="inline-flex h-9 items-center gap-2 self-start rounded-xl border border-border bg-card px-3 text-xs font-semibold hover:bg-muted"><RefreshCw className="size-3.5" />Refresh</button></div>
      {!sortedSets.length ? <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center"><span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><FileText className="size-6" /></span><p className="mt-4 font-bold">No report batches yet</p><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">Your first batch will appear here. Choose the academic period and classes above, then generate the reports for review.</p></div> :
      <div className="space-y-3">{sortedSets.map((set) => <article key={set.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"><div className="p-4 sm:p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-bold">{set.name}</h3><span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusStyles[set.status]}`}>{set.status.toLowerCase()}</span></div><p className="mt-1.5 text-sm text-muted-foreground">{set.academicYear.name} · {set.term.name} · {set.template.name}</p><div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1.5"><Users className="size-3.5" />{set.reportCount} report(s)</span><span>{set.classes.map((schoolClass) => schoolClass.name).join(", ") || "No classes"}</span>{set.publishAt && <span>Earliest publication: {new Date(set.publishAt).toLocaleString()}</span>}{set.publishedAt && <span className="font-semibold text-success">Published {new Date(set.publishedAt).toLocaleString()}</span>}</div></div><div className="flex flex-wrap gap-2">{set.status !== "PUBLISHED" && set.status !== "ARCHIVED" && <button type="button" disabled={batchMutation.isPending || set.status === "GENERATING"} onClick={() => { setMessage(null); batchMutation.mutate({ kind: "generate", id: set.id }); }} className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold hover:bg-muted disabled:opacity-50"><RefreshCw className="size-3.5" />{set.status === "GENERATED" ? "Regenerate" : "Generate reports"}</button>}{(set.status === "GENERATED" || set.status === "PUBLISHED") && <button type="button" onClick={() => { setExpandedSetId((current) => current === set.id ? null : set.id); setMessage(null); }} className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold hover:bg-muted">{expandedSetId === set.id ? <ChevronUp className="size-3.5" /> : <ClipboardCheck className="size-3.5" />}{expandedSetId === set.id ? "Close review" : "Review reports"}</button>}{set.status === "GENERATED" && <button type="button" disabled={batchMutation.isPending || !set.isReviewed} title={set.isReviewed ? "Publish reviewed reports" : "Review the report contents first"} onClick={() => { setMessage(null); batchMutation.mutate({ kind: "publish", id: set.id }); }} className="inline-flex h-9 items-center gap-2 rounded-xl bg-success px-3 text-xs font-bold text-success-foreground hover:bg-success/90 disabled:cursor-not-allowed disabled:opacity-40"><Send className="size-3.5" />Publish</button>}{set.status === "PUBLISHED" && <span className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-success/10 px-3 text-xs font-semibold text-success"><CheckCircle2 className="size-4" />Released</span>}</div></div>
        {expandedSetId === set.id && <div className="mt-5 border-t border-border pt-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-bold">Report review</h4><p className="mt-1 text-xs leading-5 text-muted-foreground">Check subject grades and remarks. Each pupil requires a class-teacher recommendation followed by independent headteacher approval before this batch can be reviewed or published.</p></div>{set.isReviewed && <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1.5 text-xs font-bold text-success"><Check className="size-3.5" />Review complete{set.reviewedAt ? ` · ${new Date(set.reviewedAt).toLocaleDateString()}` : ""}</span>}</div>
          {reportPreview.isPending ? <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading reports for review…</div> : reportPreview.isError ? <div role="alert" className="mt-3 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{reportPreview.error.message}<button type="button" onClick={() => void reportPreview.refetch()} className="ml-2 font-semibold underline">Retry</button></div> : !(reviewRows ?? []).length ? <div className="mt-3 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">No report records were generated for this batch. Check finalized scores and regenerate.</div> : <div className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-muted/40 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Student reports</p><p className="mt-1 text-xl font-black">{reviewRows.length}</p></div><div className="rounded-xl bg-muted/40 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Subject results</p><p className="mt-1 text-xl font-black">{reviewRows.reduce((sum, report) => sum + (report.data.subjects?.length ?? 0), 0)}</p></div><div className="rounded-xl bg-muted/40 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Mean percentage</p><p className="mt-1 text-xl font-black">{(() => { const marks = reviewRows.flatMap((report) => report.data.subjects ?? []); return marks.length ? `${(marks.reduce((sum, subject) => sum + subject.percentage, 0) / marks.length).toFixed(1)}%` : "—"; })()}</p></div></div>
            <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[650px] text-left text-xs"><thead className="bg-muted/50 text-muted-foreground"><tr><th className="p-3 font-semibold">Student</th><th className="p-3 font-semibold">Class</th><th className="p-3 font-semibold">Subjects / scores</th><th className="p-3 font-semibold">Grades</th><th className="p-3 font-semibold">Remarks</th></tr></thead><tbody>{reviewRows.map((report) => { const subjects = report.data.subjects ?? []; const avg = subjects.length ? subjects.reduce((sum, subject) => sum + subject.percentage, 0) / subjects.length : null; return <tr key={report.id} className="border-t border-border align-top"><td className="p-3"><p className="font-semibold">{report.student.profile.firstName} {report.student.profile.lastName}</p><p className="mt-0.5 text-muted-foreground">{report.student.admissionNumber || "No admission number"}</p></td><td className="p-3">{report.data.student?.class?.name ?? "—"}</td><td className="p-3"><p className="font-semibold">{subjects.length} subject(s){avg !== null ? ` · ${avg.toFixed(1)}%` : ""}</p><p className="mt-1 max-w-xs leading-5 text-muted-foreground">{subjects.map((subject) => subject.subject.name).join(", ") || "No finalized subject scores"}</p></td><td className="p-3"><div className="flex flex-wrap gap-1">{subjects.map((subject) => <span key={subject.subject.id} title={`${subject.subject.name}: ${subject.totalScore} (${subject.percentage.toFixed(1)}%)`} className="rounded-md border border-border bg-background px-1.5 py-1 font-semibold">{subject.subject.code}: {subject.grade ?? "—"}</span>)}</div></td><td className="max-w-[220px] p-3 text-muted-foreground">{(report.data.remarks ?? []).map((remark) => remark.content).join(" · ") || "No remarks recorded"}</td></tr>; })}</tbody></table></div>
            <HeadteacherReportApprovals setId={set.id} reports={reviewRows} />
            {set.status === "GENERATED" && <div className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/[0.035] p-4 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-2xl text-xs leading-5 text-muted-foreground">All pupils must first be individually approved by their class teacher and headteacher. This batch-level confirmation does not replace those two approvals.</p><button type="button" disabled={reviewMutation.isPending || set.isReviewed} onClick={() => reviewMutation.mutate(set.id)} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"><CheckCircle2 className="size-4" />{reviewMutation.isPending ? "Saving review…" : set.isReviewed ? "Review complete" : "Mark review complete"}</button></div>}
          </div>}
        </div>}
      </div></article>)}</div>}
    </section>

    <div className="rounded-2xl border border-border/80 bg-muted/20 p-4 text-xs leading-5 text-muted-foreground"><p className="font-semibold text-foreground">Report publishing safeguards</p><p className="mt-1">Only finalized assessment scores are included. Students without any finalized scores are omitted from generated reports. Scheduled batches cannot be released early, and published reports are available only to the authenticated student or a guardian with verified report access.</p></div>
  </div>;
}
