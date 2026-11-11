import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type School } from "@prisma/client";
import type { RequestMarkCorrectionInput, ReviewMarkCorrectionInput } from "@schoolhub/shared";
import { PrismaService } from "../../prisma/prisma.service.js";
import { canEnterComponentMarks, isSchoolManager } from "../../common/scope/teacher-access.js";
import { validateMarks } from "./assessment-entry.js";
import { AssessmentEntryService } from "./assessment-entry.service.js";
import { applyMarkChanges } from "./assessment-marks-writer.js";
import {
  CORRECTION_APPROVER_ROLES,
  LOCK_MESSAGES,
  approvalProblem,
  cellId,
  correctionAllowed,
  effectiveChanges,
  effectiveDeadline,
  reasonProblem,
  sheetLock,
} from "./assessment-workflow.js";

type Status = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
const STATUSES: readonly Status[] = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"];
const PAGE = 50;
/** Roles that may apply a correction without a second person approving it. */
const DIRECT_CORRECTION_ROLES: readonly string[] = ["owner", "admin"];

/**
 * Corrections to marks on a sheet that is locked, signed off or past its
 * deadline. A teacher (or manager) proposes the new marks with a reason; the
 * owner, an administrator or the headteacher approves or rejects. Approval applies the marks through
 * the same writer as normal entry, so totals, grades and positions stay right,
 * and the old and new values are kept in the audit trail.
 */
