import { createHash } from "node:crypto";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { commonWeight as sharedWeight, ordinalParts } from "@schoolhub/shared";
import { pdfImageFormat } from "./report-images.js";

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

/**
 * The short code printed on a report and carried in its verification link: the first 64 bits of the
 * sealed snapshot's SHA-256. The verification page checks it against the stored report, so a
 * document with a changed code, or a link made up for another report, is not recognised.
 */
export function reportVerificationCode(hash: string): string {
  return (hash.slice(0, 16).toUpperCase().match(/.{4}/g) ?? []).join("-");
}

/** Public page that confirms a published report. Needs the version id and its code, so it cannot be browsed. */
export function reportVerifyUrl(origin: string | undefined, versionId: string, hash: string): string | null {
  if (!origin) return null;
  try {
    return new URL(`/verify-report/${encodeURIComponent(versionId)}/${reportVerificationCode(hash)}`, origin).toString();
  } catch {
    return null;
  }
}

/** Draws a QR code as vector squares (crisp at any print size) with a white quiet zone around it. */
function drawQr(doc: jsPDF, value: string, x: number, y: number, size: number) {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: "M" });
  const quiet = 2;
  const cell = size / (modules.size + quiet * 2);
  doc.setFillColor(255, 255, 255);
  doc.rect(x, y, size, size, "F");
  doc.setFillColor(0, 0, 0);
  for (let row = 0; row < modules.size; row += 1) {
    for (let col = 0; col < modules.size; col += 1) {
      if (modules.get(row, col)) doc.rect(x + (col + quiet) * cell, y + (row + quiet) * cell, cell + 0.2, cell + 0.2, "F");
    }
  }
  doc.setDrawColor(200, 204, 210);
  doc.rect(x, y, size, size, "S");
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
    /** Added with the printed grade key; older snapshots lack it and the PDF falls back to the grades used. */
    gradeScale?: { name: string; method: string; rows: { grade: string; description: string; min: number; max: number }[] } | null;
    remarks?: { type: string; content: string; teacher: string }[];
  };
  school: { name: string; code: string; motto?: string | null };
  template: { name: string; layout: unknown };
  student: { name: string; admissionNumber: string | null };
  year: string; term: string; set: string;
  capturedAt: string;
};

/**
 * The recommendations a regenerated report starts with. A regenerated version is a new, unsigned version,
 * so the previous sign-off cannot be reused (it vouched for the old marks), but the text people wrote
 * must not be lost. We take what was signed on the previous version, or, when that version was itself
 * never signed, what it was carrying from the version before it, so repeated regenerations keep the text.
 */
export function carriedRecommendations(previous: {
  teacherRemark: string | null; headRemark: string | null;
  carriedTeacherRemark: string | null; carriedHeadRemark: string | null;
} | null | undefined) {
  const text = (value: string | null | undefined) => (value && value.trim() ? value : null);
  return {
    carriedTeacherRemark: text(previous?.teacherRemark) ?? text(previous?.carriedTeacherRemark),
    carriedHeadRemark: text(previous?.headRemark) ?? text(previous?.carriedHeadRemark),
  };
}

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
  /**
   * True for a preview of a report that is not fully approved or published yet. The signatories'
   * uploaded signatures are shown, marked "Awaiting approval", and the footer says it is a preview.
   */
  preview?: boolean;
};

