import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  ExtendAssessmentDeadlineInput,
  ReopenAssessmentEntryInput,
  SendEntryRemindersInput,
} from "@schoolhub/shared";
import { PrismaService } from "../../prisma/prisma.service.js";
import { templateSpecificity } from "./assessment-entry.js";
import { deadlineFromDate } from "./assessment-setup.js";
import {
  completion,
  effectiveDeadline,
  hasAllRequired,
  rollupByTeacher,
  trackingStatus,
  type TrackingStatus,
} from "./assessment-workflow.js";

export interface TrackingQuery {
  templateId?: string;
  classId?: string;
  teacherId?: string;
  status?: TrackingStatus;
}

const REMINDER_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const REMINDER_TITLE = "Marks entry reminder";

/**
 * Admin view of marks entry: for one assessment, how far each teacher has got
 * in each class and subject, plus the controls to extend a deadline, reopen a
 * signed-off sheet and nudge teachers who are behind.
 */
@Injectable()
export class AssessmentTrackingService {
  constructor(private readonly prisma: PrismaService) {}

  private async currentTerm(schoolId: string) {
    const term = await this.prisma.client.term.findFirst({
      where: { isCurrent: true, academicYear: { schoolId, isCurrent: true } },
      select: { id: true, name: true, termNumber: true },
    });
    if (!term) throw new BadRequestException("No academic term is currently selected for this school.");
    return term;
  }

  /**
   * One sheet per class and subject the chosen assessment applies to, with how
   * much of the register is done. A fixed number of queries however large the school.
   */
  async overview(schoolId: string, query: TrackingQuery) {
    const db = this.prisma.client;
    const term = await this.currentTerm(schoolId);
    const templates = await db.assessmentTemplate.findMany({
      where: { schoolId, isActive: true, OR: [{ termNumber: null }, { termNumber: term.termNumber }] },
      select: {
        id: true, name: true, deadline: true, isLocked: true, termNumber: true, classId: true, classLevel: true, subjectCode: true, departmentId: true,
        classes: { select: { classId: true } },
        components: { select: { id: true, isRequired: true, subjectStrand: { select: { subjectId: true } } } },
      },
      orderBy: [{ createdAt: "desc" }],
    });
    const selected = templates.find((item) => item.id === query.templateId) ?? templates[0] ?? null;
    const templateOptions = templates.map((item) => ({ id: item.id, name: item.name }));
    const pendingCorrections = await db.assessmentMarkCorrection.count({ where: { schoolId, status: "PENDING" } });
    const empty = { term, templates: templateOptions, template: null, summary: null, sheets: [], teachers: [], pendingCorrections };
    if (!selected) return empty;

    const classSubjects = await db.classSubject.findMany({
      where: { class: { schoolId, deletedAt: null, isActive: true }, subject: { schoolId } },
      select: {
        id: true, classId: true, subjectId: true, teacherId: true,
        class: { select: { id: true, name: true, level: true, departmentId: true } },
        subject: { select: { id: true, name: true, code: true } },
        strandAssignments: { select: { teacherId: true } },
      },
    });
    const applicable = classSubjects.filter(
      (link) =>
        templateSpecificity(
          {
            isActive: true,
            termNumber: selected.termNumber,
            subjectCode: selected.subjectCode,
            classId: selected.classId,
            classIds: selected.classes.map((item) => item.classId),
            classLevel: selected.classLevel,
            departmentId: selected.departmentId,
          },
          link.class,
          link.subject.code,
          term.termNumber,
        ) !== null &&
        selected.components.every((component) => !component.subjectStrand || component.subjectStrand.subjectId === link.subjectId),
    );
    const classIds = [...new Set(applicable.map((link) => link.classId))];
    const subjectIds = [...new Set(applicable.map((link) => link.subjectId))];

    const [enrollments, scores, submissions, extensions, pending] = await Promise.all([
      db.enrollment.findMany({
        where: { termId: term.id, status: "ACTIVE", classId: { in: classIds }, student: { deletedAt: null } },
        select: { classId: true, studentId: true },
      }),
      db.assessmentScore.findMany({
        where: { termId: term.id, templateId: selected.id, subjectId: { in: subjectIds } },
        select: { studentId: true, subjectId: true, componentScores: { select: { componentId: true } } },
      }),
      db.assessmentEntrySubmission.findMany({ where: { schoolId, templateId: selected.id, termId: term.id } }),
      db.assessmentExtension.findMany({ where: { templateId: selected.id }, select: { classId: true, teacherId: true, deadline: true } }),
      db.assessmentMarkCorrection.findMany({
        where: { schoolId, templateId: selected.id, termId: term.id, status: "PENDING" },
        select: { classId: true, subjectId: true },
      }),
    ]);

    const rosterByClass = new Map<string, string[]>();
    for (const row of enrollments) rosterByClass.set(row.classId, [...(rosterByClass.get(row.classId) ?? []), row.studentId]);
    const progressBySubject = new Map<string, Map<string, { complete: boolean; hasMarks: boolean }>>();
    for (const row of scores) {
      const bySubject = progressBySubject.get(row.subjectId) ?? new Map();
      const present = new Set(row.componentScores.map((cell) => cell.componentId));
      bySubject.set(row.studentId, { complete: hasAllRequired(selected.components, present), hasMarks: present.size > 0 });
      progressBySubject.set(row.subjectId, bySubject);
    }
    const submissionBySheet = new Map(submissions.map((row) => [`${row.classId}|${row.subjectId}`, row]));
    const pendingBySheet = new Set(pending.map((row) => `${row.classId}|${row.subjectId}`));

    const now = new Date();
    const sheets = applicable.map((link) => {
      const key = `${link.classId}|${link.subjectId}`;
      const submission = submissionBySheet.get(key) ?? null;
      const teacherIds = [...new Set([link.teacherId, ...link.strandAssignments.map((item) => item.teacherId)].filter((id): id is string => !!id))];
      const classExtensions = extensions.filter((item) => item.classId === link.classId);
      const deadlines = (teacherIds.length ? teacherIds : [null]).map((id) => effectiveDeadline(selected.deadline, classExtensions, id));
      const deadline = deadlines.reduce<Date | null>((latest, value) => (value && (!latest || value > latest) ? value : latest), null);
      const stats = completion(rosterByClass.get(link.classId) ?? [], progressBySubject.get(link.subjectId) ?? new Map(), new Set(submission?.excusedStudentIds ?? []));
      return {
        classId: link.classId,
        className: link.class.name,
        subjectId: link.subjectId,
        subjectName: link.subject.name,
        teacherIds,
        ...stats,
        done: stats.complete + stats.excused,
        deadline,
        status: trackingStatus(stats, submission !== null, deadline, now),
        submittedAt: submission?.submittedAt ?? null,
        hasPendingCorrection: pendingBySheet.has(key),
      };
    });

    const teacherNames = await this.teacherNames([...new Set(sheets.flatMap((sheet) => sheet.teacherIds))]);
    const named = sheets
      .map((sheet) => ({ ...sheet, teachers: sheet.teacherIds.map((id) => ({ id, name: teacherNames.get(id) ?? "Unknown teacher" })) }))
      .sort((a, b) => a.className.localeCompare(b.className, undefined, { numeric: true }) || a.subjectName.localeCompare(b.subjectName));

    const rollup = rollupByTeacher(named).map((row) => ({ ...row, name: row.teacherId ? (teacherNames.get(row.teacherId) ?? "Unknown teacher") : "No teacher assigned" }));
    const counts = (status: TrackingStatus) => named.filter((sheet) => sheet.status === status).length;
    const pupils = named.reduce((sum, sheet) => sum + sheet.total, 0);
    const done = named.reduce((sum, sheet) => sum + sheet.done, 0);
    const summary = {
      percent: pupils === 0 ? 0 : Math.round((done / pupils) * 100),
      sheets: named.length,
      submitted: counts("SUBMITTED"),
      complete: counts("COMPLETE"),
      overdue: counts("OVERDUE"),
      notStarted: counts("NOT_STARTED"),
      inProgress: counts("IN_PROGRESS"),
      unassigned: named.filter((sheet) => sheet.teacherIds.length === 0 && sheet.total > 0).length,
    };

    const filtered = named.filter(
      (sheet) =>
        (!query.classId || sheet.classId === query.classId) &&
        (!query.teacherId || sheet.teacherIds.includes(query.teacherId)) &&
        (!query.status || sheet.status === query.status),
    );
    return {
      term,
      templates: templateOptions,
      template: { id: selected.id, name: selected.name, deadline: selected.deadline, isLocked: selected.isLocked },
      summary,
      sheets: filtered,
      teachers: rollup,
      pendingCorrections,
    };
  }

