import {
  BadRequestException, ConflictException, ForbiddenException, Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import { TeacherScopeService } from "../../common/scope/teacher-scope.service.js";
import { academicReportPdf, snapshotHash, type AcademicSnapshot } from "./report-version.js";

@Injectable()
export class ReportVersionService {
  constructor(private readonly prisma: PrismaService,
    private readonly teacherScope: TeacherScopeService) {}

  async teacherQueue(schoolId: string, userId: string) {
    const assignments = await this.teacherScope.getAssignments(schoolId, userId);
    if (!assignments.teacherId || !assignments.classTeacherClassIds.length) return [];
    const versions = await this.prisma.client.reportCardVersion.findMany({
      where: { schoolId, classId: { in: assignments.classTeacherClassIds },
        set: { status: "GENERATED", schoolId },
        stage: { in: ["GENERATED", "TEACHER_REVIEWED", "APPROVED"] } },
      select: { id: true, setId: true, studentId: true, classId: true,
        version: true, stage: true, teacherRemark: true, teacherActorId: true,
        snapshot: true, createdAt: true,
        student: { select: { admissionNumber: true, profile: {
          select: { firstName: true, lastName: true },
        } } },
        set: { select: { name: true, term: { select: { name: true } } } } },
      orderBy: [{ setId: "asc" }, { studentId: "asc" }, { version: "desc" }],
      take: 2000,
    });
    const seen = new Set<string>();
    return versions.filter(v => {
      const key = v.setId + ":" + v.studentId;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map(({ snapshot, ...v }) => ({
      ...v,
      subjects: (snapshot as unknown as AcademicSnapshot).report.subjects?.map(item => ({
        name: item.subject.name, grade: item.grade, percentage: item.percentage,
      })) ?? [],
    }));
  }

  async recommend(schoolId: string, userId: string, versionId: string, remark: string) {
    const assignments = await this.teacherScope.getAssignments(schoolId, userId);
    if (!assignments.teacherId) throw new ForbiddenException("Only the appointed class teacher may recommend a pupil.");
    const actor = await this.prisma.client.user.findUnique({
      where: { id: userId }, select: { id: true, name: true },
    });
    if (!actor) throw new ForbiddenException("The approving staff account is not available.");
    return this.prisma.client.$transaction(async tx => {
      const v = await tx.reportCardVersion.findFirst({
        where: { id: versionId, schoolId }, include: { set: { select: { status: true, schoolId: true } } },
      });
      if (!v) throw new NotFoundException("Student report version not found.");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}), hashtext(${v.setId}))`;
      if (!assignments.classTeacherClassIds.includes(v.classId)) {
        throw new ForbiddenException("Only the assigned class teacher may recommend this pupil.");
      }
      if (v.set.status !== "GENERATED") throw new ConflictException("Only generated, unpublished reports can be recommended.");
      const latest = await tx.reportCardVersion.findFirst({
        where: { setId: v.setId, studentId: v.studentId }, orderBy: { version: "desc" },
        select: { id: true },
      });
      if (latest?.id !== v.id || v.stage !== "GENERATED") {
        throw new ConflictException("This version has already been recommended or has been superseded.");
      }
      if (snapshotHash(v.snapshot) !== v.snapshotHash) throw new ConflictException("Report snapshot integrity check failed.");
      const time = new Date();
      const result = await tx.reportCardVersion.updateMany({
        where: { id: v.id, schoolId, stage: "GENERATED" },
        data: { stage: "TEACHER_REVIEWED", teacherActorId: actor.id,
          teacherName: actor.name.slice(0,160), teacherRemark: remark.trim(), teacherApprovedAt: time },
      });
      if (result.count !== 1) throw new ConflictException("This report changed while being reviewed.");
      await tx.auditLog.create({ data: { schoolId, userId: actor.id, action: "UPDATE",
        entityType: "REPORT_CARD_VERSION", entityId: v.id,
        newValues: { stage: "TEACHER_REVIEWED", version: v.version,
          snapshotHash: v.snapshotHash, remark: remark.trim() } } });
      return { id: v.id, stage: "TEACHER_REVIEWED", approvedAt: time };
    });
  }

  async headteacherApprove(schoolId: string, userId: string, versionId: string, remark: string) {
    const actor = await this.prisma.client.user.findUnique({
      where: { id: userId }, select: { id: true, name: true },
    });
    if (!actor) throw new ForbiddenException("The headteacher account is not available.");
    return this.prisma.client.$transaction(async tx => {
      const v = await tx.reportCardVersion.findFirst({
        where: { id: versionId, schoolId }, include: { set: { select: { status: true } } },
      });
      if (!v) throw new NotFoundException("Student report version not found.");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}), hashtext(${v.setId}))`;
      const latest = await tx.reportCardVersion.findFirst({
        where: { setId: v.setId, studentId: v.studentId }, orderBy: { version: "desc" },
        select: { id: true },
      });
      if (latest?.id !== v.id || v.stage !== "TEACHER_REVIEWED" ||
        v.set.status !== "GENERATED" || !v.teacherActorId || !v.teacherApprovedAt) {
        throw new ConflictException("Obtain the class teacher's recommendation on the latest report before headteacher approval.");
      }
      if (v.teacherActorId === userId) throw new ForbiddenException("The same person cannot approve both stages.");
      if (snapshotHash(v.snapshot) !== v.snapshotHash) throw new ConflictException("Report snapshot integrity check failed.");
      const time = new Date();
      const updated = await tx.reportCardVersion.updateMany({
        where: { id: v.id, schoolId, stage: "TEACHER_REVIEWED" },
        data: { stage: "APPROVED", headActorId: actor.id, headName: actor.name.slice(0,160),
          headRemark: remark.trim(), headApprovedAt: time },
      });
      if (updated.count !== 1) throw new ConflictException("This report changed while being approved.");
      await tx.auditLog.create({ data: { schoolId, userId, action: "UPDATE",
        entityType: "REPORT_CARD_VERSION", entityId: v.id,
        newValues: { stage: "APPROVED", version: v.version,
          snapshotHash: v.snapshotHash, remark: remark.trim() } } });
      return { id: v.id, stage: "APPROVED", approvedAt: time };
    });
  }

  /** Authorisation for PDF downloads is checked on every request, never via public R2 URLs. */
  async publishedPdf(schoolId: string, userId: string, reportId: string, audience: "student"|"guardian") {
    const db = this.prisma.client;
    const report = await db.reportCard.findFirst({
      where: { id: reportId, publishedAt: { not: null },
        set: { schoolId, status: "PUBLISHED" } },
      select: { setId: true, studentId: true },
    });
    if (!report) throw new NotFoundException("Published report not found.");
    if (audience === "student") {
      const student = await db.student.findFirst({
        where: { id: report.studentId, schoolId, deletedAt: null, profile: { userId } },
        select: { id: true },
      });
      if (!student) throw new NotFoundException("Published report not found.");
    } else {
      const guardian = await db.guardian.findFirst({
        where: { schoolId, deletedAt: null, isActive: true, profile: { userId },
          students: { some: { studentId: report.studentId, receiveReports: true,
            student: { schoolId, deletedAt: null } } } },
        select: { id: true },
      });
      if (!guardian) throw new NotFoundException("Published report not found.");
    }
    const version = await db.reportCardVersion.findFirst({
      where: { schoolId, setId: report.setId, studentId: report.studentId,
        stage: "PUBLISHED", publishedAt: { not: null } },
      orderBy: { version: "desc" },
    });
    if (!version) throw new ConflictException(
      "This historical report predates versioned PDFs. Ask the school to issue a verified PDF copy.",
    );
    if (snapshotHash(version.snapshot) !== version.snapshotHash) {
      throw new ConflictException("Stored academic report failed integrity verification.");
    }
    if (!version.teacherApprovedAt || !version.headApprovedAt || !version.teacherName || !version.headName) {
      throw new ConflictException("Both report approvals are required for PDF delivery.");
    }
    return {
      filename: "academic-report-v" + version.version + ".pdf",
      pdf: academicReportPdf(version.snapshot as unknown as AcademicSnapshot, {
        version: version.version, snapshotHash: version.snapshotHash,
        teacherName: version.teacherName, teacherRemark: version.teacherRemark,
        teacherApprovedAt: version.teacherApprovedAt,
        headName: version.headName, headRemark: version.headRemark,
        headApprovedAt: version.headApprovedAt, publishedAt: version.publishedAt,
      }),
    };
  }
}
