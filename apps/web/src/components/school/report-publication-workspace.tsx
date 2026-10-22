import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, FileText, LoaderCircle, RefreshCw, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";

type Term = { id: string; name: string; termNumber: number; isCurrent: boolean };
type Year = { id: string; name: string; isCurrent: boolean; terms: Term[] };
type Template = { id: string; name: string; description?: string | null };
type ReportSet = {
  id: string; name: string; status: "DRAFT" | "GENERATING" | "GENERATED" | "PUBLISHED" | "ARCHIVED";
  template: { id: string; name: string }; academicYear: { id: string; name: string };
  term: { id: string; name: string; termNumber: number }; classes: { id: string; name: string }[];
  reportCount: number; publishAt: string | null; publishedAt: string | null; updatedAt: string;
};
type Workspace = { years: Year[]; templates: Template[]; sets: ReportSet[] };
type SchoolClass = { id: string; name: string; level: string };
const statusStyles: Record<ReportSet["status"], string> = {
  DRAFT: "bg-slate-100 text-slate-700", GENERATING: "bg-amber-100 text-amber-800",
  GENERATED: "bg-blue-100 text-blue-800", PUBLISHED: "bg-emerald-100 text-emerald-800",
  ARCHIVED: "bg-slate-200 text-slate-600",
};

