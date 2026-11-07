import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { SaveAssessmentEntryInput, SubmitAssessmentEntryInput } from "@schoolhub/shared";
import { PrismaService } from "../../prisma/prisma.service.js";
import { canEnterComponentMarks, canViewMarks, isSchoolManager } from "../../common/scope/teacher-access.js";
import {
  TeacherScopeService,
  type TeacherAssignments,
} from "../../common/scope/teacher-scope.service.js";
import {
  classRankGrades,
  computeStudentResult,
  rankByPercentage,
  templateSpecificity,
  validateMarks,
  type EntryComponent,
  type RankBand,
} from "./assessment-entry.js";
import { applyMarkChanges } from "./assessment-marks-writer.js";
import {
  LOCK_MESSAGES,
  classStats,
  cleanExcused,
  correctionAllowed,
  effectiveDeadline,
  sheetLock,
  submissionBlockers,
} from "./assessment-workflow.js";

const NO_ASSIGNMENTS: TeacherAssignments = { teacherId: null, classTeacherClassIds: [], subjectAssignments: [], subjectStrandAssignments: [] };

const categoryRank = (category: "TERMLY" | "MOCK") => (category === "TERMLY" ? 0 : 1);

/** Entering and reading a class's marks for one subject, with the access rules applied. */
@Injectable()
export class AssessmentEntryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teacherScope: TeacherScopeService,
  ) {}

  /** Everything the marks screen needs: roster, applicable assessments, marks so far and totals. */
  async getSheet(
    schoolId: string,
    userId: string,
    role: string | undefined,
    query: { classId: string; subjectId: string; templateId?: string },
  ) {
    const ctx = await this.loadContext(schoolId, userId, role, query.classId, query.subjectId);
    if (!canViewMarks(role, ctx.assignments, query.classId, query.subjectId)) {
      throw new ForbiddenException("You do not teach this subject in this class.");
    }
    const templates = ctx.templates;
    const selected = templates.find((template) => template.id === query.templateId) ?? templates[0] ?? null;

    const base = {
      class: ctx.klass,
      subject: ctx.subject,
      term: { id: ctx.term.id, name: ctx.term.name },
      templates: templates.map((template) => ({ id: template.id, name: template.name, category: template.category })),
    };
    if (!selected) {
      return {
        ...base,
        template: null,
        students: [],
        canEdit: false,
        readOnlyReason: "No assessment applies to this class and subject yet. Ask an administrator to set one up.",
      };
    }

    const sheetWhere = { subjectId: ctx.subject.id, termId: ctx.term.id, templateId: selected.id };
    const [roster, scores, pending] = await Promise.all([
      this.loadRoster(ctx.klass.id, ctx.term.id),
      this.prisma.client.assessmentScore.findMany({
        where: sheetWhere,
        select: {
          studentId: true,
          componentScores: { select: { componentId: true, occurrenceIndex: true, marksObtained: true } },
        },
      }),
      this.prisma.client.assessmentMarkCorrection.findFirst({
        where: { schoolId, classId: ctx.klass.id, status: "PENDING", ...sheetWhere },
        select: { id: true, requestedAt: true, requestedById: true },
      }),
    ]);
    const byStudent = new Map(scores.map((row) => [row.studentId, row]));
    const submission = selected.submission;
    const excused = new Set(submission?.excusedStudentIds ?? []);

    const students = roster.map((student) => {
      const cells = (byStudent.get(student.id)?.componentScores ?? []).map((cell) => ({
        componentId: cell.componentId,
        occurrenceIndex: cell.occurrenceIndex,
        marks: Number(cell.marksObtained),
      }));
      const result = computeStudentResult(selected.components, cells, selected.bands, selected.method);
      return {
        studentId: student.id,
        admissionNumber: student.admissionNumber,
        name: student.name,
        marks: cells,
        totalScore: result.totalScore,
        percentage: result.percentage,
        grade: result.grade,
        complete: result.complete,
        excused: excused.has(student.id),
        position: null as number | null,
      };
    });
    const ranks = rankByPercentage(
      students.map((student) => ({ id: student.studentId, percentage: student.complete ? student.percentage : null })),
    );
    for (const student of students) student.position = ranks.get(student.studentId) ?? null;
    if (selected.method === "CLASS_RANK") {
      // Graded against classmates: only pupils with a complete result count towards the class.
      const graded = classRankGrades(
        students.filter((student) => student.complete).map((student) => ({ id: student.studentId, percentage: student.percentage })),
        selected.bands,
      );
      for (const student of students) student.grade = graded.get(student.studentId)?.grade ?? null;
    }

    const canEnterAnyComponent = selected.components.some((component) =>
      canEnterComponentMarks(role, ctx.assignments, query.classId, query.subjectId, component.subjectStrandId),
    );
    const deadline = effectiveDeadline(selected.deadline, selected.extensions, ctx.assignments.teacherId);
    const lock = sheetLock({
      templateLocked: selected.isLocked,
      submitted: submission !== null,
      deadline,
      now: new Date(),
      canEnterAnyComponent,
    });

    return {
      ...base,
      template: {
        id: selected.id,
        name: selected.name,
        deadline,
        components: selected.components.map((component) => ({
          id: component.id,
          name: component.name,
          maxMarks: component.maxMarks,
          weight: component.weight,
          isRequired: component.isRequired,
          slots: component.isRepeatable ? Math.max(component.expectedCount, 1) : 1,
          subjectStrandId: component.subjectStrandId ?? null,
          subjectStrandName: component.subjectStrandName ?? null,
          canEdit: lock === null && canEnterComponentMarks(
            role, ctx.assignments, query.classId, query.subjectId, component.subjectStrandId,
          ),
          canCorrect: canEnterComponentMarks(role, ctx.assignments, query.classId, query.subjectId, component.subjectStrandId),
        })),
        grades: selected.bands,
        gradingMethod: selected.method,
      },
      students,
      stats: classStats(students.filter((student) => student.complete).map((student) => student.percentage)),
      canEdit: lock === null,
      readOnlyReason: lock ? LOCK_MESSAGES[lock] : null,
      lock,
      submission: submission
        ? { submittedAt: submission.submittedAt, note: submission.note, excusedCount: excused.size }
        : null,
      canSubmit: lock === null && canEnterAnyComponent,
      canRequestCorrection: correctionAllowed(lock) && canEnterAnyComponent && !pending,
      pendingCorrection: pending ? { id: pending.id, requestedAt: pending.requestedAt } : null,
    };
  }

  /** Saves a batch of marks, recomputes totals, grades and class positions, and returns the fresh sheet. */
  async saveEntries(
    schoolId: string,
    userId: string,
    role: string | undefined,
    input: SaveAssessmentEntryInput,
  ) {
    await this.persistEntries(schoolId, userId, role, input);
    return this.getSheet(schoolId, userId, role, {
      classId: input.classId,
      subjectId: input.subjectId,
      templateId: input.templateId,
    });
  }

  /**
   * The one write path for typed and uploaded marks: access, lock, roster and range
   * checks, then a single transaction that stores the marks and rebuilds the
   * class's results. `via` is recorded in the audit trail.
   */
  async persistEntries(
    schoolId: string,
    userId: string,
    role: string | undefined,
    input: SaveAssessmentEntryInput,
    via: "ENTRY" | "IMPORT" = "ENTRY",
  ) {
    const ctx = await this.loadContext(schoolId, userId, role, input.classId, input.subjectId);
    if (input.termId && input.termId !== ctx.term.id) throw new ConflictException("The academic term changed. Your draft was preserved; return to its original term before saving.");
    const template = ctx.templates.find((item) => item.id === input.templateId);
    if (!template) throw new BadRequestException("That assessment does not apply to this class and subject.");
    this.assertEditable(template, ctx.assignments.teacherId);

    const roster = await this.loadRoster(ctx.klass.id, ctx.term.id);
    const rosterIds = new Set(roster.map((student) => student.id));
    if (input.entries.some((entry) => !rosterIds.has(entry.studentId))) {
      throw new BadRequestException("Marks can only be entered for pupils enrolled in this class this term.");
    }
    const problems = validateMarks(input.entries, template.components);
    if (problems.length) {
      throw new BadRequestException(problems.slice(0, 3).map((problem) => problem.message).join(" "));
    }
    const componentById = new Map(template.components.map((component) => [component.id, component]));
    const unauthorized = input.entries.find((entry) => {
      const component = componentById.get(entry.componentId);
      return !component || !canEnterComponentMarks(
        role, ctx.assignments, input.classId, input.subjectId, component.subjectStrandId,
      );
    });
    if (unauthorized) {
      throw new ForbiddenException("You can only enter marks for the teaching areas assigned to you in this class.");
    }

    await this.prisma.client.$transaction(
      (tx) =>
        applyMarkChanges(tx, {
          schoolId,
          userId,
          termId: ctx.term.id,
          classId: ctx.klass.id,
          subjectId: ctx.subject.id,
          template,
          roster: roster.map((student) => student.id),
          changes: input.entries,
          allowLockedScores: isSchoolManager(role),
          source: { kind: via },
        }),
      { timeout: 30_000 },
    );
  }

  /**
   * A teacher (or manager) signs the sheet off. Every pupil must have a complete
   * result or be excused (absent, exempt). Signing off freezes direct editing;
   * later changes need a reviewed correction.
   */
  async submit(schoolId: string, userId: string, role: string | undefined, input: SubmitAssessmentEntryInput) {
    const ctx = await this.loadContext(schoolId, userId, role, input.classId, input.subjectId);
    const template = ctx.templates.find((item) => item.id === input.templateId);
    if (!template) throw new BadRequestException("That assessment does not apply to this class and subject.");
    const canEnter = template.components.some((component) =>
      canEnterComponentMarks(role, ctx.assignments, input.classId, input.subjectId, component.subjectStrandId),
    );
    if (!canEnter) throw new ForbiddenException("Only a teacher assigned to this subject can submit these marks.");
    this.assertEditable(template, ctx.assignments.teacherId);

    const roster = await this.loadRoster(ctx.klass.id, ctx.term.id);
    const rosterIds = roster.map((student) => student.id);
    const scores = await this.prisma.client.assessmentScore.findMany({
      where: { subjectId: ctx.subject.id, termId: ctx.term.id, templateId: template.id, studentId: { in: rosterIds } },
      select: { studentId: true, componentScores: { select: { componentId: true, occurrenceIndex: true, marksObtained: true } } },
    });
    const progress = new Map(
      scores.map((row) => {
        const result = computeStudentResult(
          template.components,
          row.componentScores.map((cell) => ({ componentId: cell.componentId, occurrenceIndex: cell.occurrenceIndex, marks: Number(cell.marksObtained) })),
          template.bands,
          template.method,
        );
        return [row.studentId, { complete: result.complete, hasMarks: row.componentScores.length > 0 }] as const;
      }),
    );
    const excused = cleanExcused(input.excusedStudentIds, rosterIds);
    const blockers = submissionBlockers(rosterIds, progress, new Set(excused));
    if (blockers.length) {
      throw new BadRequestException(
        `${blockers.length} pupil${blockers.length === 1 ? " is" : "s are"} not finished. Enter their marks or mark them as excused before submitting.`,
      );
    }

    try {
      await this.prisma.client.$transaction(async (tx) => {
        await tx.assessmentEntrySubmission.create({
          data: {
            schoolId,
            templateId: template.id,
            classId: ctx.klass.id,
            subjectId: ctx.subject.id,
            termId: ctx.term.id,
            submittedById: userId,
            note: input.note ?? null,
            excusedStudentIds: excused,
          },
        });
        await tx.assessmentScore.updateMany({
          where: { subjectId: ctx.subject.id, termId: ctx.term.id, templateId: template.id, studentId: { in: rosterIds } },
          data: { status: "SUBMITTED" },
        });
        await tx.auditLog.create({
          data: {
            schoolId,
            userId,
            action: "UPDATE",
            entityType: "AssessmentSubmission",
            entityId: `${template.id}:${ctx.klass.id}:${ctx.subject.id}:${ctx.term.id}`,
            newValues: { submitted: true, excusedStudentIds: excused },
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("These marks have already been submitted.");
      }
      throw error;
    }
    return this.getSheet(schoolId, userId, role, { classId: input.classId, subjectId: input.subjectId, templateId: template.id });
  }

  /** Throws the reason a sheet can't be edited directly (locked, submitted or past its deadline). */
  assertEditable(
    template: { isLocked: boolean; deadline: Date | null; extensions: { teacherId: string | null; deadline: Date }[]; submission: unknown },
    teacherId: string | null,
  ) {
    const lock = sheetLock({
      templateLocked: template.isLocked,
      submitted: template.submission !== null,
      deadline: effectiveDeadline(template.deadline, template.extensions, teacherId),
      now: new Date(),
      canEnterAnyComponent: true,
    });
    if (lock) throw new ForbiddenException(LOCK_MESSAGES[lock]);
  }

  // ---------------------------------------------------------------- helpers

  async loadContext(
    schoolId: string,
    userId: string,
    role: string | undefined,
    classId: string,
    subjectId: string,
  ) {
    const db = this.prisma.client;
    const term = await db.term.findFirst({
      where: { isCurrent: true, academicYear: { schoolId, isCurrent: true } },
      select: { id: true, name: true, termNumber: true, academicYearId: true },
    });
    if (!term) throw new BadRequestException("No academic term is currently selected for this school.");

    const [klass, subject, link, assignments] = await Promise.all([
      db.class.findFirst({
        where: { id: classId, schoolId, deletedAt: null },
        select: { id: true, name: true, level: true, departmentId: true },
      }),
      db.subject.findFirst({ where: { id: subjectId, schoolId }, select: { id: true, name: true, code: true } }),
      db.classSubject.findFirst({ where: { classId, subjectId }, select: { id: true } }),
      role === "teacher" ? this.teacherScope.getAssignments(schoolId, userId) : Promise.resolve(NO_ASSIGNMENTS),
    ]);
    if (!klass) throw new NotFoundException("Class not found.");
    if (!subject) throw new NotFoundException("Subject not found.");
    if (!link) throw new BadRequestException(`${klass.name} does not take ${subject.name}.`);

    const [rows, extensionRows, submissionRows] = await Promise.all([
      db.assessmentTemplate.findMany({
      // A mock belongs to one academic year, so only this year's mocks are open for entry.
      where: { schoolId, isActive: true, OR: [{ academicYearId: null }, { academicYearId: term.academicYearId }] },
      include: {
        classes: { select: { classId: true } },
        components: {
          orderBy: { displayOrder: "asc" },
          include: { subjectStrand: { select: { id: true, name: true, subjectId: true } } },
        },
        gradingSystem: { include: { gradeScales: { orderBy: { displayOrder: "asc" } } } },
      },
      }),
      db.assessmentExtension.findMany({ where: { classId, template: { schoolId } }, select: { templateId: true, teacherId: true, deadline: true } }),
      db.assessmentEntrySubmission.findMany({
        where: { schoolId, classId, subjectId, termId: term.id },
        select: { templateId: true, submittedAt: true, note: true, excusedStudentIds: true },
      }),
    ]);
    const submissionByTemplate = new Map(submissionRows.map((row) => [row.templateId, row]));
    const templates = rows
      .map((row) => ({
        row,
        score: templateSpecificity(
          {
            isActive: row.isActive,
            termNumber: row.termNumber,
            subjectCode: row.subjectCode,
            classId: row.classId,
            classIds: row.classes.map((item) => item.classId),
            classLevel: row.classLevel,
            departmentId: row.departmentId,
          },
          klass,
          subject.code,
          term.termNumber,
        ),
      }))
      .filter((item): item is { row: (typeof rows)[number]; score: number } => item.score !== null)
      .filter(({ row }) => row.components.every((component) =>
        !component.subjectStrand || component.subjectStrand.subjectId === subjectId,
      ))
      // Termly assessments always come first so a mock never becomes the default sheet.
      .sort((a, b) => categoryRank(a.row.category) - categoryRank(b.row.category) || (a.row.category === "MOCK" ? (a.row.sequence ?? 0) - (b.row.sequence ?? 0) : b.score - a.score) || a.row.name.localeCompare(b.row.name))
      .map(({ row }) => ({
        id: row.id,
        name: row.name,
        category: row.category,
        isLocked: row.isLocked,
        deadline: row.deadline,
        extensions: extensionRows.filter((item) => item.templateId === row.id).map((item) => ({ teacherId: item.teacherId, deadline: item.deadline })),
        submission: submissionByTemplate.get(row.id) ?? null,
        method: row.gradingSystem.method,
        components: row.components.map(
          (component): EntryComponent & { name: string } => ({
            id: component.id,
            name: component.name,
            maxMarks: Number(component.maxMarks),
            weight: Number(component.weight),
            isRequired: component.isRequired,
            isRepeatable: component.isRepeatable,
            expectedCount: component.expectedCount,
            subjectStrandId: component.subjectStrandId,
            subjectStrandName: component.subjectStrand?.name ?? null,
          }),
        ),
        bands: row.gradingSystem.gradeScales.map(
          (scale): RankBand & { description: string } => ({
            grade: scale.grade,
            description: scale.description,
            minScore: Number(scale.minScore),
            maxScore: Number(scale.maxScore),
            gradePoint: Number(scale.gradePoint),
          }),
        ),
      }));

    return { term, klass, subject, assignments, templates };
  }

  async loadRoster(classId: string, termId: string) {
    const enrollments = await this.prisma.client.enrollment.findMany({
      where: { classId, termId, status: "ACTIVE", student: { deletedAt: null } },
      select: {
        student: {
          select: { id: true, admissionNumber: true, profile: { select: { firstName: true, otherNames: true, lastName: true } } },
        },
      },
    });
    return enrollments
      .map(({ student }) => ({
        id: student.id,
        admissionNumber: student.admissionNumber,
        name: [student.profile.firstName, student.profile.otherNames, student.profile.lastName].filter(Boolean).join(" "),
        sort: `${student.profile.lastName} ${student.profile.firstName}`.toLowerCase(),
      }))
      .sort((a, b) => a.sort.localeCompare(b.sort));
  }
}
