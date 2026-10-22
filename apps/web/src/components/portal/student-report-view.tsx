import { useQuery } from "@tanstack/react-query";
import { FileText, LoaderCircle, Printer } from "lucide-react";
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
interface PublishedReport {
  id: string;
  data: { student?: { class?: { name?: string; level?: string } | null }; subjects?: ReportSubject[]; remarks?: { type: string; content: string; teacher: string }[] };
  publishedAt: string | null;
  set: { name: string; academicYear: { name: string }; term: { name: string; termNumber: number } };
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

  if (reports.isPending) return <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading published reports…</div>;
  if (reports.isError) return <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">{reports.error.message || "Unable to load reports."}</div>;

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between print:hidden">
      <div><h2 className="text-xl font-black text-foreground">Academic reports</h2><p className="mt-1 text-sm text-muted-foreground">Official reports appear here after your school publishes them.</p></div>
      {rows.length > 0 && <div className="flex flex-wrap gap-2"><select aria-label="Select report" value={active?.id ?? ""} onChange={(event) => setSelectedId(event.target.value)} className="h-10 rounded-xl border border-input bg-background px-3 text-sm">{rows.map((report) => <option key={report.id} value={report.id}>{report.set.academicYear.name} · {report.set.term.name}</option>)}</select><button onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"><Printer className="size-4" />Print report</button></div>}
    </div>
    {!active ? <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center"><FileText className="mx-auto size-9 text-muted-foreground" /><h3 className="mt-3 font-bold">No published reports yet</h3><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Your school has not released a report for your account yet. Check again after the school announces publication.</p></div> :
    <article className="report-print-area rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-8">
      <header className="border-b border-border pb-5 text-center"><p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Student academic report</p><h1 className="mt-2 text-2xl font-black">{active.set.name}</h1><p className="mt-1 text-sm text-muted-foreground">{active.set.academicYear.name} · {active.set.term.name}</p><p className="mt-2 text-sm font-medium">{active.data.student?.class?.name ?? "Class not specified"}</p>{active.publishedAt && <p className="mt-1 text-xs text-muted-foreground">Published {new Date(active.publishedAt).toLocaleDateString()}</p>}</header>
      <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[600px] border-collapse text-left text-sm"><thead><tr className="border-b border-border bg-muted/60"><th className="p-3">Subject</th><th className="p-3 text-right">Score</th><th className="p-3 text-right">Percentage</th><th className="p-3 text-center">Grade</th><th className="p-3 text-center">Position</th></tr></thead><tbody>{(active.data.subjects ?? []).map((row) => <tr key={row.subject.id} className="border-b border-border"><td className="p-3"><span className="font-semibold">{row.subject.name}</span><span className="block text-xs text-muted-foreground">{row.subject.code}</span></td><td className="p-3 text-right">{row.totalScore}</td><td className="p-3 text-right">{row.percentage.toFixed(1)}%</td><td className="p-3 text-center font-bold">{row.grade ?? "—"}</td><td className="p-3 text-center">{row.position ?? "—"}</td></tr>)}</tbody></table></div>
      {(active.data.subjects ?? []).some((row) => row.components.length > 0) && <section className="mt-6"><h2 className="font-bold">Assessment breakdown</h2><div className="mt-2 space-y-3">{(active.data.subjects ?? []).filter((row) => row.components.length > 0).map((row) => <div key={row.subject.id} className="rounded-xl border border-border p-3"><h3 className="text-sm font-semibold">{row.subject.name}</h3><div className="mt-2 grid gap-2 sm:grid-cols-2">{row.components.map((component, index) => <div key={component.name + index} className="flex justify-between gap-3 text-xs text-muted-foreground"><span>{component.name}</span><span className="font-medium text-foreground">{component.marksObtained} / {component.maxMarks}</span></div>)}</div></div>)}</div></section>}
      {(active.data.remarks ?? []).length > 0 && <section className="mt-6"><h2 className="font-bold">Teacher remarks</h2><div className="mt-2 space-y-2">{active.data.remarks?.map((remark, index) => <div key={remark.type + index} className="rounded-xl border border-border p-3"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{remark.type.replaceAll("_", " ")}</p><p className="mt-1 text-sm">{remark.content}</p>{remark.teacher && <p className="mt-2 text-xs text-muted-foreground">{remark.teacher}</p>}</div>)}</div></section>}
      <p className="mt-8 border-t border-border pt-3 text-xs text-muted-foreground">This report is made available by the school through SchoolHub.</p>
    </article>}
    <style>{`@media print { body * { visibility: hidden; } .report-print-area, .report-print-area * { visibility: visible; } .report-print-area { position: absolute; inset: 0; width: 100%; border: 0; box-shadow: none; padding: 0; } }`}</style>
  </div>;
}
