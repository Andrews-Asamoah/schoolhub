import { useQuery } from "@tanstack/react-query";
import { Download, LoaderCircle, Printer } from "lucide-react";
import { useState } from "react";
import { PortalModal } from "@/components/portal/portal-modal";
import { ReportCardDocument, type ReportDocApproval, type ReportDocLayout, type ReportDocSubject } from "@/components/reports/report-card-document";
import { apiFetch, downloadAcademicReport } from "@/lib/api";

interface ReportVersionPreview {
  version: { id: string; version: number; stage: string; publishedAt: string | null };
  school: { name: string; code: string; logo: string | null; motto: string | null; address: string | null; phone: string | null; email: string | null; website: string | null; primaryColor: string | null } | null;
  set: { name: string; academicYear: string; term: string; template: { name: string; layout?: ReportDocLayout | null } };
  pupil: { name: string; admissionNumber: string | null; className: string | null; photo: string | null };
  report: {
    summary: { average: number | null; subjectsGraded: number; overallPosition: number | null; classSize: number } | null;
    attendance: { present: number; total: number; rate: number | null } | null;
    subjects: ReportDocSubject[];
  };
  approval: ReportDocApproval;
}

/**
 * One pupil's generated report exactly as it is printed: the school's letterhead, the pupil's
 * photo, the marks, and the class teacher's and headteacher's signatures. A signatory who has not
 * approved yet still shows their uploaded signature, marked "Awaiting approval", so management
 * and the class teacher can check and print the report before it goes out.
 */
export function ReportVersionViewer({ versionId, onClose }: { versionId: string; onClose: () => void }) {
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const query = useQuery({
    queryKey: ["assessments", "report-version-preview", versionId],
    queryFn: () => apiFetch<ReportVersionPreview>(`/assessments/report-cards/versions/${encodeURIComponent(versionId)}/preview`),
    retry: false,
  });
  const preview = query.data;
  const pending = !!preview && (!preview.approval.teacher.approved || !preview.approval.head.approved);

  async function downloadPdf() {
    setDownloadError(null);
    setDownloading(true);
    try {
      await downloadAcademicReport(`/assessments/report-cards/versions/${encodeURIComponent(versionId)}/pdf`, `academic-report-${versionId}.pdf`);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <PortalModal
      isOpen
      onClose={onClose}
      title={preview ? `Report: ${preview.pupil.name}` : "Student report"}
      description={pending ? "Not fully approved yet. Signatories who have not approved are shown as awaiting approval." : undefined}
      maxWidth="5xl"
      footer={
        <>
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-border px-4 text-xs font-semibold hover:bg-muted">Close</button>
          <button type="button" disabled={!preview || downloading} onClick={() => void downloadPdf()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-4 text-xs font-semibold hover:bg-muted disabled:opacity-50">
            {downloading ? <LoaderCircle className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} Download PDF
          </button>
          <button type="button" disabled={!preview} onClick={() => window.print()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            <Printer className="size-3.5" /> Print
          </button>
        </>
      }
    >
      {query.isPending && <p className="py-10 text-center text-xs text-muted-foreground">Loading report…</p>}
      {query.error && <p role="alert" className="py-10 text-center text-xs text-destructive">{query.error.message}</p>}
      {downloadError && <p role="alert" className="mb-3 text-xs text-destructive">{downloadError}</p>}
      {preview && (
        <div className="mx-auto max-w-[210mm]">
          <ReportCardDocument
            printClass="report-version-print-area"
            school={preview.school ?? { name: "School", code: "", logo: null, motto: null }}
            layout={preview.set.template.layout}
            pupil={preview.pupil}
            setName={preview.set.name}
            academicYear={preview.set.academicYear}
            term={preview.set.term}
            designName={preview.set.template.name}
            summary={preview.report.summary}
            attendance={preview.report.attendance}
            subjects={preview.report.subjects}
            approval={preview.approval}
            published={preview.version.publishedAt ? { publishedAt: preview.version.publishedAt } : null}
            footer={<p>{pending ? `Preview of report version ${preview.version.version}. Not yet fully approved or published.` : `Report version ${preview.version.version}.`}</p>}
          />
        </div>
      )}
      <style>{`@media print { body * { visibility: hidden; } .report-version-print-area, .report-version-print-area * { visibility: visible; } .report-version-print-area { position: absolute; inset: 0; width: 100%; max-width: none; border: 0; border-radius: 0; background: white !important; color: black !important; } .report-version-print-area section { break-inside: avoid; } @page { size: A4; margin: 12mm; } }`}</style>
    </PortalModal>
  );
}