@Injectable()
export class AssessmentCorrectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entry: AssessmentEntryService,
  ) {}

  async request(school: School, userId: string, role: string | undefined, input: RequestMarkCorrectionInput) {
    const db = this.prisma.client;
    if (input.applyNow && !DIRECT_CORRECTION_ROLES.includes(role ?? "")) {
      throw new ForbiddenException("Only the owner or an administrator can apply a correction straight away.");
    }
    const ctx = await this.entry.loadContext(school.id, userId, role, input.classId, input.subjectId);
    const template = ctx.templates.find((item) => item.id === input.templateId);
    if (!template) throw new BadRequestException("That assessment does not apply to this class and subject.");

    const lock = sheetLock({
      templateLocked: template.isLocked,
      submitted: template.submission !== null,
      deadline: effectiveDeadline(template.deadline, template.extensions, ctx.assignments.teacherId),
      now: new Date(),
      canEnterAnyComponent: true,
    });
    if (!correctionAllowed(lock)) {
      throw new BadRequestException("This sheet is still open, so change the marks directly instead of requesting a correction.");
    }

    const componentById = new Map(template.components.map((component) => [component.id, component]));
    const forbidden = input.items.find((item) => {
      const component = componentById.get(item.componentId);
      return !component || !canEnterComponentMarks(role, ctx.assignments, input.classId, input.subjectId, component.subjectStrandId);
    });
    if (forbidden) throw new ForbiddenException("You can only correct marks for the teaching areas assigned to you in this class.");
    const problems = validateMarks(input.items, template.components);
    if (problems.length) throw new BadRequestException(problems.slice(0, 3).map((problem) => problem.message).join(" "));

    const roster = await this.entry.loadRoster(ctx.klass.id, ctx.term.id);
    const rosterIds = new Set(roster.map((student) => student.id));
    if (input.items.some((item) => !rosterIds.has(item.studentId))) {
      throw new BadRequestException("Corrections can only be made for pupils enrolled in this class this term.");
    }

    const stored = await db.componentScore.findMany({
      where: { assessmentScore: { templateId: template.id, subjectId: ctx.subject.id, termId: ctx.term.id, studentId: { in: [...new Set(input.items.map((item) => item.studentId))] } } },
      select: { componentId: true, occurrenceIndex: true, marksObtained: true, assessmentScore: { select: { studentId: true } } },
    });
    const current = new Map(stored.map((cell) => [cellId(cell.assessmentScore.studentId, cell.componentId, cell.occurrenceIndex), Number(cell.marksObtained)]));
    const changes = effectiveChanges(input.items, current);
    if (changes.length === 0) throw new BadRequestException("Those marks are already what is recorded. Nothing to correct.");

    let outcome: { id: string; cells: number; lock: string | null };
    try {
      outcome = await db.$transaction(async (tx) => {
        const created = await tx.assessmentMarkCorrection.create({
          data: {
            schoolId: school.id,
            templateId: template.id,
            classId: ctx.klass.id,
            subjectId: ctx.subject.id,
            termId: ctx.term.id,
            reason: input.reason,
            requestedById: userId,
            items: {
              create: changes.map((change) => ({
                studentId: change.studentId,
                componentId: change.componentId,
                occurrenceIndex: change.occurrenceIndex,
                previousMarks: change.before === null ? null : new Prisma.Decimal(change.before),
                requestedMarks: change.after === null ? null : new Prisma.Decimal(change.after),
              })),
            },
          },
          select: { id: true },
        });
        const approvers = await tx.member.findMany({
          where: {
            organizationId: school.organizationId,
            banned: false,
            user: { banned: false },
            OR: [{ role: { in: [...CORRECTION_APPROVER_ROLES] } }, { roles: { hasSome: [...CORRECTION_APPROVER_ROLES] } }],
          },
          select: { userId: true },
        });
        const recipients = approvers.filter((member) => member.userId !== userId);
        if (recipients.length && !input.applyNow) {
          await tx.notification.createMany({
            data: recipients.map((member) => ({
              schoolId: school.id,
              userId: member.userId,
              type: "GENERAL" as const,
              title: "Marks correction awaiting approval",
              message: `${ctx.subject.name} (${ctx.klass.name}): ${changes.length} mark${changes.length === 1 ? "" : "s"} need review.`,
              link: "/assessment-tracking",
            })),
          });
        }
        await tx.auditLog.create({
          data: {
            schoolId: school.id, userId, action: "CREATE", entityType: "AssessmentMarkCorrection", entityId: created.id,
            newValues: { cells: changes.length, reason: input.reason, lock, applyNow: input.applyNow },
          },
        });
        return { id: created.id, cells: changes.length, lock: lock ? LOCK_MESSAGES[lock] : null };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A correction for this sheet is already waiting for review. Ask an approver to decide it first.");
      }
      throw error;
    }
    if (!input.applyNow) return { ...outcome, applied: false, publishedReports: [] as { id: string; name: string }[] };

    // The same writer and audit trail as an approved request, so totals, grades and positions
    // stay right and the old and new marks are kept. Only the second-person step is skipped.
    try {
      const decided = await this.review(school, userId, role, outcome.id, { decision: "APPROVE", reason: input.reason }, { allowSelf: true });
      return { ...outcome, applied: true, publishedReports: decided.publishedReports };
    } catch (error) {
      // Nothing was applied, so do not leave a request hanging for someone else to approve.
      await db.assessmentMarkCorrection.updateMany({
        where: { id: outcome.id, schoolId: school.id, status: "PENDING" },
        data: { status: "CANCELLED", reviewedById: userId, reviewedAt: new Date() },
      });
      throw error;
    }
  }

  /** Managers see every request; a teacher sees only their own. */
  async list(schoolId: string, userId: string, role: string | undefined, query: { status?: string; classId?: string }) {
    const db = this.prisma.client;
    const status = (query.status ?? "PENDING").toUpperCase();
    const rows = await db.assessmentMarkCorrection.findMany({
      where: {
        schoolId,
        ...(isSchoolManager(role) ? {} : { requestedById: userId }),
        ...((STATUSES as readonly string[]).includes(status) ? { status: status as Status } : {}),
        ...(query.classId ? { classId: query.classId } : {}),
      },
      orderBy: { requestedAt: "desc" },
      take: PAGE,
      include: { items: true, template: { select: { name: true } } },
    });
    if (rows.length === 0) return [];

    const uniq = <T>(values: T[]) => [...new Set(values)];
    const [students, components, classes, subjects, people] = await Promise.all([
      db.student.findMany({
        where: { schoolId, id: { in: uniq(rows.flatMap((row) => row.items.map((item) => item.studentId))) } },
        select: { id: true, admissionNumber: true, profile: { select: { firstName: true, lastName: true } } },
      }),
      db.assessmentComponent.findMany({
        where: { id: { in: uniq(rows.flatMap((row) => row.items.map((item) => item.componentId))) } },
        select: { id: true, name: true, maxMarks: true },
      }),
      db.class.findMany({ where: { schoolId, id: { in: uniq(rows.map((row) => row.classId)) } }, select: { id: true, name: true } }),
      db.subject.findMany({ where: { schoolId, id: { in: uniq(rows.map((row) => row.subjectId)) } }, select: { id: true, name: true } }),
      db.userProfile.findMany({
        where: { userId: { in: uniq(rows.flatMap((row) => [row.requestedById, row.reviewedById].filter((id): id is string => !!id))) } },
        select: { userId: true, firstName: true, lastName: true },
      }),
    ]);
    const studentById = new Map(students.map((row) => [row.id, row]));
    const componentById = new Map(components.map((row) => [row.id, row]));
    const className = new Map(classes.map((row) => [row.id, row.name]));
    const subjectName = new Map(subjects.map((row) => [row.id, row.name]));
    const personName = new Map(people.map((row) => [row.userId, `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || "Staff member"]));

    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      reason: row.reason,
      requestedAt: row.requestedAt,
      requester: { id: row.requestedById, name: personName.get(row.requestedById) ?? "Staff member" },
      reviewedAt: row.reviewedAt,
      reviewedBy: row.reviewedById ? (personName.get(row.reviewedById) ?? "Staff member") : null,
      reviewReason: row.reviewReason,
      templateName: row.template.name,
      classId: row.classId,
      className: className.get(row.classId) ?? "Class",
      subjectName: subjectName.get(row.subjectId) ?? "Subject",
      items: row.items.map((item) => {
        const student = studentById.get(item.studentId);
        const component = componentById.get(item.componentId);
        return {
          studentName: student ? `${student.profile.firstName} ${student.profile.lastName}`.trim() : "Pupil",
          admissionNumber: student?.admissionNumber ?? null,
          componentName: component?.name ?? "Component",
          occurrenceIndex: item.occurrenceIndex,
          maxMarks: component ? Number(component.maxMarks) : null,
          previousMarks: item.previousMarks === null ? null : Number(item.previousMarks),
          requestedMarks: item.requestedMarks === null ? null : Number(item.requestedMarks),
        };
      }),
    }));
  }

  async review(school: School, reviewerId: string, role: string | undefined, id: string, input: ReviewMarkCorrectionInput, options: { allowSelf?: boolean } = {}) {
    const db = this.prisma.client;
    const correction = await db.assessmentMarkCorrection.findFirst({ where: { id, schoolId: school.id }, include: { items: true } });
    if (!correction) throw new NotFoundException("Correction request not found.");
    if (correction.status !== "PENDING") throw new ConflictException("This request has already been decided.");
    const problem = approvalProblem({ role, reviewerId, requesterId: correction.requestedById, allowSelf: options.allowSelf });
    if (problem) throw new ForbiddenException(problem);

    const rejecting = input.decision === "REJECT";
    if (rejecting) {
      const bad = reasonProblem(input.reason ?? "");
      if (bad) throw new BadRequestException(`Say why the request is rejected. ${bad}`);
    }

    // Read what the writer needs before the transaction so it holds a connection for less time.
    let applyInput: Parameters<typeof applyMarkChanges>[1] | null = null;
    if (!rejecting) {
      const ctx = await this.entry.loadContext(school.id, reviewerId, role, correction.classId, correction.subjectId);
      if (ctx.term.id !== correction.termId) throw new BadRequestException("This request belongs to a previous term and can no longer be applied.");
      const template = ctx.templates.find((item) => item.id === correction.templateId);
      if (!template) throw new BadRequestException("The assessment no longer applies to this class and subject.");
      const roster = await this.entry.loadRoster(ctx.klass.id, ctx.term.id);
      applyInput = {
        schoolId: school.id,
        userId: reviewerId,
        termId: ctx.term.id,
        classId: ctx.klass.id,
        subjectId: ctx.subject.id,
        template,
        roster: roster.map((student) => student.id),
        changes: correction.items.map((item) => ({
          studentId: item.studentId,
          componentId: item.componentId,
          occurrenceIndex: item.occurrenceIndex,
          marks: item.requestedMarks === null ? null : Number(item.requestedMarks),
          expectedMarks: item.previousMarks === null ? null : Number(item.previousMarks),
        })),
        allowLockedScores: true,
        source: { kind: "CORRECTION", correctionId: correction.id },
      };
    }

    await db.$transaction(
      async (tx) => {
        // Claim the request first: a double click or a second approver finds it already decided.
        const claimed = await tx.assessmentMarkCorrection.updateMany({
          where: { id: correction.id, schoolId: school.id, status: "PENDING" },
          data: { status: rejecting ? "REJECTED" : "APPROVED", reviewedById: reviewerId, reviewedAt: new Date(), reviewReason: input.reason?.trim() || null },
        });
        if (claimed.count === 0) throw new ConflictException("This request has already been decided.");
        if (applyInput) {
          try {
            await applyMarkChanges(tx, applyInput);
          } catch (error) {
            if (error instanceof ConflictException) {
              throw new ConflictException("The marks changed after this request was made. Reject it and ask for a new one based on the current marks.");
            }
            throw error;
          }
        }
        await tx.auditLog.create({
          data: {
            schoolId: school.id, userId: reviewerId, action: "UPDATE", entityType: "AssessmentMarkCorrection", entityId: correction.id,
            newValues: { decision: input.decision, reason: input.reason ?? null, cells: correction.items.length },
          },
        });
        await tx.notification.create({
          data: {
            schoolId: school.id, userId: correction.requestedById, type: "GENERAL",
            title: rejecting ? "Marks correction rejected" : "Marks correction approved",
            message: rejecting
              ? `Your correction was rejected: ${input.reason?.trim()}`
              : "Your correction was approved and the marks have been updated.",
            link: "/assessments",
          },
        });
      },
      { timeout: 30_000 },
    );

    // Published report cards keep a snapshot of the old marks, so the approver should know to regenerate them.
    const publishedReports = rejecting
      ? []
      : await db.reportCardSet.findMany({
          where: {
            schoolId: school.id,
            termId: correction.termId,
            status: "PUBLISHED",
            OR: [{ classId: correction.classId }, { targetClasses: { some: { classId: correction.classId } } }],
          },
          select: { id: true, name: true },
        });
    return { status: rejecting ? "REJECTED" : "APPROVED", publishedReports };
  }

  /** The requester withdraws a request that has not been decided. */
  async cancel(schoolId: string, userId: string, role: string | undefined, id: string) {
    const result = await this.prisma.client.assessmentMarkCorrection.updateMany({
      where: { id, schoolId, status: "PENDING", ...(isSchoolManager(role) ? {} : { requestedById: userId }) },
      data: { status: "CANCELLED", reviewedById: userId, reviewedAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException("No pending request of yours with that id.");
    return { status: "CANCELLED" };
  }
}
