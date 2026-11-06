import {useGuardianWard} from "@/hooks/use-guardian-ward";
import { useQuery } from "@tanstack/react-query";
import { FileText, LoaderCircle, Printer } from "lucide-react";
import { useState } from "react";
import { apiFetch, downloadAcademicReport } from "@/lib/api";
import { MockPublishedReportCards } from "@/components/portal/mock-published-report-cards";
import { ReportCardDocument, type ReportDocApproval, type ReportDocLayout, type ReportDocSubject, type ReportDocumentProps } from "@/components/reports/report-card-document";
import { accessibleAccentForeground } from "@/lib/accent-foreground";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Report = {
  id: string;
  pdfAvailable?: boolean;
  studentId: string;
  data: { student?: { class?: { name?: string } | null }; subjects?: ReportDocSubject[]; remarks?: { type: string; content: string; teacher: string }[]; summary?: ReportDocumentProps["summary"]; attendance?: ReportDocumentProps["attendance"] };
  approval?: ReportDocApproval | null;
  publishedAt: string | null;
  student: { admissionNumber: string | null; profile: { firstName: string; lastName: string } };
  set: { name: string; academicYear: { name: string }; term: { name: string }; template: { name: string; layout: ReportDocLayout | null }; school: { name: string; code: string; email: string | null; phone: string | null; address: string | null; logo: string | null; motto: string | null; website: string | null; primaryColor: string; secondaryColor: string } };
};

export function GuardianPublishedReports({wards=[]}:{wards?:{id:string;profile:{firstName:string;lastName:string}}[]}) {
  const [selectedId, setSelectedId] = useState("");
  const [downloadError,setDownloadError]=useState<string | null>(null);
  const reports = useQuery({ queryKey: ["assessments", "report-cards", "guardian"], queryFn: () => apiFetch<Report[]>("/assessments/report-cards/guardian"), retry: false });
  const allRows = reports.data ?? [];
  const [wardId,selectWard]=useGuardianWard(wards.length?wards:allRows.map(row=>({id:row.studentId})));
  const [year,setYear]=useState("");
  const [term,setTerm]=useState("");
  const wardRows=allRows.filter(row=>!wardId||row.studentId===wardId);
  const years=[...new Set(wardRows.map(row=>row.set.academicYear.name))].sort().reverse();
  const terms=[...new Set(wardRows.filter(row=>!year||row.set.academicYear.name===year).map(row=>row.set.term.name))];
  const rows=wardRows.filter(row=>(!year||row.set.academicYear.name===year)&&(!term||row.set.term.name===term));
  const selected = rows.find((r) => r.id === selectedId) ?? rows[0];
  const subjects = selected?.data.subjects ?? [];
  const layout = selected?.set.template.layout;
  const accent = layout?.accentColor ?? selected?.set.school.primaryColor ?? "#4f46e5";
  const accentForeground = accessibleAccentForeground(accent);
  if (reports.isPending) return <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading published ward reports…</div>;
  if (reports.isError) return <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">Unable to load published reports: {reports.error.message}</div>;
  return <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
    <div className="grid gap-3 sm:grid-cols-3 print:hidden">
      {wards.length>0&&<label className="text-xs font-semibold">Child<select aria-label="Report child" value={wardId} onChange={event=>{selectWard(event.target.value);setSelectedId("");}} className="mt-1 block w-full rounded-lg border border-input bg-background p-2">{wards.map(ward=><option key={ward.id} value={ward.id}>{ward.profile.firstName} {ward.profile.lastName}</option>)}</select></label>}
      <label className="text-xs font-semibold">Academic year<select aria-label="Report academic year" value={year} onChange={event=>{setYear(event.target.value);setTerm("");setSelectedId("");}} className="mt-1 block w-full rounded-lg border border-input bg-background p-2"><option value="">All published years</option>{years.map(name=><option key={name}>{name}</option>)}</select></label>
      <label className="text-xs font-semibold">Term<select aria-label="Report term" value={term} onChange={event=>{setTerm(event.target.value);setSelectedId("");}} className="mt-1 block w-full rounded-lg border border-input bg-background p-2"><option value="">All published terms</option>{terms.map(name=><option key={name}>{name}</option>)}</select></label>
    </div>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between print:hidden"><div><div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary"><FileText className="size-4" />Family portal</div><h2 className="flex items-center gap-2 text-xl font-black tracking-tight">Published report cards</h2><p className="mt-1 text-sm text-muted-foreground">Reports released by your school for linked wards.</p></div>{rows.length > 0 && <div className="flex flex-col gap-2 sm:flex-row"><Select value={selected?.id ?? rows[0]?.id ?? "__none__"} onValueChange={setSelectedId}><SelectTrigger aria-label="Select ward report" className="h-10 min-w-0 sm:max-w-72"><SelectValue placeholder="Choose a report" /></SelectTrigger><SelectContent>{rows.map((row) => <SelectItem key={row.id} value={row.id}>{row.student.profile.firstName} {row.student.profile.lastName} · {row.set.term.name}</SelectItem>)}</SelectContent></Select><button type="button" onClick={() => {
  if (!selected) return;
  if (selected.pdfAvailable) void downloadAcademicReport(
    `/assessments/report-cards/guardian/${encodeURIComponent(selected.id)}/pdf`,
    `ward-academic-report-${selected.id}.pdf`).catch(e=>setDownloadError(e instanceof Error?e.message:"Download failed"));
  else window.print();
}} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold" style={{ backgroundColor: accent, color: accentForeground }}><Printer className="size-4" />{selected?.pdfAvailable ? "Download signed PDF" : "Print legacy report"}</button></div>}</div>
    {downloadError && <p role="alert" className="text-xs text-destructive">{downloadError}</p>}
    {!selected ? <div className="rounded-xl border border-dashed border-border p-6 text-center"><p className="font-semibold">No published reports</p><p className="mt-1 text-sm text-muted-foreground">Reports will appear after the school publishes them and the ward is linked to your account.</p></div> :
      <ReportCardDocument
        printClass="guardian-report-print-area"
        school={selected.set.school}
        layout={layout}
        pupil={{ name: `${selected.student.profile.firstName} ${selected.student.profile.lastName}`, admissionNumber: selected.student.admissionNumber, className: selected.data.student?.class?.name ?? null }}
        setName={selected.set.name}
        academicYear={selected.set.academicYear.name}
        term={selected.set.term.name}
        designName={selected.set.template.name}
        summary={selected.data.summary}
        attendance={selected.data.attendance}
        subjects={subjects}
        legacyRemarks={selected.data.remarks}
        approval={selected.approval}
        published={{ publishedAt: selected.publishedAt }}
      />}
    <MockPublishedReportCards studentId={wardId} year={year} term={term} audience="guardian" />
    <style>{`@media print { body * { visibility: hidden; } .guardian-report-print-area, .guardian-report-print-area * { visibility: visible; } .guardian-report-print-area { position: absolute; inset: 0; width: 100%; border: 0; box-shadow: none; padding: 0; background: white !important; color: black !important; } .guardian-report-print-area section { break-inside: avoid; } @page { size: A4; margin: 12mm; } }`}</style>
  </section>;
}
