import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { gradeBoundaryProblems, type SaveGradeBoundariesInput } from "@schoolhub/shared";
import { PrismaService } from "../../prisma/prisma.service.js";
import { rankedGrades, type GradeBoundaries, type RankBand } from "./assessment-entry.js";

type Db = Prisma.TransactionClient;

interface Target {
  template: { id: string; name: string };
  subject: { id: string; name: string };
  term: { id: string; name: string };
  /** Best grade first. */
  bands: (RankBand & { description: string })[];
}

/**
 * Mark boundaries for class-ranked (stanine) assessments.
 *
 * WAEC publishes no fixed BECE boundaries: for each subject, each year, the cut-off marks are
 * set after marking so grades follow the stanine shares. A school mirrors that by setting the
 * minimum mark for each grade per assessment, subject and term. Once set, every pupil in the
 * cohort is graded by the mark alone. Clearing them returns to grading by position in the class.
 */
@Injectable()
export class AssessmentBoundariesService {
  constructor(private readonly prisma: PrismaService) {}

  /** The scale, the saved boundaries and the cohort's marks, so the screen can suggest and preview cut-offs. */
  async get(schoolId: string, templateId: string, subjectId: string, termId: string) {
    const target = await this.resolve(this.prisma.client, schoolId, templateId, subjectId, termId);
    return this.describe(this.prisma.client, target);
  }

  async save(schoolId: string, userId: string, templateId: string, input: SaveGradeBoundariesInput) {
    const target = await this.resolve(this.prisma.client, schoolId, templateId, input.subjectId, input.termId);
    const problems = gradeBoundaryProblems(target.bands.map((band) => band.grade), input.boundaries);
    if (problems.length) throw new BadRequestException(problems.join(" "));

    const minimums: Record<string, number> = Object.fromEntries(input.boundaries.map((item) => [item.grade, item.minScore]));
    const regraded = await this.prisma.client.$transaction(async (tx) => {
      const where = { templateId, subjectId: input.subjectId, termId: input.termId };
      await tx.assessmentGradeBoundary.deleteMany({ where });
      await tx.assessmentGradeBoundary.createMany({
        data: input.boundaries.map((item) => ({
          schoolId,
          ...where,
          grade: item.grade,
          minScore: new Prisma.Decimal(item.minScore),
          createdById: userId,
        })),
      });
      const changed = await this.regrade(tx, target, minimums);
      await tx.auditLog.create({
        data: {
          userId,
          schoolId,
          action: "UPDATE",
          entityType: "GRADE_BOUNDARIES",
          entityId: templateId,
          newValues: { subjectId: input.subjectId, termId: input.termId, boundaries: minimums, regraded: changed },
        },
      });
      return changed;
    });
    return { ...(await this.describe(this.prisma.client, target)), regraded };
  }

  /** Goes back to grading by position in the class. */
  async clear(schoolId: string, userId: string, templateId: string, subjectId: string, termId: string) {
    const target = await this.resolve(this.prisma.client, schoolId, templateId, subjectId, termId);
    const regraded = await this.prisma.client.$transaction(async (tx) => {
      await tx.assessmentGradeBoundary.deleteMany({ where: { templateId, subjectId, termId } });
      const changed = await this.regrade(tx, target, null);
      await tx.auditLog.create({
        data: { userId, schoolId, action: "DELETE", entityType: "GRADE_BOUNDARIES", entityId: templateId, newValues: { subjectId, termId, regraded: changed } },
      });
      return changed;
    });
    return { ...(await this.describe(this.prisma.client, target)), regraded };
  }

  // ---------------------------------------------------------------- helpers