export function ReportPublicationWorkspace() {
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
  const years = workspace.data?.years ?? [];
  const templates = workspace.data?.templates ?? [];
  const classes = classesQuery.data ?? [];
  const chosenYear = years.find((year) => year.id === yearId) ?? years.find((year) => year.isCurrent) ?? years[0];
  const terms = chosenYear?.terms ?? [];
  const effectiveYearId = yearId || chosenYear?.id || "";
  const effectiveTermId = termId || terms.find((term) => term.isCurrent)?.id || terms[0]?.id || "";
  const effectiveTemplateId = templateId || templates[0]?.id || "";

  const mutation = useMutation({
    mutationFn: async (args: { kind: "create" | "generate" | "publish"; id?: string }) => {
      if (args.kind === "create") return apiFetch<{ id: string }>("/assessments/report-cards/sets", {
        method: "POST", body: JSON.stringify({ name: name.trim(), templateId: effectiveTemplateId, academicYearId: effectiveYearId, termId: effectiveTermId, classIds, publishAt: publishAt || null }),
      });
      if (!args.id) throw new Error("Report batch ID is missing.");
      return apiFetch("/assessments/report-cards/sets/" + args.id + (args.kind === "generate" ? "/generate" : "/publish"), { method: args.kind === "generate" ? "POST" : "PATCH" });
    },
    onSuccess: async (_result, args) => {
      setMessage(args.kind === "create" ? "Report batch created. Generate it to prepare reports." : args.kind === "generate" ? "Reports generated. Review the batch before publishing." : "Reports published to eligible student and guardian portals.");
      await client.invalidateQueries({ queryKey: ["assessments", "report-cards", "workspace"] });
    },
    onError: (error) => setMessage(error instanceof ApiError ? error.message : error instanceof Error ? error.message : "The operation failed."),
  });
  const sortedSets = useMemo(() => [...(workspace.data?.sets ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [workspace.data?.sets]);

  if (workspace.isPending || classesQuery.isPending) return <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading report publication workspace…</div>;
  if (workspace.isError || classesQuery.isError) return <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">{workspace.error?.message ?? classesQuery.error?.message ?? "Unable to load reporting data."}</div>;

  return <div className="space-y-6">
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex items-start gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><FileText className="size-5" /></span><div><h2 className="text-lg font-bold">Prepare a report batch</h2><p className="mt-1 text-sm text-muted-foreground">Create terminal reports or other assessment reports for selected classes and an academic term.</p></div></div>
      {(!years.length || !templates.length || !classes.length) ? <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Before creating a batch, set up an academic year and term, an active report-card template, and at least one active class.</div> :
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); setMessage(null); mutation.mutate({ kind: "create" }); }}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1.5 text-sm font-medium">Batch name<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} className="h-10 w-full rounded-lg border border-input bg-background px-3 font-normal" placeholder="e.g. 2026 Term 1 Terminal Reports" /></label>
          <label className="space-y-1.5 text-sm font-medium">Academic year<select value={effectiveYearId} onChange={(e) => { setYearId(e.target.value); setTermId(""); }} required className="h-10 w-full rounded-lg border border-input bg-background px-3 font-normal">{years.map((year) => <option key={year.id} value={year.id}>{year.name}{year.isCurrent ? " (Current)" : ""}</option>)}</select></label>
          <label className="space-y-1.5 text-sm font-medium">Term<select value={effectiveTermId} onChange={(e) => setTermId(e.target.value)} required className="h-10 w-full rounded-lg border border-input bg-background px-3 font-normal">{terms.map((term) => <option key={term.id} value={term.id}>{term.name}{term.isCurrent ? " (Current)" : ""}</option>)}</select></label>
          <label className="space-y-1.5 text-sm font-medium sm:col-span-2 lg:col-span-1">Report template<select value={effectiveTemplateId} onChange={(e) => setTemplateId(e.target.value)} required className="h-10 w-full rounded-lg border border-input bg-background px-3 font-normal">{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
          <label className="space-y-1.5 text-sm font-medium sm:col-span-2">Schedule publication (optional)<input type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3 font-normal" /><span className="block text-xs font-normal text-muted-foreground">Scheduled batches are not released before the selected date and time.</span></label>
        </div>
        <fieldset className="space-y-2"><legend className="text-sm font-semibold">Classes included</legend><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{classes.map((schoolClass) => <label key={schoolClass.id} className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm"><input type="checkbox" checked={classIds.includes(schoolClass.id)} onChange={(e) => setClassIds((current) => e.target.checked ? [...current, schoolClass.id] : current.filter((id) => id !== schoolClass.id))} className="size-4 accent-blue-600" /><span>{schoolClass.name}</span><span className="ml-auto text-xs text-muted-foreground">{schoolClass.level}</span></label>)}</div><div className="flex flex-wrap gap-3 pt-1"><button type="button" className="text-xs font-semibold text-blue-700 hover:underline" onClick={() => setClassIds(classes.map((c) => c.id))}>Select all</button><button type="button" className="text-xs font-semibold text-muted-foreground hover:underline" onClick={() => setClassIds([])}>Clear selection</button><span className="text-xs text-muted-foreground">{classIds.length} class(es) selected</span></div></fieldset>
        <button disabled={mutation.isPending || !name.trim() || !effectiveYearId || !effectiveTermId || !effectiveTemplateId || !classIds.length} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"><CalendarClock className="size-4" />Create report batch</button>
      </form>}
      {message && <p role="status" className="mt-4 rounded-xl border border-border bg-muted/50 p-3 text-sm">{message}</p>}
    </section>
    <section className="space-y-3"><div className="flex items-end justify-between gap-3"><div><h2 className="text-lg font-bold">Report batches</h2><p className="text-sm text-muted-foreground">Generate, verify, then release reports to the appropriate portals.</p></div><button onClick={() => void workspace.refetch()} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"><RefreshCw className="size-4" />Refresh</button></div>
      {!sortedSets.length ? <div className="rounded-2xl border border-dashed border-border p-8 text-center"><FileText className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 font-semibold">No report batches yet</p><p className="mt-1 text-sm text-muted-foreground">Create a batch above to prepare your first set of terminal reports.</p></div> :
      <div className="space-y-3">{sortedSets.map((set) => <article key={set.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{set.name}</h3><span className={"rounded-full px-2.5 py-1 text-[11px] font-bold " + statusStyles[set.status]}>{set.status.toLowerCase()}</span></div><p className="mt-1 text-sm text-muted-foreground">{set.academicYear.name} · {set.term.name} · {set.template.name}</p><p className="mt-1 text-xs text-muted-foreground">{set.classes.map((c) => c.name).join(", ")} · {set.reportCount} report(s)</p>{set.publishAt && <p className="mt-2 text-xs text-muted-foreground">Scheduled: {new Date(set.publishAt).toLocaleString()}</p>}{set.publishedAt && <p className="mt-1 text-xs text-emerald-700">Published {new Date(set.publishedAt).toLocaleString()}</p>}</div><div className="flex shrink-0 flex-wrap gap-2">{set.status !== "PUBLISHED" && set.status !== "ARCHIVED" && <button disabled={mutation.isPending || set.status === "GENERATING"} onClick={() => { setMessage(null); mutation.mutate({ kind: "generate", id: set.id }); }} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted disabled:opacity-50"><RefreshCw className="size-3.5" />Generate / refresh</button>}{set.status === "GENERATED" && <button disabled={mutation.isPending} onClick={() => { setMessage(null); mutation.mutate({ kind: "publish", id: set.id }); }} className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"><Send className="size-3.5" />Publish</button>}{set.status === "PUBLISHED" && <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><CheckCircle2 className="size-4" />Released to portals</span>}</div></div></article>)}</div>}
    </section>
    <p className="text-xs leading-relaxed text-muted-foreground">Only finalized assessment scores are included in generated reports. Review results and remarks before publishing. Portal access must remain tied to the authenticated student or the guardian’s verified student relationship.</p>
  </div>;
}
