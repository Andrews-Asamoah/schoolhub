import { useQuery } from "@tanstack/react-query";
import { GraduationCap, Printer } from "lucide-react";
import { useMemo } from "react";
import { PortalModal } from "@/components/portal/portal-modal";
import { apiFetch } from "@/lib/api";
import { accessibleAccentForeground } from "@/lib/accent-foreground";
import { buildSampleReport } from "@/lib/report-card-sample";

export interface PreviewTemplate {
  id: string;
  name: string;
  description?: string | null;
  layout?: { type?: string; accentColor?: string; showPosition?: boolean; showAssessmentBreakdown?: boolean; sections?: string[] } | null;
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

const REPORT_LABEL: Record<string, string> = {
  primary: "Primary terminal report",
  jhs: "JHS performance report",
  classic: "Classic academic report",
};

/**
 * Shows how a report design looks, using the school's own name, logo and
 * colours and a fixed sample pupil. It follows the same layout rules as the
 * published report a pupil or guardian sees (type, accent colour, position
 * column, assessment breakdown), so what the admin approves is what families get.
 */
export function ReportTemplatePreview({ template, onClose }: { template: PreviewTemplate; onClose: () => void }) {
  const school = useQuery({ queryKey: ["school", "current"], queryFn: () => apiFetch<SchoolBranding>("/schools/current"), staleTime: 5 * 60_000 });
  const layout = template.layout ?? {};
  const type = layout.type ?? "modern";
  const accent = layout.accentColor ?? school.data?.primaryColor ?? "#4f46e5";
  const onAccent = accessibleAccentForeground(accent);
  const showPosition = layout.showPosition !== false;
  const showBreakdown = layout.showAssessmentBreakdown !== false;
  const sample = useMemo(() => buildSampleReport(type), [type]);
  const subjects = sample.subjects;
  const average = subjects.reduce((sum, row) => sum + row.percentage, 0) / subjects.length;
  const positions = subjects.filter((row) => row.position !== null);
  const averagePosition = positions.reduce((sum, row) => sum + (row.position ?? 0), 0) / (positions.length || 1);
  const name = school.data?.name ?? "Your School Name";
  const contact = [school.data?.phone, school.data?.email, school.data?.website].filter(Boolean).join(" · ");

  return (
    <PortalModal
      isOpen
      onClose={onClose}
      title={`Preview: ${template.name}`}
      description="Sample data only. Your school's name, logo and colours are used; the pupil, marks and remarks are made up."
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
      <article className="template-preview-area relative mx-auto max-w-[210mm] overflow-hidden rounded-2xl border border-border bg-card" style={{ fontFamily: type === "classic" ? "Georgia, Times New Roman, serif" : undefined }}>
        <div aria-hidden className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden">
          <span className="-rotate-24 select-none text-7xl font-black uppercase tracking-widest text-foreground/[0.06]">Sample</span>
        </div>
        <div className="h-2 w-full" style={{ backgroundColor: accent }} />
        <header className="border-b border-border p-5 sm:p-7" style={{ backgroundColor: `${accent}0D` }}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              {school.data?.logo
                ? <img src={school.data.logo} alt={`${name} logo`} className="size-14 shrink-0 rounded-xl border border-border bg-card object-contain p-1" />
                : <span className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-border bg-background" style={{ color: accent }}><GraduationCap className="size-7" /></span>}
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.2em]" style={{ color: accent }}>{school.data?.code ?? "SCHOOL"}</p>
                <h1 className="mt-1 text-xl font-black tracking-tight">{name}</h1>
                {school.data?.motto && <p className="mt-1 text-xs italic text-muted-foreground">{school.data.motto}</p>}
                {school.data?.address && <p className="mt-2 text-xs text-muted-foreground">{school.data.address}</p>}
                {contact && <p className="mt-1 text-xs text-muted-foreground">{contact}</p>}
              </div>
            </div>
            <div className="sm:text-right">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.2em]" style={{ color: accent }}>{REPORT_LABEL[type] ?? "Student academic report"}</p>
              <h2 className="mt-2 text-xl font-black">{sample.pupil.firstName} {sample.pupil.lastName}</h2>
              <p className="mt-1 text-sm">{sample.setName}</p>
              <p className="mt-1 text-sm text-muted-foreground">{sample.academicYear} · {sample.term} · {sample.pupil.className}</p>
              <p className="mt-1 text-xs text-muted-foreground">Admission no. {sample.pupil.admissionNumber}</p>
            </div>
          </div>
        </header>

        <div className="space-y-6 p-5 sm:p-7">
          <section className="grid grid-cols-3 gap-3">
            <Metric label="Subjects graded" value={String(subjects.length)} />
            <Metric label="Average score" value={`${average.toFixed(1)}%`} />
            <Metric label="Average position" value={showPosition ? averagePosition.toFixed(1) : "—"} note={showPosition ? undefined : "Not shown in this design"} />
          </section>

          <section>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: accent }}>01 · Academic results</p>
            <h2 className="mb-3 mt-1 text-lg font-black">Subject performance</h2>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                <thead>
                  <tr style={{ backgroundColor: accent, color: onAccent }}>
                    <th className="p-3 font-semibold">Subject</th><th className="p-3 text-right font-semibold">Score</th><th className="p-3 text-right font-semibold">Percentage</th><th className="p-3 text-center font-semibold">Grade</th>{showPosition && <th className="p-3 text-center font-semibold">Position</th>}
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((row, index) => (
                    <tr key={row.subject.id} className={index % 2 ? "border-t border-border bg-muted/20" : "border-t border-border"}>
                      <td className="p-3"><span className="font-semibold">{row.subject.name}</span><span className="mt-0.5 block text-[11px] text-muted-foreground">{row.subject.code}</span></td>
                      <td className="p-3 text-right font-medium tabular-nums">{row.totalScore.toFixed(1)}</td>
                      <td className="p-3 text-right tabular-nums">{row.percentage.toFixed(1)}%</td>
                      <td className="p-3 text-center"><span className="inline-flex min-w-9 justify-center rounded-lg px-2 py-1 text-xs font-black" style={{ color: accent, backgroundColor: `${accent}14` }}>{row.grade}</span></td>
                      {showPosition && <td className="p-3 text-center tabular-nums">{row.position}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {showBreakdown && (
            <section>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: accent }}>02 · How the marks add up</p>
              <h2 className="mt-1 text-lg font-black">Assessment breakdown</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {subjects.slice(0, 4).map((row) => (
                  <div key={row.subject.id} className="rounded-2xl border border-border p-4">
                    <h3 className="text-sm font-bold">{row.subject.name}</h3>
                    <div className="mt-3 space-y-2">
                      {row.components.map((component) => (
                        <div key={component.name}>
                          <div className="flex items-center justify-between gap-3 text-xs"><span className="text-muted-foreground">{component.name}</span><span className="font-semibold tabular-nums">{component.marksObtained} / {component.maxMarks}</span></div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${component.percentage}%`, backgroundColor: accent }} /></div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {subjects.length > 4 && <p className="mt-2 text-[11px] text-muted-foreground">The sample shows the first four subjects. A real report lists every subject.</p>}
            </section>
          )}

          <section>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: accent }}>{showBreakdown ? "03" : "02"} · Teacher feedback</p>
            <h2 className="mt-1 text-lg font-black">Remarks</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {sample.remarks.map((remark) => (
                <div key={remark.type} className="rounded-2xl border border-border p-4" style={{ borderLeftWidth: 3, borderLeftColor: accent }}>
                  <p className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{remark.type.replaceAll("_", " ")}</p>
                  <p className="mt-2 text-sm leading-6">{remark.content}</p>
                  <p className="mt-3 text-xs font-semibold text-muted-foreground">{remark.teacher}</p>
                </div>
              ))}
            </div>
          </section>

          <footer className="border-t border-border pt-4 text-[11px] leading-5 text-muted-foreground">Sample report · {template.name} · {sample.term}</footer>
        </div>
      </article>
      <style>{`@media print { body * { visibility: hidden; } .template-preview-area, .template-preview-area * { visibility: visible; } .template-preview-area { position: absolute; inset: 0; width: 100%; max-width: none; border: 0; border-radius: 0; background: white !important; color: black !important; } .template-preview-area section { break-inside: avoid; } @page { size: A4; margin: 12mm; } }`}</style>
    </PortalModal>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-black tabular-nums">{value}</p>
      {note && <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>}
    </div>
  );
}