  private async resolve(db: Db | PrismaService["client"], schoolId: string, templateId: string, subjectId: string, termId: string): Promise<Target> {
    const [template, subject, term] = await Promise.all([
      db.assessmentTemplate.findFirst({
        where: { id: templateId, schoolId },
        select: {
          id: true,
          name: true,
          subjectCode: true,
          gradingSystem: { select: { method: true, gradeScales: { orderBy: { displayOrder: "asc" } } } },
        },
      }),
      db.subject.findFirst({ where: { id: subjectId, schoolId }, select: { id: true, name: true, code: true } }),
      db.term.findFirst({ where: { id: termId, academicYear: { schoolId } }, select: { id: true, name: true } }),
    ]);
    if (!template) throw new NotFoundException("Assessment not found.");
    if (!subject) throw new NotFoundException("Subject not found.");
    if (!term) throw new NotFoundException("Term not found.");
    if (template.gradingSystem.method !== "CLASS_RANK") {
      throw new BadRequestException("Mark boundaries only apply to class-ranked (stanine) grading scales.");
    }
    if (template.subjectCode && template.subjectCode.toLowerCase() !== subject.code.toLowerCase()) {
      throw new BadRequestException(`${template.name} is only for ${template.subjectCode}, not ${subject.name}.`);
    }
    return {
      template: { id: template.id, name: template.name },
      subject: { id: subject.id, name: subject.name },
      term,
      bands: template.gradingSystem.gradeScales.map((scale) => ({
        grade: scale.grade,
        description: scale.description,
        minScore: Number(scale.minScore),
        maxScore: Number(scale.maxScore),
        gradePoint: Number(scale.gradePoint),
      })),
    };
  }

  private async describe(db: Db | PrismaService["client"], target: Target) {
    const where = { templateId: target.template.id, subjectId: target.subject.id, termId: target.term.id };
    const [saved, scores] = await Promise.all([
      db.assessmentGradeBoundary.findMany({ where, select: { grade: true, minScore: true } }),
      // Only finished results are graded (class-ranked grades are empty until every required mark is in).
      db.assessmentScore.findMany({ where: { ...where, grade: { not: null } }, select: { percentage: true } }),
    ]);
    const byGrade = new Map(saved.map((row) => [row.grade, Number(row.minScore)]));
    return {
      template: target.template,
      subject: target.subject,
      term: target.term,
      bands: target.bands.map((band) => ({
        grade: band.grade,
        description: band.description,
        share: Math.round((band.maxScore - band.minScore) * 100) / 100,
        cumulativeShare: band.maxScore,
      })),
      boundaries: saved.length
        ? target.bands.slice(0, -1).flatMap((band) => (byGrade.has(band.grade) ? [{ grade: band.grade, minScore: byGrade.get(band.grade)! }] : []))
        : null,
      percentages: scores.map((row) => Number(row.percentage)),
    };
  }

  /**
   * Re-grades every finished result of this assessment, subject and term. Only the grade
   * changes; marks, totals and positions are untouched. With no boundaries each class is ranked
   * on its own again, like the marks writer does. Returns how many pupils' grades changed.
   * (A marks save racing this one reads the old boundaries; the next save of that class corrects it.)
   */
  private async regrade(tx: Db, target: Target, boundaries: GradeBoundaries | null): Promise<number> {
    const rows = await tx.assessmentScore.findMany({
      where: { templateId: target.template.id, subjectId: target.subject.id, termId: target.term.id, grade: { not: null } },
      select: { id: true, studentId: true, percentage: true, grade: true, gradePoint: true },
    });
    if (rows.length === 0) return 0;

    // Fixed boundaries grade the whole cohort together; otherwise each class is its own group.
    const groups = new Map<string, typeof rows>();
    if (boundaries) {
      groups.set("all", rows);
    } else {
      const enrolments = await tx.enrollment.findMany({
        where: { termId: target.term.id, status: "ACTIVE", studentId: { in: rows.map((row) => row.studentId) } },
        select: { studentId: true, classId: true },
      });
      const classOf = new Map(enrolments.map((item) => [item.studentId, item.classId]));
      for (const row of rows) {
        const classId = classOf.get(row.studentId);
        if (!classId) continue; // no longer on a register: leave the grade as it was
        groups.set(classId, [...(groups.get(classId) ?? []), row]);
      }
    }

    const writes: Promise<unknown>[] = [];
    for (const group of groups.values()) {
      const graded = rankedGrades(group.map((row) => ({ id: row.id, percentage: Number(row.percentage) })), target.bands, boundaries);
      for (const row of group) {
        const next = graded.get(row.id);
        if (!next) continue;
        if (row.grade === next.grade && Number(row.gradePoint) === next.gradePoint) continue;
        writes.push(
          tx.assessmentScore.update({
            where: { id: row.id },
            data: { grade: next.grade, gradePoint: new Prisma.Decimal(next.gradePoint) },
          }),
        );
      }
    }
    await Promise.all(writes);
    return writes.length;
  }
}
