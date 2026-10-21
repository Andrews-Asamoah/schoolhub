import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { SaveAssessmentEntryInput } from "@schoolhub/shared";
import { PrismaService } from "../../prisma/prisma.service.js";
import { canEnterMarks, canViewMarks, isSchoolManager } from "../../common/scope/teacher-access.js";
import {
  TeacherScopeService,
  type TeacherAssignments,
} from "../../common/scope/teacher-scope.service.js";
import {
  computeStudentResult,
  rankByPercentage,
  templateSpecificity,
  validateMarks,
  type EntryComponent,
  type GradeBand,
} from "./assessment-entry.js";

const NO_ASSIGNMENTS: TeacherAssignments = { teacherId: null, classTeacherClassIds: [], subjectAssignments: [] };
const round2 = (value: number) => Math.round(value * 100) / 100;

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
    const canEditRole = canEnterMarks(role, ctx.assignments, query.classId, query.subjectId);

    const templates = ctx.templates;
    const selected = templates.find((template) => template.id === query.templateId) ?? templates[0] ?? null;

    const base = {
      class: ctx.klass,
      subject: ctx.subject,
      term: { id: ctx.term.id, name: ctx.term.name },
      templates: templates.map((template) => ({ id: template.id, name: template.name })),
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

    const [roster, scores] = await Promise.all([
      this.loadRoster(ctx.klass.id, ctx.term.id),
      this.prisma.client.assessmentScore.findMany({
        where: { subjectId: ctx.subject.id, termId: ctx.term.id, templateId: selected.id },
        select: {
          id: true,
          studentId: true,
          isLocked: true,
          componentScores: { select: { componentId: true, occurrenceIndex: true, marksObtained: true } },
        },
      }),
    ]);
    const byStudent = new Map(scores.map((row) => [row.studentId, row]));

    const students = roster.map((student) => {
      const row = byStudent.get(student.id);
      const cells = (row?.componentScores ?? []).map((cell) => ({
        componentId: cell.componentId,
        occurrenceIndex: cell.occurrenceIndex,
        marks: Number(cell.marksObtained),
      }));
      const result = computeStudentResult(selected.components, cells, selected.bands);
      return {
        studentId: student.id,
        admissionNumber: student.admissionNumber,
        name: student.name,
        marks: cells,
        totalScore: result.totalScore,
        percentage: result.percentage,
        grade: result.grade,
        complete: result.complete,
        position: null as number | null,
      };
    });
    const ranks = rankByPercentage(
      students.map((student) => ({ id: student.studentId, percentage: student.complete ? student.percentage : null })),
    );
    for (const student of students) student.position = ranks.get(student.studentId) ?? null;

    let readOnlyReason: string | null = null;
    if (!canEditRole) readOnlyReason = "You can view these marks, but only the teacher assigned to this subject can change them.";
    else if (selected.isLocked) readOnlyReason = "This assessment has been locked.";
    else if (selected.deadline && selected.deadline < new Date() && !isSchoolManager(role)) {
      readOnlyReason = "The deadline for this assessment has passed.";
    }

    return {
      ...base,
      template: {
        id: selected.id,
        name: selected.name,
        deadline: selected.deadline,
        components: selected.components.map((component) => ({
          id: component.id,
          name: component.name,
          maxMarks: component.maxMarks,
          weight: component.weight,
          isRequired: component.isRequired,
          slots: component.isRepeatable ? Math.max(component.expectedCount, 1) : 1,
        })),
        grades: selected.bands,
      },
      students,
      canEdit: readOnlyReason === null,
      readOnlyReason,
    };
  }

  /** Saves a batch of marks, recomputes totals, grades and class positions, and returns the fresh sheet. */
  async saveEntries(
    schoolId: string,
    userId: string,
    role: string | undefined,
    input: SaveAssessmentEntryInput,
  ) {
    const ctx = await this.loadContext(schoolId, userId, role, input.classId, input.subjectId);
    if (!canEnterMarks(role, ctx.assignments, input.classId, input.subjectId)) {
      throw new ForbiddenException("Only the teacher assigned to this subject in this class can enter marks.");
    }
    const template = ctx.templates.find((item) => item.id === input.templateId);
    if (!template) throw new BadRequestException("That assessment does not apply to this class and subject.");
    if (template.isLocked) throw new ForbiddenException("This assessment has been locked.");
    if (template.deadline && template.deadline < new Date() && !isSchoolManager(role)) {
      throw new ForbiddenException("The deadline for this assessment has passed.");
    }

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
    const byStudent = new Map<string, SaveAssessmentEntryInput["entries"]>();
    for (const entry of input.entries) byStudent.set(entry.studentId, [...(byStudent.get(entry.studentId) ?? []), entry]);

    await this.prisma.client.$transaction(
      async (tx) => {
        for (const [studentId, entries] of byStudent) {
          let score = await tx.assessmentScore.findUnique({
            where: {
              studentId_subjectId_termId_templateId: {
                studentId,
                subjectId: ctx.subject.id,
                termId: ctx.term.id,
                templateId: template.id,
              },
            },
            select: { id: true, isLocked: true },
          });
          if (score?.isLocked && !isSchoolManager(role)) {
            throw new ForbiddenException("These marks have been locked.");
          }
          if (!score && entries.every((entry) => entry.marks == null)) continue;
          score ??= await tx.assessmentScore.create({
            data: {
              studentId,
              subjectId: ctx.subject.id,
              termId: ctx.term.id,
              templateId: template.id,
              totalScore: new Prisma.Decimal(0),
              percentage: new Prisma.Decimal(0),
            },
            select: { id: true, isLocked: true },
          });

          for (const entry of entries) {
            const component = componentById.get(entry.componentId)!;
            const where = {
              assessmentScoreId_componentId_occurrenceIndex: {
                assessmentScoreId: score.id,
                componentId: entry.componentId,
                occurrenceIndex: entry.occurrenceIndex,
              },
            };
            if (entry.marks == null) {
              await tx.componentScore.deleteMany({
                where: { assessmentScoreId: score.id, componentId: entry.componentId, occurrenceIndex: entry.occurrenceIndex },
              });
              continue;
            }
            const ratio = component.maxMarks > 0 ? entry.marks / component.maxMarks : 0;
            const values = {
              marksObtained: new Prisma.Decimal(entry.marks),
              maxMarks: new Prisma.Decimal(component.maxMarks),
              percentage: new Prisma.Decimal(round2(ratio * 100)),
              weightedScore: new Prisma.Decimal(round2(ratio * component.weight)),
              recordedById: userId,
              recordedAt: new Date(),
            };
            await tx.componentScore.upsert({
              where,
              update: values,
              create: { assessmentScoreId: score.id, componentId: entry.componentId, occurrenceIndex: entry.occurrenceIndex, ...values },
            });
          }
        }

        // Re-total everyone with marks in this class, then rank the complete ones.
        const rows = await tx.assessmentScore.findMany({
          where: {
            subjectId: ctx.subject.id,
            termId: ctx.term.id,
            templateId: template.id,
            studentId: { in: roster.map((student) => student.id) },
          },
          select: {
            id: true,
            studentId: true,
            componentScores: { select: { componentId: true, occurrenceIndex: true, marksObtained: true } },
          },
        });
        const results = new Map<string, ReturnType<typeof computeStudentResult>>();
        for (const row of rows) {
          if (row.componentScores.length === 0) {
            await tx.assessmentScore.delete({ where: { id: row.id } });
            continue;
          }
          results.set(
            row.id,
            computeStudentResult(
              template.components,
              row.componentScores.map((cell) => ({
                componentId: cell.componentId,
                occurrenceIndex: cell.occurrenceIndex,
                marks: Number(cell.marksObtained),
              })),
              template.bands,
            ),
          );
        }
        const ranks = rankByPercentage(
          [...results].map(([id, result]) => ({ id, percentage: result.complete ? result.percentage : null })),
        );
        for (const [id, result] of results) {
          await tx.assessmentScore.update({
            where: { id },
            data: {
              totalScore: new Prisma.Decimal(result.totalScore),
              percentage: new Prisma.Decimal(result.percentage),
              grade: result.grade,
              gradePoint: result.gradePoint == null ? null : new Prisma.Decimal(result.gradePoint),
              position: ranks.get(id) ?? null,
            },
          });
        }
      },
      { timeout: 30_000 },
    );

    return this.getSheet(schoolId, userId, role, {
      classId: input.classId,
      subjectId: input.subjectId,
      templateId: template.id,
    });
  }

  // ---------------------------------------------------------------- helpers

  private async loadContext(
    schoolId: string,
    userId: string,
    role: string | undefined,
    classId: string,
    subjectId: string,
  ) {
    const db = this.prisma.client;
    const term = await db.term.findFirst({
      where: { isCurrent: true, academicYear: { schoolId, isCurrent: true } },
      select: { id: true, name: true, termNumber: true },
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

    const rows = await db.assessmentTemplate.findMany({
      where: { schoolId, isActive: true },
      include: {
        classes: { select: { classId: true } },
        components: { orderBy: { displayOrder: "asc" } },
        gradingSystem: { include: { gradeScales: { orderBy: { displayOrder: "asc" } } } },
      },
    });
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
      .sort((a, b) => b.score - a.score || a.row.name.localeCompare(b.row.name))
      .map(({ row }) => ({
        id: row.id,
        name: row.name,
        isLocked: row.isLocked,
        deadline: row.deadline,
        components: row.components.map(
          (component): EntryComponent & { name: string } => ({
            id: component.id,
            name: component.name,
            maxMarks: Number(component.maxMarks),
            weight: Number(component.weight),
            isRequired: component.isRequired,
            isRepeatable: component.isRepeatable,
            expectedCount: component.expectedCount,
          }),
        ),
        bands: row.gradingSystem.gradeScales.map(
          (scale): GradeBand & { description: string; maxScore: number } => ({
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

  private async loadRoster(classId: string, termId: string) {
    const enrollments = await this.prisma.client.enrollment.findMany({
      where: { classId, termId, status: "ACTIVE", student: { deletedAt: null } },
      select: {
        student: {
          select: { id: true, admissionNumber: true, profile: { select: { firstName: true, lastName: true } } },
        },
      },
    });
    return enrollments
      .map(({ student }) => ({
        id: student.id,
        admissionNumber: student.admissionNumber,
        name: `${student.profile.firstName} ${student.profile.lastName}`.trim(),
        sort: `${student.profile.lastName} ${student.profile.firstName}`.toLowerCase(),
      }))
      .sort((a, b) => a.sort.localeCompare(b.sort));
  }
}
