import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, FileText, LoaderCircle, Printer, Sparkles } from "lucide-react";
import { useState } from "react";
import { apiFetch } from "@/lib/api";

interface ReportSubject {
  subject: { id: string; name: string; code: string };
  totalScore: number;
  percentage: number;
  grade: string | null;
  position: number | null;
  remarks: string | null;
  components: { name: string; marksObtained: number; maxMarks: number; percentage: number; weight: number }[];
}
interface TemplateLayout {
  type?: string;
  accentColor?: string;
  showPosition?: boolean;
  showAssessmentBreakdown?: boolean;
}
interface PublishedReport {
  id: string;
  data: { student?: { class?: { name?: string; level?: string } | null }; subjects?: ReportSubject[]; remarks?: { type: string; content: string; teacher: string }[] };
  student: { admissionNumber: string | null; profile: { firstName: string; lastName: string } };
  publishedAt: string | null;
  set: { name: string; academicYear: { name: string }; term: { name: string; termNumber: number }; template: { name: string; layout: TemplateLayout | null } };
}

export function StudentReportView() {
  const [selectedId, setSelectedId] = useState("");
  const reports = useQuery({
    queryKey: ["assessments", "report-cards", "me"],
    queryFn: () => apiFetch<PublishedReport[]>("/assessments/report-cards/me"),
    retry: false,
  });
  const rows = reports.data ?? [];
  const active = rows.find((report) => report.id === selectedId) ?? rows[0];
  const subjects = active?.data.subjects ?? [];
  const layout = active?.set.template.layout;
  const accent = layout?.accentColor ?? "#4f46e5";
  const templateType = layout?.type ?? "modern";
  const reportLabel = templateType === "primary" ? "Primary terminal report" : templateType === "jhs" ? "JHS performance report" : templateType === "classic" ? "Classic academic report" : "Student academic report";
  const showPosition = layout?.showPosition !== false;
  const showBreakdown = layout?.showAssessmentBreakdown !== false;
  const average = subjects.length ? subjects.reduce((sum, row) => sum + row.percentage, 0) / subjects.length : null;
  const rankedSubjects = subjects.filter((row) => row.position !== null);
  const averagePosition = rankedSubjects.length ? rankedSubjects.reduce((sum, row) => sum + (row.position ?? 0), 0) / rankedSubjects.length : null;
  const gradedCount = subjects.filter((row) => !!row.grade).length;

  if (reports.isPending) return <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading published reports…</div>;
  if (reports.isError) return <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800 dark:border-rose-400/20 dark:bg-rose-950/30 dark:text-rose-200">Unable to load published reports: {reports.error.message}</div>;

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between print:hidden">
      <div><div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary"><Sparkles className="size-4" />Academic records</div><h2 className="text-2xl font-black tracking-tight text-foreground">Your reports</h2><p className="mt-1 text-sm text-muted-foreground">Official reports released by your school appear here.</p></div>
      {rows.length > 0 && <div className="flex flex-wrap gap-2"><select aria-label="Select report" value={active?.id ?? ""} onChange={(event) => setSelectedId(event.target.value)} className="h-10 rounded-xl border border-input bg-background px-3 text-sm">{rows.map((report) => <option key={report.id} value={report.id}>{report.set.academicYear.name} · {report.set.term.name}</option>)}</select><button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold text-white shadow-sm transition hover:opacity-90" style={{ backgroundColor: accent }}><Printer className="size-4" />Print report</button></div>}
    </div>
    {!active ? <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center"><span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><FileText className="size-7" /></span><h3 className="mt-4 font-bold">No published reports yet</h3><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">Your school has not released a report for your account yet. Check again after the school announces publication.</p></div> :
    <article className="report-print-area overflow-hidden rounded-3xl border border-border bg-card shadow-sm print:rounded-none print:border-0 print:shadow-none" style={{ fontFamily: templateType === "classic" ? "Georgia, Times New Roman, serif" : undefined }}>
      <div className="h-2 w-full" style={{ backgroundColor: accent }} />
      <header className="relative overflow-hidden border-b border-border p-5 sm:p-8" style={{ backgroundColor: `${accent}0D` }}>
        <div className="absolute -right-8 -top-14 size-48 rounded-full opacity-[0.07]" style={{ backgroundColor: accent }} />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0"><p className="text-[10px] font-extrabold uppercase tracking-[0.2em]" style={{ color: accent }}>{reportLabel}</p><h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">{active.set.name}</h1><p className="mt-2 text-sm text-muted-foreground">{active.set.academicYear.name} <span className="px-1">·</span> {active.set.term.name}</p><div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full border border-border bg-background/80 px-3 py-1.5 text-xs font-semibold">{active.data.student?.class?.name ?? "Class not specified"}</span>{active.student.admissionNumber && <span className="rounded-full border border-border bg-background/80 px-3 py-1.5 text-xs text-muted-foreground">Admission no. {active.student.admissionNumber}</span>}</div></div>
          <div className="rounded-2xl border border-border/70 bg-background/80 p-4 sm:min-w-48"><p className="text-xs font-semibold text-muted-foreground">Prepared for</p><p className="mt-1 font-bold">{active.student.profile.firstName} {active.student.profile.lastName}</p><div className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: accent }}><CheckCircle2 className="size-3.5" />Official published copy</div><p className="mt-2 text-[11px] text-muted-foreground">Design: {active.set.template.name}</p>{active.publishedAt && <p className="mt-1 text-[11px] text-muted-foreground">Published {new Date(active.publishedAt).toLocaleDateString()}</p>}</div>
        </div>
      </header>

      <div className="space-y-6 p-5 sm:p-8">
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Subjects graded</p><p className="mt-2 text-2xl font-black tabular-nums">{subjects.length}</p></div>
          <div className="rounded-2xl border border-border p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Average score</p><p className="mt-2 text-2xl font-black tabular-nums">{average === null ? "—" : `${average.toFixed(1)}%`}</p></div>
          <div className="col-span-2 rounded-2xl border border-border p-4 sm:col-span-1"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Average position</p><p className="mt-2 text-2xl font-black tabular-nums">{showPosition && averagePosition !== null ? averagePosition.toFixed(1) : "—"}</p><p className="mt-1 text-[11px] text-muted-foreground">{showPosition && averagePosition !== null ? "Across ranked subjects" : "Not provided in this design"}</p></div>
        </section>

        <section>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: accent }}>01 · Academic results</p><h2 className="mt-1 text-lg font-black">Subject performance</h2></div><p className="text-xs text-muted-foreground">{gradedCount} of {subjects.length} subject(s) have a recorded grade</p></div>
          {subjects.length ? <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[620px] border-collapse text-left text-sm"><thead><tr style={{ backgroundColor: accent }} className="text-white"><th className="p-3 font-semibold">Subject</th><th className="p-3 text-right font-semibold">Score</th><th className="p-3 text-right font-semibold">Percentage</th><th className="p-3 text-center font-semibold">Grade</th>{showPosition && <th className="p-3 text-center font-semibold">Position</th>}</tr></thead><tbody>{subjects.map((row, index) => <tr key={row.subject.id} className={index % 2 ? "border-t border-border bg-muted/20" : "border-t border-border"}><td className="p-3"><span className="font-semibold">{row.subject.name}</span><span className="mt-0.5 block text-[11px] text-muted-foreground">{row.subject.code}</span></td><td className="p-3 text-right font-medium tabular-nums">{row.totalScore.toFixed(1)}</td><td className="p-3 text-right tabular-nums">{row.percentage.toFixed(1)}%</td><td className="p-3 text-center"><span className="inline-flex min-w-9 justify-center rounded-lg px-2 py-1 text-xs font-black" style={{ color: accent, backgroundColor: `${accent}14` }}>{row.grade ?? "—"}</span></td>{showPosition && <td className="p-3 text-center tabular-nums">{row.position ?? "—"}</td>}</tr>)}</tbody></table></div> : <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No finalized subject results were included in this report.</div>}
        </section>

        {showBreakdown && subjects.some((row) => row.components.length > 0) && <section><p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: accent }}>02 · How the marks add up</p><h2 className="mt-1 text-lg font-black">Assessment breakdown</h2><div className="mt-3 grid gap-3 sm:grid-cols-2">{subjects.filter((row) => row.components.length > 0).map((row) => <div key={row.subject.id} className="rounded-2xl border border-border p-4"><h3 className="text-sm font-bold">{row.subject.name}</h3><div className="mt-3 space-y-2">{row.components.map((component, index) => <div key={component.name + index}><div className="flex items-center justify-between gap-3 text-xs"><span className="text-muted-foreground">{component.name}</span><span className="font-semibold tabular-nums">{component.marksObtained} / {component.maxMarks}</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, component.percentage))}%`, backgroundColor: accent }} /></div></div>)}</div></div>)}</div></section>}

        {(active.data.remarks ?? []).length > 0 && <section><p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: accent }}>03 · Teacher feedback</p><h2 className="mt-1 text-lg font-black">Remarks</h2><div className="mt-3 grid gap-3 sm:grid-cols-2">{active.data.remarks?.map((remark, index) => <div key={remark.type + index} className="rounded-2xl border border-border p-4" style={{ borderLeftWidth: 3, borderLeftColor: accent }}><p className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{remark.type.replaceAll("_", " ")}</p><p className="mt-2 text-sm leading-6">{remark.content}</p>{remark.teacher && <p className="mt-3 text-xs font-semibold text-muted-foreground">{remark.teacher}</p>}</div>)}</div></section>}

        <footer className="flex flex-col gap-2 border-t border-border pt-4 text-[11px] leading-5 text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><p>This report was made available securely through SchoolHub.</p><p>{active.set.template.name} · {active.set.term.name}</p></footer>
      </div>
    </article>}
    <style>{`@media print { body * { visibility: hidden; } .report-print-area, .report-print-area * { visibility: visible; } .report-print-area { position: absolute; inset: 0; width: 100%; border: 0; box-shadow: none; padding: 0; background: white !important; color: black !important; } .report-print-area section { break-inside: avoid; } @page { size: A4; margin: 12mm; } }`}</style>
  </div>;
}
