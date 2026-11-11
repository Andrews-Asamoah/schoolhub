import { useQuery } from "@tanstack/react-query";
import { FileText, LoaderCircle, Printer, Sparkles } from "lucide-react";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch, downloadAcademicReport } from "@/lib/api";
import { ReportCardDocument, type ReportDocApproval, type ReportDocLayout, type ReportDocSubject, type ReportDocumentProps } from "@/components/reports/report-card-document";
import { accessibleAccentForeground } from "@/lib/accent-foreground";

interface PublishedReport {
  id: string;
  pdfAvailable?: boolean;
  data: { student?: { class?: { name?: string; level?: string } | null }; subjects?: ReportDocSubject[]; remarks?: { type: string; content: string; teacher: string }[]; summary?: ReportDocumentProps["summary"]; attendance?: ReportDocumentProps["attendance"] };
  approval?: ReportDocApproval | null;
  student: { admissionNumber: string | null; profile: { firstName: string; lastName: string; user?: { image: string | null } | null } };
  publishedAt: string | null;
  set: { name: string; academicYear: { name: string }; term: { name: string; termNumber: number }; template: { name: string; layout: ReportDocLayout | null }; school: { name: string; code: string; email: string | null; phone: string | null; address: string | null; logo: string | null; motto: string | null; website: string | null; primaryColor: string; secondaryColor: string } };
}


export function StudentReportView() {
  const [selectedId, setSelectedId] = useState("");
  const [downloadError,setDownloadError]=useState<string | null>(null);
  const reports = useQuery({
    queryKey: ["assessments", "report-cards", "me"],
    queryFn: () => apiFetch<PublishedReport[]>("/assessments/report-cards/me"),
    retry: false,
  });
  const rows = reports.data ?? [];
  const active = rows.find((report) => report.id === selectedId) ?? rows[0];
  const subjects = active?.data.subjects ?? [];
  const layout = active?.set.template.layout;
  const accent = layout?.accentColor ?? active?.set.school.primaryColor ?? "#4f46e5";
  const accentForeground = accessibleAccentForeground(accent);

  if (reports.isPending) return <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading published reports…</div>;
  if (reports.isError) return <div role="alert" className="rounded-2xl border border-destructive/20 bg-destructive/10 p-5 text-sm text-destructive">Unable to load published reports: {reports.error.message}</div>;

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between print:hidden">
      <div><div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary"><Sparkles className="size-4" />Academic records</div><h2 className="text-2xl font-black tracking-tight text-foreground">Your reports</h2><p className="mt-1 text-sm text-muted-foreground">Official reports released by your school appear here.</p></div>
      {rows.length > 0 && <div className="flex flex-col gap-2 sm:flex-row"><Select value={active?.id ?? rows[0]?.id ?? "__none__"} onValueChange={setSelectedId}><SelectTrigger aria-label="Select report" className="h-10 min-w-0 sm:max-w-72"><SelectValue placeholder="Choose a report" /></SelectTrigger><SelectContent>{rows.map((report) => <SelectItem key={report.id} value={report.id}>{report.set.academicYear.name} · {report.set.term.name}</SelectItem>)}</SelectContent></Select><button type="button" onClick={() => {
        if (!active) return;
        if (active.pdfAvailable) void downloadAcademicReport(
          `/assessments/report-cards/me/${encodeURIComponent(active.id)}/pdf`,
          `academic-report-${active.id}.pdf`).catch(e=>setDownloadError(e instanceof Error?e.message:"Download failed"));
        else window.print();
      }} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold shadow-sm transition hover:opacity-90" style={{ backgroundColor: accent, color: accentForeground }}><Printer className="size-4" />{active?.pdfAvailable ? "Download signed PDF" : "Print legacy report"}</button></div>}
    </div>
    {downloadError && <p role="alert" className="text-xs text-destructive">{downloadError}</p>}
    {!active ? <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center"><span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><FileText className="size-7" /></span><h3 className="mt-4 font-bold">No published reports yet</h3><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">Your school has not released a report for your account yet. Check again after the school announces publication.</p></div> :
    <ReportCardDocument
      printClass="report-print-area"
      school={active.set.school}
      layout={layout}
      pupil={{ name: `${active.student.profile.firstName} ${active.student.profile.lastName}`, admissionNumber: active.student.admissionNumber, className: active.data.student?.class?.name ?? null, photo: active.student.profile.user?.image ?? null }}
      setName={active.set.name}
      academicYear={active.set.academicYear.name}
      term={active.set.term.name}
      designName={active.set.template.name}
      summary={active.data.summary}
      attendance={active.data.attendance}
      subjects={subjects}
      legacyRemarks={active.data.remarks}
      approval={active.approval}
      published={{ publishedAt: active.publishedAt }}
    />}
    <style>{`@media print { body * { visibility: hidden; } .report-print-area, .report-print-area * { visibility: visible; } .report-print-area { position: absolute; inset: 0; width: 100%; border: 0; box-shadow: none; padding: 0; background: white !important; color: black !important; } .report-print-area section { break-inside: avoid; } @page { size: A4; margin: 12mm; } }`}</style>
  </div>;
}