  /** Grants more time to a whole class, or to one teacher in it. Never shortens a deadline. */
  async extend(schoolId: string, actorId: string, input: ExtendAssessmentDeadlineInput) {
    const db = this.prisma.client;
    const [template, klass] = await Promise.all([
      db.assessmentTemplate.findFirst({ where: { id: input.templateId, schoolId }, select: { id: true, name: true, deadline: true } }),
      db.class.findFirst({ where: { id: input.classId, schoolId, deletedAt: null }, select: { id: true } }),
    ]);
    if (!template) throw new NotFoundException("Assessment not found.");
    if (!klass) throw new NotFoundException("Class not found.");
    const deadline = deadlineFromDate(input.deadline)!;
    if (template.deadline && deadline <= template.deadline) {
      throw new BadRequestException("The extension must end after the assessment's own deadline.");
    }
    let teacherUserId: string | null = null;
    if (input.teacherId) {
      const teacher = await db.teacher.findFirst({ where: { id: input.teacherId, schoolId }, select: { profile: { select: { userId: true } } } });
      if (!teacher) throw new NotFoundException("Teacher not found.");
      teacherUserId = teacher.profile?.userId ?? null;
    }
    await db.$transaction(async (tx) => {
      // The unique key includes a nullable teacher, which Postgres treats as always distinct, so look first.
      const existing = await tx.assessmentExtension.findFirst({
        where: { templateId: template.id, classId: input.classId, teacherId: input.teacherId },
        select: { id: true, deadline: true },
      });
      if (existing) {
        await tx.assessmentExtension.update({ where: { id: existing.id }, data: { deadline, reason: input.reason ?? null } });
      } else {
        await tx.assessmentExtension.create({
          data: { templateId: template.id, classId: input.classId, teacherId: input.teacherId, deadline, reason: input.reason ?? null },
        });
      }
      await tx.auditLog.create({
        data: {
          schoolId, userId: actorId, action: "UPDATE", entityType: "AssessmentExtension", entityId: `${template.id}:${input.classId}:${input.teacherId ?? "all"}`,
          oldValues: existing ? { deadline: existing.deadline } : undefined,
          newValues: { deadline, reason: input.reason ?? null },
        },
      });
      if (teacherUserId) {
        await tx.notification.create({
          data: {
            schoolId, userId: teacherUserId, type: "GENERAL", title: "Marks deadline extended",
            message: `${template.name} marks can now be entered until ${input.deadline}.`, link: "/assessments",
          },
        });
      }
    });
    return { ok: true, deadline };
  }

