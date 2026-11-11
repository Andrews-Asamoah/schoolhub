import { commonWeight, ordinalParts } from "@schoolhub/shared";
import { CheckCircle2, GraduationCap, UserRound } from "lucide-react";
import { useState, type ReactNode } from "react";
import { accessibleAccentForeground } from "@/lib/accent-foreground";

export interface ReportDocSubject {
  subject: { id: string; name: string; code: string };
  totalScore: number;
  percentage: number;
  grade: string | null;
  position: number | null;
  remarks?: string | null;
  /** Report schema 2 fields. Older reports lack them and show a dash. */
  classScore?: number;
  classWeight?: number;
  examScore?: number;
  examWeight?: number;
  totalWeight?: number;
  gradeRemark?: string | null;
  components?: { name: string; marksObtained: number; maxMarks: number; percentage: number; weight: number }[];
}

export interface ReportDocLayout {
  type?: string;
  accentColor?: string;
  showPosition?: boolean;
  showAssessmentBreakdown?: boolean;
  /** Adds an Exam Score column between Class Score and Total Score. Off by default. */
  showExamScore?: boolean;
}

export interface ReportDocApproval {
  teacher: { name: string | null; remark: string | null; signature: string | null };
  head: { name: string | null; remark: string | null; signature: string | null };
}

export interface ReportDocumentProps {
  school: { name: string; code: string; logo: string | null; motto: string | null; address?: string | null; phone?: string | null; email?: string | null; website?: string | null; primaryColor?: string | null };
  layout: ReportDocLayout | null | undefined;
  /** `photo` is the pupil's picture URL. Without one, or if it will not load, a placeholder is shown. */
  pupil: { name: string; admissionNumber: string | null; className: string | null; photo?: string | null };
  setName: string;
  academicYear: string;
  term: string;
  designName: string;
  summary?: { average: number | null; subjectsGraded: number; overallPosition: number | null; classSize: number } | null;
  attendance?: { present: number; total: number; rate: number | null } | null;
  subjects: ReportDocSubject[];
  /** Free-text remarks recorded against the pupil; shown only when there is no approval to show instead. */
  legacyRemarks?: { type: string; content: string; teacher: string }[];
  approval?: ReportDocApproval | null;
  /** Small "Prepared for / published" box shown beside the header on published copies. */
  published?: { publishedAt: string | null } | null;
  sample?: boolean;
  printClass: string;
  footer?: ReactNode;
}

