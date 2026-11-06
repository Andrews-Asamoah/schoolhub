import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { useMemo } from "react";
import { PortalModal } from "@/components/portal/portal-modal";
import { ReportCardDocument, type ReportDocLayout } from "@/components/reports/report-card-document";
import { apiFetch } from "@/lib/api";
import { buildSampleReport } from "@/lib/report-card-sample";

export interface PreviewTemplate {
  id: string;
  name: string;
  description?: string | null;
  layout?: ReportDocLayout | null;
}

interface SchoolBranding {
  name: string;
  code: string;
  logo: string | null;
  motto: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  primaryColor?: string | null;
}

/**
 * Shows how a report design looks, using the school's own name, logo and
 * colours and a fixed sample pupil. It renders the very same document that
 * pupils and guardians receive, so what the admin approves is what families get.
 */
export function ReportTemplatePreview({ template, onClose }: { template: PreviewTemplate; onClose: () => void }) {
  const school = useQuery({ queryKey: ["school", "current"], queryFn: () => apiFetch<SchoolBranding>("/schools/current"), staleTime: 5 * 60_000 });
  const sample = useMemo(() => buildSampleReport(template.layout?.type), [template.layout?.type]);
  return (
    <PortalModal
      isOpen
      onClose={onClose}
      title={`Preview: ${template.name}`}
      description="Sample data only. Your school's name, logo and colours are used; the pupil, marks, attendance and remarks are made up."
      maxWidth="5xl"
      footer={
        <>
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-border px-4 text-xs font-semibold hover:bg-muted">Close</button>
          <button type="button" onClick={() => window.print()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
            <Printer className="size-3.5" /> Print sample
          </button>
        </>
      }
    >
      <div className="mx-auto max-w-[210mm]">
        <ReportCardDocument
          printClass="template-preview-area"
          sample
          school={{ name: school.data?.name ?? "Your School Name", code: school.data?.code ?? "SCHOOL", logo: school.data?.logo ?? null, motto: school.data?.motto ?? null, address: school.data?.address, phone: school.data?.phone, email: school.data?.email, website: school.data?.website, primaryColor: school.data?.primaryColor }}
          layout={template.layout}
          pupil={sample.pupil}
          setName={sample.setName}
          academicYear={sample.academicYear}
          term={sample.term}
          designName={template.name}
          summary={sample.summary}
          attendance={sample.attendance}
          subjects={sample.subjects}
          approval={sample.approval}
          footer={<p>Sample report. Not a real pupil's record.</p>}
        />
      </div>
      <style>{`@media print { body * { visibility: hidden; } .template-preview-area, .template-preview-area * { visibility: visible; } .template-preview-area { position: absolute; inset: 0; width: 100%; max-width: none; border: 0; border-radius: 0; background: white !important; color: black !important; } .template-preview-area section { break-inside: avoid; } @page { size: A4; margin: 12mm; } }`}</style>
    </PortalModal>
  );
}
