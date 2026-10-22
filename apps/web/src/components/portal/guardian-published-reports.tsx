import { useQuery } from "@tanstack/react-query";
import { FileText, LoaderCircle, Printer } from "lucide-react";
import { useState } from "react";
import { apiFetch } from "@/lib/api";

type TemplateLayout = { type?: string; accentColor?: string; showPosition?: boolean; showAssessmentBreakdown?: boolean };
type Report = {
  id: string;
  studentId: string;
  data: { student?: { class?: { name?: string } | null }; subjects?: { subject: { id: string; name: string; code: string }; totalScore: number; percentage: number; grade: string | null; position: number | null; components?: { name: string; marksObtained: number; maxMarks: number; percentage: number }[] }[]; remarks?: { type: string; content: string; teacher: string }[] };
  publishedAt: string | null;
  student: { admissionNumber: string | null; profile: { firstName: string; lastName: string } };
  set: { name: string; academicYear: { name: string }; term: { name: string }; template: { name: string; layout: TemplateLayout | null } };
};

export function GuardianPublishedReports() {
  const [selectedId, setSelectedId] = useState("");
  const reports = useQuery({ queryKey: ["assessments", "report-cards", "guardian"], queryFn: () => apiFetch<Report[]>("/assessments/report-cards/guardian"), retry: false });
  const rows = reports.data ?? [];
  const selected = rows.find((r) => r.id === selectedId) ?? rows[0];
  const subjects = selected?.data.subjects ?? [];
  const layout = selected?.set.template.layout;
  const accent = layout?.accentColor ?? "#4f46e5";
  const showPosition = layout?.showPosition !== false;
  const showBreakdown = layout?.showAssessmentBreakdown !== false;
  const average = subjects.length ? subjects.reduce((sum, subject) => sum + subject.percentage, 0) / subjects.length : null;
  if (reports.isPending) return <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading published ward reports…</div>;
  if (reports.isError) return <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Unable to load published reports: {reports.error.message}</div>;
  return <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between print:hidden"><div><h2 className="flex items-center gap-2 text-lg font-bold"><FileText className="size-5 text-blue-600" />Published report cards</h2><p className="mt-1 text-sm text-muted-foreground">Reports released by your school for linked wards.</p></div>{rows.length > 0 && <div className="flex gap-2"><select aria-label="Select ward report" value={selected?.id ?? ""} onChange={(e) => setSelectedId(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">{rows.map((r) => <option key={r.id} value={r.id}>{r.student.profile.firstName} {r.student.profile.lastName} · {r.set.term.name}</option>)}</select><button onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white"><Printer className="size-4" />Print</button></div>}</div>
    {!selected ? <div className="rounded-xl border border-dashed border-border p-6 text-center"><p className="font-semibold">No published reports</p><p className="mt-1 text-sm text-muted-foreground">Reports will appear after the school publishes them and the ward is linked to your account.</p></div> :
      <article className="guardian-report-print-area"><header className="border-b border-border pb-4 text-center"><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Student report</p><h3 className="mt-2 text-xl font-black">{selected.student.profile.firstName} {selected.student.profile.lastName}</h3><p className="mt-1 text-sm">{selected.set.name}</p><p className="text-sm text-muted-foreground">{selected.set.academicYear.name} · {selected.set.term.name} · {selected.data.student?.class?.name ?? ""}</p><p className="mt-1 text-xs text-muted-foreground">Admission no. {selected.student.admissionNumber}</p></header>
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm"><thead><tr className="border-b border-border bg-muted/60"><th className="p-2.5">Subject</th><th className="p-2.5 text-right">Score</th><th className="p-2.5 text-right">%</th><th className="p-2.5 text-center">Grade</th></tr></thead><tbody>{(selected.data.subjects ?? []).map((s) => <tr key={s.subject.id} className="border-b border-border"><td className="p-2.5">{s.subject.name}</td><td className="p-2.5 text-right">{s.totalScore}</td><td className="p-2.5 text-right">{s.percentage.toFixed(1)}%</td><td className="p-2.5 text-center font-bold">{s.grade ?? "—"}</td></tr>)}</tbody></table></div>
        {(selected.data.remarks ?? []).length > 0 && <div className="mt-4 space-y-2">{selected.data.remarks?.map((r, i) => <div key={r.type + i} className="rounded-lg border border-border p-3"><p className="text-xs font-bold uppercase text-muted-foreground">{r.type.replaceAll("_", " ")}</p><p className="mt-1 text-sm">{r.content}</p></div>)}</div>}
      </article>}
    <style>{`@media print { body * { visibility: hidden; } .guardian-report-print-area, .guardian-report-print-area * { visibility: visible; } .guardian-report-print-area { position: absolute; inset: 0; width: 100%; border: 0; box-shadow: none; padding: 0; } }`}</style>
  </section>;
}