/** The pupil's photo, or a plain placeholder so every report has the same layout. */
function PupilPhoto({ src, name }: { src?: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const frame = "h-24 w-20 shrink-0 rounded-xl border border-border bg-muted";
  return src && !failed
    ? <img src={src} alt={`Photo of ${name}`} onError={() => setFailed(true)} className={`${frame} object-cover`} />
    : <span role="img" aria-label={`No photo available for ${name}`} className={`${frame} flex items-center justify-center text-muted-foreground`}><UserRound className="size-9" /></span>;
}

const REPORT_LABEL: Record<string, string> = { primary: "Primary terminal report", jhs: "JHS performance report", classic: "Classic academic report" };
const fixed = (value: number | null | undefined, digits = 1) => (value == null ? "—" : Number(value.toFixed(digits)).toString());

/** A raised ordinal, e.g. 3rd. Written as plain text for screen readers. */
export function Ordinal({ value, className }: { value: number; className?: string }) {
  const { n, suffix } = ordinalParts(value);
  return (
    <span className={className}>
      {n}
      <sup className="ml-px text-[0.55em] font-bold">{suffix}</sup>
    </span>
  );
}

/**
 * The report card as pupils and guardians see it, and as the admin previews it.
 * One component for all three so a design can't look different in each place.
 * Columns: Subject, Class Score, Total Score, Grade, Position, Remarks.
 * The pupil's overall position, class size and attendance sit at the top, and
 * the class teacher's and headteacher's remarks end the page with their signatures.
 */
export function ReportCardDocument(props: ReportDocumentProps) {
  const { school, layout, pupil, subjects, summary, attendance, approval } = props;
  const type = layout?.type ?? "modern";
  const accent = layout?.accentColor ?? school.primaryColor ?? "#4f46e5";
  const onAccent = accessibleAccentForeground(accent);
  const showPosition = layout?.showPosition !== false;
  const showBreakdown = layout?.showAssessmentBreakdown !== false && subjects.some((row) => (row.components?.length ?? 0) > 0);
  const showExam = layout?.showExamScore === true;
  const classWeight = commonWeight(subjects.map((row) => row.classWeight));
  const examWeight = commonWeight(subjects.map((row) => row.examWeight));
  const totalWeight = commonWeight(subjects.map((row) => row.totalWeight)) ?? 100;
  const contact = [school.phone, school.email, school.website].filter(Boolean).join(" · ");
  const hasOverall = showPosition && summary?.overallPosition != null;
  const heading = "p-3 font-semibold";
  const section = (index: number, kicker: string, title: string) => (
    <>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: accent }}>{String(index).padStart(2, "0")} · {kicker}</p>
      <h2 className="mt-1 text-lg font-black">{title}</h2>
    </>
  );
  const scoreCell = (score: number | undefined, weight: number | undefined, shared: number | null) =>
    score === undefined ? "—" : shared ? fixed(score) : `${fixed(score)} / ${fixed(weight)}`;
  const legacy = !approval && (props.legacyRemarks?.length ?? 0) > 0;

  return (
    <article className={`${props.printClass} relative overflow-hidden rounded-3xl border border-border bg-card shadow-sm print:rounded-none print:border-0 print:shadow-none`} style={{ fontFamily: type === "classic" ? "Georgia, Times New Roman, serif" : undefined }}>
      {props.sample && (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden">
          <span className="-rotate-24 select-none text-7xl font-black uppercase tracking-widest text-foreground/[0.06]">Sample</span>
        </div>
      )}
      <div className="h-2 w-full" style={{ backgroundColor: accent }} />
      <header className="relative overflow-hidden border-b border-border p-5 sm:p-8" style={{ backgroundColor: `${accent}0D` }}>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {school.logo
              ? <img src={school.logo} alt={`${school.name} logo`} className="size-14 shrink-0 rounded-xl border border-border bg-card object-contain p-1" />
              : <span className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-border bg-background" style={{ color: accent }}><GraduationCap className="size-7" /></span>}
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.2em]" style={{ color: accent }}>{school.code}</p>
              <h1 className="mt-1 text-xl font-black tracking-tight sm:text-2xl">{school.name}</h1>
              {school.motto && <p className="mt-1 text-xs italic text-muted-foreground">{school.motto}</p>}
              {school.address && <p className="mt-2 text-xs text-muted-foreground">{school.address}</p>}
              {contact && <p className="mt-1 text-xs text-muted-foreground">{contact}</p>}
            </div>
          </div>
          <div className="sm:text-right">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em]" style={{ color: accent }}>{REPORT_LABEL[type] ?? "Student academic report"}</p>
            <h2 className="mt-1 text-lg font-black sm:text-xl">{props.setName}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{props.academicYear} · {props.term}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 border-t border-border/70 pt-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="flex min-w-0 items-start gap-4">
            <PupilPhoto key={pupil.photo ?? "none"} src={pupil.photo} name={pupil.name} />
            <div className="min-w-0">
            <p className="text-xs font-semibold text-muted-foreground">Prepared for</p>
            <p className="mt-1 text-xl font-black">{pupil.name}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full border border-border bg-background/80 px-3 py-1.5 text-xs font-semibold">{pupil.className ?? "Class not specified"}</span>
              {pupil.admissionNumber && <span className="rounded-full border border-border bg-background/80 px-3 py-1.5 text-xs text-muted-foreground">Admission no. {pupil.admissionNumber}</span>}
            </div>
            {props.published && (
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5 font-semibold" style={{ color: accent }}><CheckCircle2 className="size-3.5" />Official published copy</span>
                <span>Design: {props.designName}</span>
                {props.published.publishedAt && <span>Published {new Date(props.published.publishedAt).toLocaleDateString()}</span>}
              </p>
            )}
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-3 text-center sm:min-w-80">
            <div className="rounded-2xl border border-border bg-background/80 p-3">
              <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Position</dt>
              <dd className="mt-1 text-2xl font-black tabular-nums" style={{ color: hasOverall ? accent : undefined }}>
                {hasOverall ? <Ordinal value={summary!.overallPosition!} /> : "—"}
              </dd>
            </div>
            <div className="rounded-2xl border border-border bg-background/80 p-3">
              <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Class size</dt>
              <dd className="mt-1 text-2xl font-black tabular-nums">{summary && summary.classSize > 0 ? summary.classSize : "—"}</dd>
            </div>
            <div className="rounded-2xl border border-border bg-background/80 p-3">
              <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Attendance</dt>
              <dd className="mt-1 text-2xl font-black tabular-nums">{attendance?.rate != null ? `${attendance.rate}%` : "—"}</dd>
              {attendance && <p className="mt-0.5 text-[10px] text-muted-foreground">{attendance.present} of {attendance.total} days</p>}
            </div>
          </dl>
        </div>
      </header>

      <div className="space-y-6 p-5 sm:p-8">
        <section>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>{section(1, "Academic results", "Subject performance")}</div>
            {summary?.average != null && <p className="text-xs text-muted-foreground">Average score <span className="font-semibold text-foreground">{fixed(summary.average)}%</span> across {summary.subjectsGraded} subjects</p>}
          </div>
          {subjects.length ? (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr style={{ backgroundColor: accent, color: onAccent }}>
                    <th scope="col" className={heading}>Subject</th>
                    <th scope="col" className={`${heading} text-center`}>Class Score{classWeight ? ` (${fixed(classWeight, 0)}%)` : ""}</th>
                    {showExam && <th scope="col" className={`${heading} text-center`}>Exam Score{examWeight ? ` (${fixed(examWeight, 0)}%)` : ""}</th>}
                    <th scope="col" className={`${heading} text-center`}>Total Score ({fixed(totalWeight, 0)}%)</th>
                    <th scope="col" className={`${heading} text-center`}>Grade</th>
                    {showPosition && <th scope="col" className={`${heading} text-center`}>Position</th>}
                    <th scope="col" className={heading}>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((row, index) => (
                    <tr key={row.subject.id} className={index % 2 ? "border-t border-border bg-muted/20" : "border-t border-border"}>
                      <th scope="row" className="p-3 text-left font-semibold">{row.subject.name}</th>
                      <td className="p-3 text-center tabular-nums">{scoreCell(row.classScore, row.classWeight, classWeight)}</td>
                      {showExam && <td className="p-3 text-center tabular-nums">{scoreCell(row.examScore, row.examWeight, examWeight)}</td>}
                      <td className="p-3 text-center font-semibold tabular-nums">{fixed(row.totalScore)}</td>
                      <td className="p-3 text-center"><span className="inline-flex min-w-9 justify-center rounded-lg px-2 py-1 text-xs font-black" style={{ color: accent, backgroundColor: `${accent}14` }}>{row.grade ?? "—"}</span></td>
                      {showPosition && <td className="p-3 text-center tabular-nums">{row.position == null ? "—" : <Ordinal value={row.position} />}</td>}
                      <td className="p-3 text-muted-foreground">{row.gradeRemark ?? row.remarks ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No finalized subject results were included in this report.</div>
          )}
        </section>

        {showBreakdown && (
          <section>
            {section(2, "How the marks add up", "Assessment breakdown")}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {subjects.filter((row) => (row.components?.length ?? 0) > 0).map((row) => (
                <div key={row.subject.id} className="rounded-2xl border border-border p-4">
                  <h3 className="text-sm font-bold">{row.subject.name}</h3>
                  <div className="mt-3 space-y-2">
                    {(row.components ?? []).map((component, index) => (
                      <div key={component.name + index}>
                        <div className="flex items-center justify-between gap-3 text-xs"><span className="text-muted-foreground">{component.name}</span><span className="font-semibold tabular-nums">{component.marksObtained} / {component.maxMarks}</span></div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, component.percentage))}%`, backgroundColor: accent }} /></div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {approval && (
          <section>
            {section(showBreakdown ? 3 : 2, "Teacher feedback", "Remarks")}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {([["Class teacher’s remarks", approval.teacher], ["Headteacher’s remarks", approval.head]] as const).map(([title, entry]) => (
                <div key={title} className="flex flex-col rounded-2xl border border-border p-4" style={{ borderLeftWidth: 3, borderLeftColor: accent }}>
                  <p className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{title}</p>
                  <p className="mt-2 flex-1 text-sm leading-6">{entry.remark || "No remark recorded."}</p>
                  <div className="mt-4 border-t border-border/70 pt-3">
                    <div className="flex h-14 items-end">
                      {entry.signature ? <img src={entry.signature} alt={`Signature of ${entry.name ?? "approver"}`} className="max-h-14 max-w-44 object-contain" /> : null}
                    </div>
                    <div className="border-t border-foreground/40 pt-1 text-xs font-semibold text-muted-foreground">{entry.name ?? "—"}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        {legacy && (
          <section>
            {section(showBreakdown ? 3 : 2, "Teacher feedback", "Remarks")}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {props.legacyRemarks!.map((remark, index) => (
                <div key={remark.type + index} className="rounded-2xl border border-border p-4" style={{ borderLeftWidth: 3, borderLeftColor: accent }}>
                  <p className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{remark.type.replaceAll("_", " ")}</p>
                  <p className="mt-2 text-sm leading-6">{remark.content}</p>
                  {remark.teacher && <p className="mt-3 text-xs font-semibold text-muted-foreground">{remark.teacher}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="flex flex-col gap-2 border-t border-border pt-4 text-[11px] leading-5 text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          {props.footer ?? <p>This report was made available securely through SchoolHub.</p>}
          <p>{props.designName} · {props.term}</p>
        </footer>
      </div>
    </article>
  );
}
