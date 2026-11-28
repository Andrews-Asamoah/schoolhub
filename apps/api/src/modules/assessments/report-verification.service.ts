import { Injectable } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service.js";
import { reportVerificationCode, snapshotHash, type AcademicSnapshot } from "./report-version.js";

export type ReportVerification =
  | { status: "NOT_FOUND" }
  | { status: "FAILED_INTEGRITY" }
  | {
      status: "VALID" | "SUPERSEDED";
      school: string;
      student: { name: string; admissionNumber: string | null; className: string | null };
      year: string; term: string; assessment: string;
      version: number; publishedAt: string | null;
      approvals: { teacher: { name: string | null; at: string | null }; head: { name: string | null; at: string | null } };
      /** Only for a current report: what a verifier compares with the paper copy. */
      results: { average: number | null; position: number | null; classSize: number | null; subjects: { name: string; total: number; grade: string | null }[] } | null;
      fingerprint: string | null;
    };

const NOT_FOUND: ReportVerification = { status: "NOT_FOUND" };

/** Constant-time comparison, so the code cannot be guessed a character at a time. */
function sameCode(a: string, b: string): boolean {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Public check behind the QR code on a printed report. It needs the version's id and the code printed
 * with it, answers only for reports that were actually published, and re-checks the stored seal, so
 * a copy with changed marks, a made-up link or a withdrawn report never reads as genuine.
 */
@Injectable()
export class ReportVerificationService {
  constructor(private readonly prisma: PrismaService) {}

  async verify(versionId: string, code: string): Promise<ReportVerification> {
    const typed = code.replace(/[^0-9a-f]/gi, "").toUpperCase();
    if (!versionId || versionId.length > 64 || typed.length !== 16) return NOT_FOUND;
    const db = this.prisma.client;
    const version = await db.reportCardVersion.findFirst({
      where: { id: versionId, publishedAt: { not: null } },
      select: { id: true, setId: true, studentId: true, version: true, stage: true, publishedAt: true, snapshot: true, snapshotHash: true, teacherName: true, teacherApprovedAt: true, headName: true, headApprovedAt: true },
    });
    // A wrong code answers exactly like an unknown report.
    if (!version || !sameCode(reportVerificationCode(version.snapshotHash).replace(/-/g, ""), typed)) return NOT_FOUND;
    if (snapshotHash(version.snapshot) !== version.snapshotHash) return { status: "FAILED_INTEGRITY" };

    const set = await db.reportCardSet.findFirst({ where: { id: version.setId }, select: { status: true } });
    const current = version.stage === "PUBLISHED" && set?.status === "PUBLISHED";
    const snapshot = version.snapshot as unknown as AcademicSnapshot;
    const summary = snapshot.report.summary;
    return {
      status: current ? "VALID" : "SUPERSEDED",
      school: snapshot.school.name,
      student: { name: snapshot.student.name, admissionNumber: snapshot.student.admissionNumber, className: snapshot.report.student?.class?.name ?? null },
      year: snapshot.year, term: snapshot.term, assessment: snapshot.set,
      version: version.version,
      publishedAt: version.publishedAt?.toISOString() ?? null,
      approvals: {
        teacher: { name: version.teacherName, at: version.teacherApprovedAt?.toISOString() ?? null },
        head: { name: version.headName, at: version.headApprovedAt?.toISOString() ?? null },
      },
      results: current
        ? {
          average: summary?.average ?? null, position: summary?.overallPosition ?? null, classSize: summary?.classSize ?? null,
          subjects: (snapshot.report.subjects ?? []).map((row) => ({ name: row.subject.name, total: row.totalScore, grade: row.grade })),
        }
        : null,
      fingerprint: current ? version.snapshotHash : null,
    };
  }
}
