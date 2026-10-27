import { createHash } from "node:crypto";
import { jsPDF } from "jspdf";

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

export type AcademicSnapshot = {
  schemaVersion: number;
  report: {
    student?: { id?: string; class?: { id: string; name: string; level: string } | null };
    subjects?: { subject: { name: string; code: string }; totalScore: number;
      percentage: number; grade: string | null; remarks?: string | null }[];
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
};

/** Generate an authenticated download from immutable stored data only.
 * Approval lines are attributable e-signoff records, NOT certificate-based
 * cryptographic PDF signatures or printed handwritten-signature images.
 */
export function academicReportPdf(snapshot: AcademicSnapshot, approval: ReportApproval): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 44;
  const width = pageWidth - margin * 2;
  const bottom = doc.internal.pageSize.getHeight() - 50;
  let y = 47;
  const page = () => { doc.addPage(); y = 45; };
  const write = (text: string, opts?: { bold?: boolean; size?: number; gap?: number }) => {
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
    doc.setFontSize(opts?.size ?? 10);
    const lines = doc.splitTextToSize(text || "—", width) as string[];
    for (const line of lines) {
      if (y > bottom) page();
      doc.text(line, margin, y);
      y += (opts?.size ?? 10) + 4;
    }
    y += opts?.gap ?? 3;
  };
  write(snapshot.school.name, { bold: true, size: 17, gap: 4 });
  write("SCHOOL-GENERATED ACADEMIC REPORT", { bold: true, size: 10, gap: 10 });
  write(snapshot.set + " · " + snapshot.year + " · " + snapshot.term, { bold: true, size: 11 });
  write("Student: " + snapshot.student.name);
  write("Admission number: " + (snapshot.student.admissionNumber ?? "—"));
  write("Class: " + (snapshot.report.student?.class?.name ?? "—"), { gap: 10 });
  write("SUBJECT RESULTS", { bold: true, size: 11, gap: 6 });
  for (const row of snapshot.report.subjects ?? []) {
    write(row.subject.name + " (" + row.subject.code + ")  ·  " +
      String(row.percentage) + "%  ·  Grade: " + (row.grade ?? "—"));
  }
  y += 7;
  if ((snapshot.report.remarks ?? []).length) {
    write("RECORDED ACADEMIC REMARKS", { bold: true, size: 10 });
    for (const remark of snapshot.report.remarks ?? []) {
      write(remark.type + ": " + remark.content + (remark.teacher ? " — " + remark.teacher : ""));
    }
  }
  y += 6;
  write("CLASS TEACHER RECOMMENDATION", { bold: true, size: 10 });
  write(approval.teacherRemark || "No recommendation recorded.");
  write("Approved by: " + (approval.teacherName ?? "—") +
    " | " + (approval.teacherApprovedAt?.toISOString() ?? "—"), { gap: 10 });
  write("HEADTEACHER RECOMMENDATION", { bold: true, size: 10 });
  write(approval.headRemark || "No recommendation recorded.");
  write("Approved by: " + (approval.headName ?? "—") +
    " | " + (approval.headApprovedAt?.toISOString() ?? "—"), { gap: 12 });
  write("Report version " + approval.version + " | Published " +
    (approval.publishedAt?.toISOString() ?? "—"), { size: 9 });
  write("Source SHA-256: " + approval.snapshotHash, { size: 8 });
  write("Approval records are electronic workflow attestations; this document does not use a certificate-based digital signature.", { size: 8 });
  doc.setProperties({ title: "Academic report — " + snapshot.student.name,
    subject: "School-generated academic report" });
  return Buffer.from(doc.output("arraybuffer"));
}
