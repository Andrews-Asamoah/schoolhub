import {
  BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import { TeacherScopeService } from "../../common/scope/teacher-scope.service.js";
import { ReportAssetsService } from "./report-assets.service.js";
import { academicReportPdf, reportVerifyUrl, snapshotHash, type AcademicSnapshot } from "./report-version.js";
import { MANUAL_RECOMMENDATION } from "./report-recommendation-source.js";

/** Upper bound for one bulk sign-off; each row is its own transaction. */
export const MAX_BULK_RECOMMENDATIONS = 100;

@Injectable()
export class ReportVersionService {
  constructor(private readonly prisma: PrismaService,
    private readonly teacherScope: TeacherScopeService,
    private readonly assets: ReportAssetsService) {}

  async teacherQueue(schoolId: string, userId: string) {
    const assignments = await this.teacherScope.getAssignments(schoolId, userId);
    if (!assignments.teacherId || !assignments.classTeacherClassIds.length) return [];
    const versions = await this.prisma.client.reportCardVersion.findMany({
      where: { schoolId, classId: { in: assignments.classTeacherClassIds },
        set: { status: "GENERATED", schoolId },
        stage: { in: ["GENERATED", "TEACHER_REVIEWED", "APPROVED"] } },
      select: { id: true, setId: true, studentId: true, classId: true,
        version: true, stage: true, teacherRemark: true, teacherActorId: true,
        carriedTeacherRemark: true, snapshot: true, createdAt: true,
        student: { select: { admissionNumber: true, profile: {
          select: { firstName: true, lastName: true },
        } } },
        set: { select: { name: true, term: { select: { name: true } } } } },
      orderBy: [{ setId: "asc" }, { studentId: "asc" }, { version: "desc" }],
      take: 2000,
    });
    const seen = new Set<string>();
    const latest = versions.filter(v => {
      const key = v.setId + ":" + v.studentId;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const drafts = latest.length
      ? await this.prisma.client.reportRecommendationDraft.findMany({
          where: { schoolId, setId: { in: [...new Set(latest.map(v => v.setId))] },
            studentId: { in: [...new Set(latest.map(v => v.studentId))] } },
          select: { setId: true, studentId: true, remark: true },
        })
      : [];
    const draftByKey = new Map(drafts.map(d => [d.setId + ":" + d.studentId, d.remark]));
    return latest.map(({ snapshot, carriedTeacherRemark, ...v }) => {
      const report = (snapshot as unknown as AcademicSnapshot).report;
      // An unsent draft is newer work than text carried over from a regenerated version, so it wins.
      const draft = v.stage === "GENERATED" ? (draftByKey.get(v.setId + ":" + v.studentId) ?? null) : null;
      const carried = v.stage === "GENERATED" && !draft ? carriedTeacherRemark : null;
      return {
        ...v,
        average: report.summary?.average ?? null,
        position: report.summary?.overallPosition ?? null,
        classSize: report.summary?.classSize ?? null,
        draftRemark: draft ?? carried,
        carriedOver: carried !== null,
        subjects: report.subjects?.map(item => ({
          name: item.subject.name, grade: item.grade, percentage: item.percentage,
        })) ?? [],
      };
    });
  }

  /**
   * Autosave a recommendation while the class teacher is still writing it. A draft never changes
   * the report; an empty text removes it. Only the appointed class teacher of the pupil's class may
   * save one, and only while the latest version is still waiting for a recommendation.
   */
  async saveDraft(schoolId: string, userId: string, versionId: string, remark: string) {
    const text = remark.trim();
    if (text.length > 2000) throw new BadRequestException("A recommendation can be at most 2000 characters.");
    const assignments = await this.teacherScope.getAssignments(schoolId, userId);
    const v = await this.prisma.client.reportCardVersion.findFirst({
      where: { id: versionId, schoolId },
      select: { id: true, setId: true, studentId: true, classId: true, stage: true, set: { select: { status: true } } },
    });
    if (!v) throw new NotFoundException("Student report version not found.");
    if (!assignments.teacherId || !assignments.classTeacherClassIds.includes(v.classId)) {
      throw new ForbiddenException("Only the assigned class teacher may write a recommendation for this pupil.");
    }
    if (v.set.status !== "GENERATED" || v.stage !== "GENERATED") {
      throw new ConflictException("This report is no longer waiting for a recommendation.");
    }
    const newest = await this.prisma.client.reportCardVersion.findFirst({
      where: { setId: v.setId, studentId: v.studentId }, orderBy: { version: "desc" }, select: { id: true },
    });
    if (newest?.id !== v.id) throw new ConflictException("This version has been superseded. Reload the list.");
    if (!text) {
      await this.prisma.client.reportRecommendationDraft.deleteMany({ where: { schoolId, setId: v.setId, studentId: v.studentId } });
      return { id: v.id, saved: false };
    }
    await this.prisma.client.reportRecommendationDraft.upsert({
      where: { setId_studentId: { setId: v.setId, studentId: v.studentId } },
      create: { schoolId, setId: v.setId, studentId: v.studentId, authorId: userId, remark: text, source: MANUAL_RECOMMENDATION },
      update: { authorId: userId, remark: text, source: MANUAL_RECOMMENDATION },
    });
    return { id: v.id, saved: true };
  }

  /**
   * Run one action per row, each in its own transaction (the action opens it), so one pupil's failure
   * never blocks the rest, and report what happened to every row.
   */
  private async runBulk(
    items: { id: string; remark: string }[],
    action: (id: string, remark: string) => Promise<unknown>,
  ) {
    if (!items.length) throw new BadRequestException("Choose at least one pupil.");
    if (items.length > MAX_BULK_RECOMMENDATIONS) {
      throw new BadRequestException(`Sign off at most ${MAX_BULK_RECOMMENDATIONS} recommendations at a time.`);
    }
    if (new Set(items.map(i => i.id)).size !== items.length) throw new BadRequestException("A pupil appears more than once.");
    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const item of items) {
      try {
        const remark = item.remark.trim();
        if (remark.length < 10 || remark.length > 2000) throw new BadRequestException("Write a recommendation of 10–2000 characters.");
        await action(item.id, remark);
        results.push({ id: item.id, ok: true });
      } catch (error) {
        results.push({ id: item.id, ok: false, error: error instanceof HttpException ? error.message : "This recommendation could not be saved." });
      }
    }
    return { total: items.length, succeeded: results.filter(r => r.ok).length, results };
  }

  /** Sign off several class-teacher recommendations at once; see runBulk. */
  bulkRecommend(schoolId: string, userId: string, items: { id: string; remark: string }[]) {
    return this.runBulk(items, (id, remark) => this.recommend(schoolId, userId, id, remark));
  }

  /** Approve several pupils' reports at once as the headteacher; every row keeps the single-row rules. */
  bulkHeadApprove(schoolId: string, userId: string, items: { id: string; remark: string }[]) {
    return this.runBulk(items, (id, remark) => this.headteacherApprove(schoolId, userId, id, remark));
  }

  /**
   * Everything waiting for the headteacher across all unpublished report batches: pupils whose class
   * teacher has recommended (ready to approve) and pupils already approved. `canApprove` is false
   * where the same person gave the class-teacher recommendation, because one person cannot approve
   * both stages.
   */
  async headQueue(schoolId: string, userId: string) {
    const versions = await this.prisma.client.reportCardVersion.findMany({
      where: { schoolId, set: { status: "GENERATED", schoolId }, stage: { in: ["GENERATED", "TEACHER_REVIEWED", "APPROVED"] } },
      select: { id: true, setId: true, studentId: true, classId: true, version: true, stage: true,
        teacherActorId: true, teacherName: true, teacherRemark: true, teacherApprovedAt: true,
        headName: true, headRemark: true, headApprovedAt: true, carriedHeadRemark: true, snapshot: true,
        student: { select: { admissionNumber: true, profile: { select: { firstName: true, lastName: true } } } },
        set: { select: { name: true, term: { select: { name: true } } } } },
      orderBy: [{ setId: "asc" }, { studentId: "asc" }, { version: "desc" }],
      take: 5000,
    });
    const seen = new Set<string>();
    const latest = versions.filter(v => {
      const key = v.setId + ":" + v.studentId;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const classes = latest.length
      ? await this.prisma.client.class.findMany({
          where: { schoolId, id: { in: [...new Set(latest.map(v => v.classId))] } },
          select: { id: true, name: true },
        })
      : [];
    const className = new Map(classes.map(c => [c.id, c.name]));
    return latest.map(({ snapshot, teacherActorId, ...v }) => {
      const report = (snapshot as unknown as AcademicSnapshot).report;
      return {
        ...v,
        className: className.get(v.classId) ?? "Class",
        average: report.summary?.average ?? null,
        position: report.summary?.overallPosition ?? null,
        classSize: report.summary?.classSize ?? null,
        canApprove: v.stage === "TEACHER_REVIEWED" && !!teacherActorId && teacherActorId !== userId,
        subjects: report.subjects?.map(item => ({
          name: item.subject.name, grade: item.grade, percentage: item.percentage,
        })) ?? [],
      };
    });
  }

  async recommend(schoolId: string, userId: string, versionId: string, remark: string) {
    const assignments = await this.teacherScope.getAssignments(schoolId, userId);
    if (!assignments.teacherId) throw new ForbiddenException("Only the appointed class teacher may recommend a pupil.");
    const actor = await this.prisma.client.user.findUnique({
      where: { id: userId }, select: { id: true, name: true },
    });
    if (!actor) throw new ForbiddenException("The approving staff account is not available.");
    const signature = await this.assets.signatureFor(schoolId, userId);
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
          teacherName: actor.name.slice(0,160), teacherRemark: remark.trim(), teacherRemarkSource: MANUAL_RECOMMENDATION,
          teacherApprovedAt: time, teacherSignature: signature },
      });
      if (result.count !== 1) throw new ConflictException("This report changed while being reviewed.");
      await tx.reportRecommendationDraft.deleteMany({ where: { schoolId, setId: v.setId, studentId: v.studentId } });
      await tx.auditLog.create({ data: { schoolId, userId: actor.id, action: "UPDATE",
        entityType: "REPORT_CARD_VERSION", entityId: v.id,
        newValues: { stage: "TEACHER_REVIEWED", version: v.version,
          snapshotHash: v.snapshotHash, remark: remark.trim(), source: MANUAL_RECOMMENDATION } } });
      return { id: v.id, stage: "TEACHER_REVIEWED", approvedAt: time };
    });
  }

  async headteacherApprove(schoolId: string, userId: string, versionId: string, remark: string) {
    const actor = await this.prisma.client.user.findUnique({
      where: { id: userId }, select: { id: true, name: true },
    });
    if (!actor) throw new ForbiddenException("The headteacher account is not available.");
    const signature = await this.assets.signatureFor(schoolId, userId);
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
          headRemark: remark.trim(), headRemarkSource: MANUAL_RECOMMENDATION,
          headApprovedAt: time, headSignature: signature },
      });
      if (updated.count !== 1) throw new ConflictException("This report changed while being approved.");
      await tx.auditLog.create({ data: { schoolId, userId, action: "UPDATE",
        entityType: "REPORT_CARD_VERSION", entityId: v.id,
        newValues: { stage: "APPROVED", version: v.version,
          snapshotHash: v.snapshotHash, remark: remark.trim(), source: MANUAL_RECOMMENDATION } } });
      return { id: v.id, stage: "APPROVED", approvedAt: time };
    });
  }

  /**
   * A generated report as the school's own staff see it, before or after approval. School management
   * may open any pupil's report; a class teacher only their own class's. Signatories who have not
   * approved yet are shown with their uploaded signature and flagged as awaiting approval.
   */
  private async loadPreview(schoolId: string, actor: { id: string; role: string }, versionId: string) {
    const db = this.prisma.client;
    const version = await db.reportCardVersion.findFirst({
      where: { id: versionId, schoolId },
      include: {
        set: { select: { name: true } },
        student: { select: { admissionNumber: true, profile: { select: { user: { select: { image: true } } } } } },
      },
    });
    if (!version) throw new NotFoundException("Student report version not found.");
    if (actor.role === "teacher") {
      const assignments = await this.teacherScope.getAssignments(schoolId, actor.id);
      if (!assignments.classTeacherClassIds.includes(version.classId)) {
        throw new ForbiddenException("Only the class teacher or school management may open this report.");
      }
    }
    if (snapshotHash(version.snapshot) !== version.snapshotHash) {
      throw new ConflictException("Stored academic report failed integrity verification.");
    }
    const bothApproved = !!version.teacherApprovedAt && !!version.headApprovedAt;
    const designated = bothApproved ? null : await this.assets.designatedSignatories(schoolId, version.classId);
    const signatures = await this.assets.approvalSignatures(schoolId, {
      teacherActorId: version.teacherActorId ?? designated?.teacher?.userId ?? null,
      teacherSignature: version.teacherSignature,
      headActorId: version.headActorId ?? designated?.head?.userId ?? null,
      headSignature: version.headSignature,
    });
    return {
      version,
      snapshot: version.snapshot as unknown as AcademicSnapshot,
      teacher: { name: version.teacherName ?? designated?.teacher?.name ?? null, signature: signatures.teacher },
      head: { name: version.headName ?? designated?.head?.name ?? null, signature: signatures.head },
    };
  }

  /** Everything the report screen needs to draw one pupil's report, with signatures and photo. */
  async previewVersion(schoolId: string, actor: { id: string; role: string }, versionId: string) {
    const { version, snapshot, teacher, head } = await this.loadPreview(schoolId, actor, versionId);
    const school = await this.prisma.client.school.findUnique({
      where: { id: schoolId },
      select: { name: true, code: true, logo: true, motto: true, address: true, phone: true, email: true, website: true, primaryColor: true },
    });
    return {
      version: { id: version.id, version: version.version, stage: version.stage, publishedAt: version.publishedAt },
      school,
      set: { name: snapshot.set, academicYear: snapshot.year, term: snapshot.term, template: snapshot.template },
      pupil: {
        name: snapshot.student.name,
        admissionNumber: snapshot.student.admissionNumber,
        className: snapshot.report.student?.class?.name ?? null,
        photo: version.student.profile?.user?.image ?? null,
      },
      report: { summary: snapshot.report.summary ?? null, attendance: snapshot.report.attendance ?? null, subjects: snapshot.report.subjects ?? [], remarks: snapshot.report.remarks ?? [] },
      approval: {
        teacher: { name: teacher.name, remark: version.teacherRemark, signature: teacher.signature, approved: !!version.teacherApprovedAt },
        head: { name: head.name, remark: version.headRemark, signature: head.signature, approved: !!version.headApprovedAt },
      },
    };
  }

  /** The same report as a PDF with the school's letterhead, the pupil's photo and both signatures. */
  async previewPdf(schoolId: string, actor: { id: string; role: string }, versionId: string) {
    const { version, snapshot, teacher, head } = await this.loadPreview(schoolId, actor, versionId);
    const [photo, letterhead] = await Promise.all([
      this.assets.studentPhoto(schoolId, version.studentId),
      this.assets.letterhead(schoolId),
    ]);
    const final = !!version.teacherApprovedAt && !!version.headApprovedAt && !!version.publishedAt;
    return {
      filename: `academic-report-${(version.student.admissionNumber ?? version.studentId).replace(/[^A-Za-z0-9_-]/g, "_")}-v${version.version}.pdf`,
      pdf: academicReportPdf(snapshot, {
        version: version.version, snapshotHash: version.snapshotHash,
        teacherName: teacher.name, teacherRemark: version.teacherRemark, teacherApprovedAt: version.teacherApprovedAt,
        headName: head.name, headRemark: version.headRemark, headApprovedAt: version.headApprovedAt,
        publishedAt: version.publishedAt, teacherSignature: teacher.signature, headSignature: head.signature,
        preview: !final,
      }, { letterhead, photo }),
    };
  }

  /** Authorisation for PDF downloads is checked on every request, never via public R2 URLs. */
  /**
   * `audience` "staff" skips the pupil/guardian ownership check because the caller (the archive
   * service) has already authorised the person against their role and scope; nothing else should use it.
   */
  async publishedPdf(schoolId: string, userId: string, reportId: string, audience: "student"|"guardian"|"staff") {
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
    } else if (audience === "guardian") {
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
    // Approval signatures fall back to the approver's current one when none was captured, and the
    // pupil's photo and the school's letterhead are read now, so the printed copy is never bare.
    const [signatures, photo, letterhead] = await Promise.all([
      this.assets.approvalSignatures(schoolId, version),
      this.assets.studentPhoto(schoolId, report.studentId),
      this.assets.letterhead(schoolId),
    ]);
    return {
      filename: "academic-report-v" + version.version + ".pdf",
      pdf: academicReportPdf(version.snapshot as unknown as AcademicSnapshot, {
        version: version.version, snapshotHash: version.snapshotHash,
        teacherName: version.teacherName, teacherRemark: version.teacherRemark,
        teacherApprovedAt: version.teacherApprovedAt,
        headName: version.headName, headRemark: version.headRemark,
        headApprovedAt: version.headApprovedAt, publishedAt: version.publishedAt,
        teacherSignature: signatures.teacher, headSignature: signatures.head,
      }, { letterhead, photo, verifyUrl: reportVerifyUrl(process.env.WEB_ORIGIN, version.id, version.snapshotHash) }),
    };
  }
}