  /** Removes a sign-off so the teacher can edit again. Always with a reason, always audited. */
  async reopen(schoolId: string, actorId: string, input: ReopenAssessmentEntryInput) {
    const db = this.prisma.client;
    const term = await this.currentTerm(schoolId);
    const submission = await db.assessmentEntrySubmission.findFirst({
      where: { schoolId, templateId: input.templateId, classId: input.classId, subjectId: input.subjectId, termId: term.id },
      select: { id: true },
    });
    if (!submission) throw new BadRequestException("These marks have not been submitted.");
    await db.$transaction(async (tx) => {
      await tx.assessmentEntrySubmission.delete({ where: { id: submission.id } });
      await tx.assessmentScore.updateMany({
        where: { templateId: input.templateId, subjectId: input.subjectId, termId: term.id, status: "SUBMITTED" },
        data: { status: "DRAFT" },
      });
      await tx.auditLog.create({
        data: {
          schoolId, userId: actorId, action: "UPDATE", entityType: "AssessmentSubmission",
          entityId: `${input.templateId}:${input.classId}:${input.subjectId}:${term.id}`,
          newValues: { reopened: true, reason: input.reason },
        },
      });
    });
    return { ok: true };
  }

  /** In-app reminders to teachers with unfinished sheets, at most one per teacher every 12 hours. */
  async remind(schoolId: string, actorId: string, input: SendEntryRemindersInput) {
    const db = this.prisma.client;
    const view = await this.overview(schoolId, { templateId: input.templateId });
    if (!view.template || view.template.id !== input.templateId) throw new NotFoundException("Assessment not found.");
    const wanted = input.teacherIds ? new Set(input.teacherIds) : null;
    const behind = new Map<string, number>();
    for (const sheet of view.sheets) {
      if (!["NOT_STARTED", "IN_PROGRESS", "OVERDUE"].includes(sheet.status)) continue;
      for (const id of sheet.teacherIds) if (!wanted || wanted.has(id)) behind.set(id, (behind.get(id) ?? 0) + 1);
    }
    if (behind.size === 0) return { sent: 0, skipped: 0 };

    const teachers = await db.teacher.findMany({
      where: { schoolId, id: { in: [...behind.keys()] } },
      select: { id: true, profile: { select: { userId: true } } },
    });
    const userByTeacher = new Map(teachers.flatMap((teacher) => (teacher.profile?.userId ? [[teacher.id, teacher.profile.userId] as const] : [])));
    const recent = await db.notification.findMany({
      where: { schoolId, title: REMINDER_TITLE, userId: { in: [...userByTeacher.values()] }, createdAt: { gte: new Date(Date.now() - REMINDER_COOLDOWN_MS) } },
      select: { userId: true },
    });
    const cooling = new Set(recent.map((row) => row.userId));
    const data = [...behind]
      .flatMap(([teacherId, count]) => {
        const userId = userByTeacher.get(teacherId);
        return userId && !cooling.has(userId)
          ? [{
              schoolId, userId, type: "GENERAL" as const, title: REMINDER_TITLE, link: "/assessments",
              message: `${count} class${count === 1 ? "" : "es"} still need marks for ${view.template!.name}. Please complete and submit them.`,
            }]
          : [];
      });
    await db.$transaction(async (tx) => {
      if (data.length) await tx.notification.createMany({ data });
      await tx.auditLog.create({
        data: { schoolId, userId: actorId, action: "UPDATE", entityType: "AssessmentReminder", entityId: input.templateId, newValues: { sent: data.length } },
      });
    });
    return { sent: data.length, skipped: behind.size - data.length };
  }

  private async teacherNames(ids: string[]) {
    if (ids.length === 0) return new Map<string, string>();
    const rows = await this.prisma.client.teacher.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true, profile: { select: { firstName: true, lastName: true } } },
    });
    return new Map(
      rows.map((row) => [
        row.id,
        `${row.profile?.firstName ?? row.firstName ?? ""} ${row.profile?.lastName ?? row.lastName ?? ""}`.trim() || "Unnamed teacher",
      ]),
    );
  }
}