/** Presentation read when the PDF is made; deliberately not part of the sealed snapshot. */
export type ReportPdfExtras = {
  letterhead?: {
    name: string; motto: string | null; address: string | null;
    phone: string | null; email: string | null; website: string | null; logo: string | null;
  } | null;
  /** The pupil's photo as a PNG or JPEG data URL. Without one, a placeholder is drawn. */
  photo?: string | null;
  /** Link the QR code opens to verify this report. Left out for previews, which are not issued reports. */
  verifyUrl?: string | null;
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
export function academicReportPdf(snapshot: AcademicSnapshot, approval: ReportApproval, extras: ReportPdfExtras = {}): Buffer {
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

  // Header band: the school's logo, name and contact details on the left, the report title on the right.
  const letterhead = extras.letterhead ?? null;
  const headerInk = onAccent(accent);
  const hasLogo = !!pdfImageFormat(letterhead?.logo);
  const textLeft = hasLogo ? margin + 58 : margin;
  const titleRight = pageWidth - margin;
  const leftWidth = titleRight - textLeft - 185;
  const nameLines = wrap(letterhead?.name ?? snapshot.school.name, leftWidth, 15, true).slice(0, 2);
  const detailLines = [
    letterhead ? letterhead.motto : snapshot.school.motto,
    letterhead?.address,
    [letterhead?.phone, letterhead?.email, letterhead?.website].filter(Boolean).join("  ·  "),
  ].filter((line): line is string => !!line).map((line) => wrap(line, leftWidth, 8.5)[0]!).slice(0, 3);
  const detailsTop = 28 + (nameLines.length - 1) * 16 + 14;
  const bandHeight = Math.max(70, detailsTop + detailLines.length * 11 + 8);
  doc.setFillColor(...accent);
  doc.rect(0, 0, pageWidth, bandHeight, "F");
  if (hasLogo) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin, 12, 46, 46, 6, 6, "F");
    drawImageFit(doc, letterhead?.logo, margin + 3, 15, 40, 40, "center");
  }
  nameLines.forEach((line, index) => text(line, textLeft, 28 + index * 16, { bold: true, size: 15, color: headerInk }));
  detailLines.forEach((line, index) => text(line, textLeft, detailsTop + index * 11, { size: 8.5, color: headerInk }));
  text(`${snapshot.set} · ${snapshot.year} · ${snapshot.term}`, titleRight, 30, { size: 10, color: headerInk, align: "right" });
  text("SCHOOL-GENERATED ACADEMIC REPORT", titleRight, 46, { bold: true, size: 8.5, color: headerInk, align: "right" });
  y = bandHeight + 28;

  // Pupil details (left) and standing (right)
  const cls = snapshot.report.student?.class?.name ?? "—";
  const photoW = 58;
  const photoH = 72;
  drawPhoto(doc, extras.photo, margin, y - 14, photoW, photoH);
  const infoX = margin + photoW + 14;
  const pupilLines = wrap(snapshot.student.name, titleRight - 150 - infoX, 15, true).slice(0, 2);
  pupilLines.forEach((line, index) => text(line, infoX, y + index * 17, { bold: true, size: 15 }));
  const infoY = y + (pupilLines.length - 1) * 17;
  text(`Admission number: ${snapshot.student.admissionNumber ?? "—"}`, infoX, infoY + 18);
  text(`Class: ${cls}`, infoX, infoY + 33);
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
  y = Math.max(y + 68, ry + 10);

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

  // Class teacher's and headteacher's remarks side by side, each with its signature.
  const gap = 20;
  const colWidth = (width - gap) / 2;
  type Remark = { title: string; remark: string | null; name: string | null; approvedAt: Date | null; signature: string | null | undefined };
  const remarkColumns: Remark[] = [
    { title: "CLASS TEACHER'S REMARKS", remark: approval.teacherRemark, name: approval.teacherName, approvedAt: approval.teacherApprovedAt, signature: approval.teacherSignature },
    { title: "HEADTEACHER'S REMARKS", remark: approval.headRemark, name: approval.headName, approvedAt: approval.headApprovedAt, signature: approval.headSignature },
  ];
  const remarkLines = remarkColumns.map((column) => wrap(column.remark || "No remark recorded.", colWidth - 8, 10));
  const signatureHeight = 54;
  ensure(34 + Math.max(...remarkLines.map((lines) => lines.length)) * 13 + signatureHeight + 22);
  const remarksTop = y;
  let remarksBottom = y;
  remarkColumns.forEach((column, index) => {
    const x = margin + index * (colWidth + gap);
    let cy = remarksTop;
    text(column.title, x, cy, { bold: true, size: 10, color: accent });
    cy += 14;
    remarkLines[index]!.forEach((line) => { text(line, x + 4, cy, { size: 10 }); cy += 13; });
    cy += 6;
    // Both signatures sit on one line, under the longer of the two remarks.
    remarksBottom = Math.max(remarksBottom, cy);
  });
  y = remarksBottom;
  remarkColumns.forEach((column, index) => {
    const x = margin + index * (colWidth + gap);
    drawSignature(doc, column.signature, x + 4, y, 130, 40);
    doc.setDrawColor(150, 150, 150);
    doc.line(x + 4, y + 44, x + Math.min(colWidth - 4, 170), y + 44);
    // A preview marks a signatory who has not approved yet instead of showing a date.
    const status = column.approvedAt ? ` · ${column.approvedAt.toISOString().slice(0, 10)}` : approval.preview ? " · Awaiting approval" : "";
    wrap(`${column.name ?? "—"}${status}`, colWidth - 8, 8.5).slice(0, 2)
      .forEach((line, lineIndex) => text(line, x + 4, y + 56 + lineIndex * 10, { size: 8.5, color: [90, 90, 90] }));
  });
  y += signatureHeight + 30;

  // Grade key at the bottom: the scale the grades came from and what each grade means.
  const scale = snapshot.report.gradeScale ?? null;
  const keyRows: { grade: string; description: string; range: string }[] = scale?.rows.length
    ? scale.rows.map((row) => ({ grade: row.grade, description: row.description, range: scale.method === "SCORE_BANDS" ? `${num(row.min)}–${num(row.max)}` : "" }))
    // Reports sealed before the scale was stored: show the grades this pupil actually earned.
    : [...new Map(subjects.filter((row) => row.grade).map((row) => [row.grade!, row.gradeRemark ?? ""])).entries()]
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([grade, description]) => ({ grade, description, range: "" }));
  if (keyRows.length) {
    const hasRange = keyRows.some((row) => row.range);
    const keyTitle = scale ? `GRADING SCALE: ${scale.name.toUpperCase()}` : "GRADES USED IN THIS REPORT";
    const keyColumns = keyRows.length > 6 ? 2 : 1;
    const perColumn = Math.ceil(keyRows.length / keyColumns);
    const keyColWidth = (width - gap * (keyColumns - 1)) / keyColumns;
    const keyLine = (row: { grade: string; description: string; range: string }) => `${row.grade}${hasRange && row.range ? `  (${row.range})` : ""}  -  ${row.description || "—"}`;
    const keyLines = keyRows.map((row) => wrap(keyLine(row), keyColWidth - 4, 8.5));
    const columnHeights = Array.from({ length: keyColumns }, (_, c) => keyLines.slice(c * perColumn, (c + 1) * perColumn).reduce((sum, lines) => sum + lines.length * 10.5 + 2, 0));
    ensure(24 + Math.max(...columnHeights) + 8);
    doc.setDrawColor(200, 204, 210);
    doc.line(margin, y - 8, margin + width, y - 8);
    text(keyTitle, margin, y + 4, { bold: true, size: 9, color: accent });
    if (scale?.method === "CLASS_RANK") text("Grades are set by each pupil's position in the class.", margin + width, y + 4, { size: 8, color: [90, 90, 90], align: "right" });
    const keyTop = y + 18;
    for (let c = 0; c < keyColumns; c += 1) {
      let ky = keyTop;
      keyLines.slice(c * perColumn, (c + 1) * perColumn).forEach((lines) => {
        lines.forEach((line) => { text(line, margin + c * (keyColWidth + gap) + 4, ky, { size: 8.5 }); ky += 10.5; });
        ky += 2;
      });
    }
    y = keyTop + Math.max(...columnHeights) + 10;
  }

  const grey: Rgb = [110, 110, 110];
  const issuedLine = approval.preview
    ? `Report version ${approval.version} | Preview: not yet fully approved or published`
    : `Report version ${approval.version} | Published ${approval.publishedAt?.toISOString() ?? "—"}`;
  const verifyUrl = approval.preview ? null : extras.verifyUrl ?? null;
  if (verifyUrl) {
    // Verification block: QR on the left, what it does and the code to quote on the right.
    const qr = 70;
    const textX = margin + qr + 14;
    const textWidth = width - qr - 14;
    const urlLines = wrap(verifyUrl, textWidth, 7.5);
    const blockHeight = Math.max(qr, 52 + urlLines.length * 9) + 4;
    ensure(blockHeight + 34);
    doc.setDrawColor(200, 204, 210);
    doc.line(margin, y - 8, margin + width, y - 8);
    drawQr(doc, verifyUrl, margin, y, qr);
    text("VERIFY THIS REPORT", textX, y + 10, { bold: true, size: 9, color: accent });
    wrap("Scan the QR code, or open the link below, to confirm that this report was issued by the school and has not been altered. Compare the results shown there with this page.", textWidth, 8)
      .slice(0, 3).forEach((line, index) => text(line, textX, y + 22 + index * 10, { size: 8, color: [60, 60, 60] }));
    urlLines.forEach((line, index) => text(line, textX, y + 54 + index * 9, { size: 7.5, color: grey }));
    text(`Verification code: ${reportVerificationCode(approval.snapshotHash)}`, textX, y + 54 + urlLines.length * 9 + 3, { bold: true, size: 8.5, color: [30, 30, 30] });
    y += blockHeight + 10;
    ensure(28);
    text(issuedLine, margin, y, { size: 8, color: grey });
    text("Approval records are electronic workflow attestations; this document does not use a certificate-based digital signature.", margin, y + 11, { size: 7, color: grey });
  } else {
    ensure(40);
    text(issuedLine, margin, y, { size: 8, color: grey });
    // Without a verification link (a preview, or no web address configured) the seal is all there is to quote.
    if (!approval.preview) text(`Source SHA-256: ${approval.snapshotHash}`, margin, y + 11, { size: 7, color: grey });
    text("Approval records are electronic workflow attestations; this document does not use a certificate-based digital signature.", margin, y + (approval.preview ? 11 : 22), { size: 7, color: grey });
  }
  doc.setProperties({ title: "Academic report — " + snapshot.student.name, subject: "School-generated academic report" });
  return Buffer.from(doc.output("arraybuffer"));
}

