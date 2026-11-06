import { createHash } from "node:crypto";
import { jsPDF } from "jspdf";
import { commonWeight as sharedWeight, ordinalParts } from "@schoolhub/shared";

/** Stable across object key order; integrity seal for the immutable source JSON. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return "{" + entries.map(([k, v]) => JSON.stringify(k) + ":" + canonicalJson(v)).join(",") + "}";
}
export function snapshotHash(snapshot: unknown): string {
  return createHash("sha256").update(canonicalJson(snapshot)).digest("hex");
}

export type SnapshotSubject = {
  subject: { name: string; code: string };
  totalScore: number;
  percentage: number;
  grade: string | null;
  position?: number | null;
  remarks?: string | null;
  /** Added in report schema 2; older snapshots lack these and fall back gracefully. */
  classScore?: number;
  classWeight?: number;
  examScore?: number;
  examWeight?: number;
  totalWeight?: number;
  gradeRemark?: string | null;
};

export type AcademicSnapshot = {
  schemaVersion: number;
  report: {
    student?: { id?: string; class?: { id: string; name: string; level: string } | null };
    summary?: { average: number | null; subjectsGraded: number; overallPosition: number | null; classSize: number };
    attendance?: { present: number; total: number; rate: number | null } | null;
    subjects?: SnapshotSubject[];
    remarks?: { type: string; content: string; teacher: string }[];
  };
  school: { name: string; code: string; motto?: string | null };
  template: { name: string; layout: unknown };
  student: { name: string; admissionNumber: string | null };
  year: string; term: string; set: string;
  capturedAt: string;
};

export type ReportApproval = {
  version: number;
  snapshotHash: string;
  teacherName: string | null; teacherRemark: string | null;
  teacherApprovedAt: Date | null;
  headName: string | null; headRemark: string | null;
  headApprovedAt: Date | null;
  publishedAt: Date | null;
  /** Approver signature images (data URLs) captured when they approved. */
  teacherSignature?: string | null;
  headSignature?: string | null;
};

type Layout = { accentColor?: string; showPosition?: boolean; showExamScore?: boolean };
type Rgb = [number, number, number];

function hexToRgb(value: string | undefined, fallback: Rgb): Rgb {
  const match = /^#?([0-9a-f]{6})$/i.exec(value ?? "");
  if (!match) return fallback;
  const n = parseInt(match[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const onAccent = ([r, g, b]: Rgb): Rgb => (0.299 * r + 0.587 * g + 0.114 * b > 160 ? [20, 20, 20] : [255, 255, 255]);
const num = (value: number | null | undefined, digits = 1) => (value == null ? "—" : Number(value.toFixed(digits)).toString());

/** Generate an authenticated download from immutable stored data only.
 * Approval lines are attributable e-signoff records, NOT certificate-based
 * cryptographic PDF signatures. A signature image, when the approver had one on
 * file, is the picture they uploaded, shown beside their recorded approval.
 */
export function academicReportPdf(snapshot: AcademicSnapshot, approval: ReportApproval): Buffer {
  const layout = (snapshot.template.layout ?? {}) as Layout;
  const accent = hexToRgb(layout.accentColor, [31, 41, 55]);
  const showPosition = layout.showPosition !== false;
  const showExam = layout.showExamScore === true;
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  const width = pageWidth - margin * 2;
  const bottom = doc.internal.pageSize.getHeight() - 48;
  let y = 0;
  const page = () => { doc.addPage(); y = 44; };
  const ensure = (height: number) => { if (y + height > bottom) page(); };
  const text = (value: string, x: number, at: number, opts?: { bold?: boolean; size?: number; color?: Rgb; align?: "left" | "right" | "center" }) => {
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
    doc.setFontSize(opts?.size ?? 10);
    doc.setTextColor(...(opts?.color ?? [30, 30, 30]));
    doc.text(value, x, at, { align: opts?.align ?? "left" });
  };
  const wrap = (value: string, maxWidth: number, size = 10, bold = false): string[] => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    return doc.splitTextToSize(value || "—", maxWidth) as string[];
  };

  // Header band
  doc.setFillColor(...accent);
  doc.rect(0, 0, pageWidth, 70, "F");
  const headerInk = onAccent(accent);
  text(snapshot.school.name, margin, 34, { bold: true, size: 17, color: headerInk });
  text("SCHOOL-GENERATED ACADEMIC REPORT", margin, 52, { bold: true, size: 9, color: headerInk });
  text(`${snapshot.set} · ${snapshot.year} · ${snapshot.term}`, pageWidth - margin, 34, { size: 10, color: headerInk, align: "right" });
  y = 96;

  // Pupil details (left) and standing (right)
  const cls = snapshot.report.student?.class?.name ?? "—";
  text(snapshot.student.name, margin, y, { bold: true, size: 15 });
  text(`Admission number: ${snapshot.student.admissionNumber ?? "—"}`, margin, y + 18);
  text(`Class: ${cls}`, margin, y + 33);
  const summary = snapshot.report.summary;
  const rightX = pageWidth - margin;
  let ry = y;
  if (showPosition && summary?.overallPosition != null) {
    const position = summary.overallPosition;
    const suffix = ordinalSuffix(position);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    const numberWidth = doc.getTextWidth(String(position));
    doc.setFontSize(11);
    const suffixWidth = doc.getTextWidth(suffix);
    const startX = rightX - numberWidth - suffixWidth;
    text(String(position), startX, ry + 8, { bold: true, size: 22, color: accent });
    text(suffix, startX + numberWidth, ry - 1, { bold: true, size: 11, color: accent }); // raised suffix
    text("Position in class", rightX, ry + 22, { size: 9, color: [90, 90, 90], align: "right" });
    ry += 36;
  }
  if (summary && summary.classSize > 0) {
    text(`Class size: ${summary.classSize} pupils`, rightX, ry + 4, { size: 10, align: "right" });
    ry += 15;
  }
  const attendance = snapshot.report.attendance;
  if (attendance) {
    text(`Attendance: ${attendance.present} of ${attendance.total} days${attendance.rate != null ? ` (${attendance.rate}%)` : ""}`, rightX, ry + 4, { size: 10, align: "right" });
    ry += 15;
  }
  y = Math.max(y + 48, ry + 10);

  // Results table
  const subjects = snapshot.report.subjects ?? [];
  const sharedClassWeight = sharedWeight(subjects.map((row) => row.classWeight));
  const sharedExamWeight = sharedWeight(subjects.map((row) => row.examWeight));
  const sharedTotalWeight = sharedWeight(subjects.map((row) => row.totalWeight)) ?? 100;
  type Column = { title: string; weight: number; align: "left" | "center" | "right"; cell: (row: SnapshotSubject) => string };
  const columns: Column[] = [
    { title: "Subject", weight: 27, align: "left", cell: (row) => row.subject.name },
    { title: sharedClassWeight ? `Class Score (${sharedClassWeight}%)` : "Class Score", weight: 14, align: "center", cell: (row) => row.classScore == null ? "—" : sharedClassWeight ? num(row.classScore) : `${num(row.classScore)} / ${num(row.classWeight)}` },
    ...(showExam ? [{ title: sharedExamWeight ? `Exam Score (${sharedExamWeight}%)` : "Exam Score", weight: 14, align: "center" as const, cell: (row: SnapshotSubject) => row.examScore == null ? "—" : sharedExamWeight ? num(row.examScore) : `${num(row.examScore)} / ${num(row.examWeight)}` }] : []),
    { title: `Total Score (${num(sharedTotalWeight, 0)}%)`, weight: 14, align: "center", cell: (row) => num(row.totalScore) },
    { title: "Grade", weight: 8, align: "center", cell: (row) => row.grade ?? "—" },
    ...(showPosition ? [{ title: "Position", weight: 10, align: "center" as const, cell: (row: SnapshotSubject) => row.position == null ? "—" : `${row.position}${ordinalSuffix(row.position)}` }] : []),
    { title: "Remarks", weight: 27, align: "left", cell: (row) => row.gradeRemark ?? row.remarks ?? "—" },
  ];
  const totalWeight = columns.reduce((sum, column) => sum + column.weight, 0);
  let cursor = margin;
  const spans = columns.map((column) => { const w = (column.weight / totalWeight) * width; const span = { x: cursor, w }; cursor += w; return span; });
  const pad = 5;
  const header = () => {
    const lines = columns.map((column, index) => wrap(column.title, spans[index]!.w - pad * 2, 8.5, true));
    const height = Math.max(...lines.map((l) => l.length)) * 11 + 10;
    ensure(height + 26);
    doc.setFillColor(...accent);
    doc.rect(margin, y, width, height, "F");
    columns.forEach((column, index) => {
      const span = spans[index]!;
      const x = column.align === "left" ? span.x + pad : span.x + span.w / 2;
      lines[index]!.forEach((line, row) => text(line, x, y + 14 + row * 11, { bold: true, size: 8.5, color: headerInk, align: column.align === "left" ? "left" : "center" }));
    });
    y += height;
  };
  header();
  subjects.forEach((row, rowIndex) => {
    const cells = columns.map((column, index) => wrap(column.cell(row), spans[index]!.w - pad * 2, 9, index === 0));
    const height = Math.max(...cells.map((c) => c.length)) * 11 + 9;
    if (y + height > bottom) { page(); header(); }
    if (rowIndex % 2 === 1) { doc.setFillColor(244, 245, 247); doc.rect(margin, y, width, height, "F"); }
    columns.forEach((column, index) => {
      const span = spans[index]!;
      const x = column.align === "left" ? span.x + pad : span.x + span.w / 2;
      cells[index]!.forEach((line, lineIndex) => text(line, x, y + 13 + lineIndex * 11, { size: 9, bold: index === 0, align: column.align === "left" ? "left" : "center" }));
    });
    doc.setDrawColor(225, 227, 231);
    doc.line(margin, y + height, margin + width, y + height);
    y += height;
  });
  y += 18;

  // Remarks with signatures
  const remarkBlock = (title: string, remark: string | null, name: string | null, approvedAt: Date | null, signature: string | null | undefined) => {
    const lines = wrap(remark || "No remark recorded.", width - 16, 10);
    const signatureHeight = 54;
    ensure(34 + lines.length * 13 + signatureHeight + 22);
    text(title, margin, y, { bold: true, size: 10, color: accent });
    y += 14;
    lines.forEach((line) => { text(line, margin + 8, y, { size: 10 }); y += 13; });
    y += 6;
    drawSignature(doc, signature, margin + 8, y, 130, 40);
    doc.setDrawColor(150, 150, 150);
    doc.line(margin + 8, y + 44, margin + 178, y + 44);
    text(`${name ?? "—"}${approvedAt ? ` · ${approvedAt.toISOString().slice(0, 10)}` : ""}`, margin + 8, y + 56, { size: 8.5, color: [90, 90, 90] });
    y += signatureHeight + 30;
  };
  remarkBlock("CLASS TEACHER'S REMARKS", approval.teacherRemark, approval.teacherName, approval.teacherApprovedAt, approval.teacherSignature);
  remarkBlock("HEADTEACHER'S REMARKS", approval.headRemark, approval.headName, approval.headApprovedAt, approval.headSignature);

  ensure(40);
  text(`Report version ${approval.version} | Published ${approval.publishedAt?.toISOString() ?? "—"}`, margin, y, { size: 8, color: [110, 110, 110] });
  text(`Source SHA-256: ${approval.snapshotHash}`, margin, y + 11, { size: 7, color: [110, 110, 110] });
  text("Approval records are electronic workflow attestations; this document does not use a certificate-based digital signature.", margin, y + 22, { size: 7, color: [110, 110, 110] });
  doc.setProperties({ title: "Academic report — " + snapshot.student.name, subject: "School-generated academic report" });
  return Buffer.from(doc.output("arraybuffer"));
}

function ordinalSuffix(value: number): string {
  return ordinalParts(value).suffix;
}

/** Draws a signature image inside a box, keeping its proportions; skips quietly if it can't be drawn. */
function drawSignature(doc: jsPDF, dataUrl: string | null | undefined, x: number, y: number, maxWidth: number, maxHeight: number) {
  const format = /^data:image\/(png|jpeg);base64,/.exec(dataUrl ?? "")?.[1]?.toUpperCase();
  if (!dataUrl || !format) return;
  try {
    const props = doc.getImageProperties(dataUrl);
    const scale = Math.min(maxWidth / props.width, maxHeight / props.height);
    doc.addImage(dataUrl, format, x, y + (maxHeight - props.height * scale), props.width * scale, props.height * scale);
  } catch {
    /* a bad image never blocks the report */
  }
}