function ordinalSuffix(value: number): string {
  return ordinalParts(value).suffix;
}

/**
 * Draws an image inside a box, keeping its proportions. Skips quietly if it can't be drawn: a bad
 * picture never blocks the report (the callers read and log the reason before getting here).
 */
function drawImageFit(doc: jsPDF, dataUrl: string | null | undefined, x: number, y: number, maxWidth: number, maxHeight: number, align: "bottom" | "center" = "bottom") {
  const format = pdfImageFormat(dataUrl);
  if (!dataUrl || !format) return;
  try {
    const props = doc.getImageProperties(dataUrl);
    const scale = Math.min(maxWidth / props.width, maxHeight / props.height);
    const w = props.width * scale;
    const h = props.height * scale;
    doc.addImage(dataUrl, format, x + (align === "center" ? (maxWidth - w) / 2 : 0), y + (align === "center" ? (maxHeight - h) / 2 : maxHeight - h), w, h);
  } catch {
    /* a bad image never blocks the report */
  }
}

const drawSignature = drawImageFit;

/** The pupil's photo in a bordered frame, or a plain head-and-shoulders placeholder when there is none. */
function drawPhoto(doc: jsPDF, dataUrl: string | null | undefined, x: number, y: number, w: number, h: number) {
  doc.setFillColor(236, 238, 241);
  doc.roundedRect(x, y, w, h, 4, 4, "F");
  if (pdfImageFormat(dataUrl)) {
    drawImageFit(doc, dataUrl, x + 1, y + 1, w - 2, h - 2, "center");
  } else {
    doc.setFillColor(176, 182, 191);
    doc.circle(x + w / 2, y + h * 0.36, w * 0.2, "F");
    doc.ellipse(x + w / 2, y + h * 0.8, w * 0.36, h * 0.17, "F");
  }
  doc.setDrawColor(200, 204, 210);
  doc.setLineWidth(0.75);
  doc.roundedRect(x, y, w, h, 4, 4, "S");
  doc.setLineWidth(1);
}
