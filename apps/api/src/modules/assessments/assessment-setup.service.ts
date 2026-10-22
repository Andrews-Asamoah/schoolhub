import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  lockedStructureProblem,
  type SaveAssessmentTemplateInput,
  type SaveGradingSystemInput,
} from "@schoolhub/shared";
import { PrismaService } from "../../prisma/prisma.service.js";
import { classScopeScore, type TemplateScope } from "./assessment-entry.js";
import {
  deadlineFromDate,
  findUncoveredPairs,
  narrowsCoverage,
  nextCopyName,
  slugCode,
} from "./assessment-setup.js";

type Db = Prisma.TransactionClient;

/** Setting up assessments: grading scales and the assessments (templates) teachers enter marks against. */
@Injectable()
export class AssessmentSetupService {
  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------------ read

  /** Everything the setup screen needs in one call. */
  async getSetup(schoolId: string) {
    const db = this.prisma.client;
    const [term, classes, subjects, pairs, templates, gradingSystems] = await Promise.all([
      db.term.findFirst({
        where: { isCurrent: true, academicYear: { schoolId, isCurrent: true } },
        select: { id: true, name: true, termNumber: true },
      }),
      db.class.findMany({
        where: { schoolId, deletedAt: null, isActive: true },
        select: { id: true, name: true, level: true, departmentId: true },
      }),
      db.subject.findMany({ where: { schoolId, isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      db.classSubject.findMany({
        where: { class: { schoolId, deletedAt: null, isActive: true }, subject: { schoolId, isActive: true } },
        select: { classId: true, subjectId: true },
      }),
      db.assessmentTemplate.findMany({
        where: { schoolId },
        orderBy: { createdAt: "desc" },
        include: {
          classes: { select: { classId: true } },
          components: { orderBy: { displayOrder: "asc" } },
          gradingSystem: { select: { id: true, name: true } },
          _count: { select: { assessmentScores: true } },
        },
      }),
      db.gradingSystem.findMany({
        where: { isActive: true, OR: [{ schoolId }, { schoolId: null, isSystemDefault: true }] },
        orderBy: [{ isSystemDefault: "asc" }, { name: "asc" }],
        include: { gradeScales: { orderBy: { displayOrder: "asc" } } },
      }),
    ]);

    const classList = [...classes].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const scopeOf = (row: (typeof templates)[number]): TemplateScope => ({
      isActive: row.isActive,
      termNumber: row.termNumber,
      subjectCode: row.subjectCode,
      classId: row.classId,
      classIds: row.classes.map((item) => item.classId),
      classLevel: row.classLevel,
      departmentId: row.departmentId,
    });

    const withMarks = new Map<string, number>(); // grading system -> assessments with recorded marks
    for (const row of templates) {
      if (row._count.assessmentScores > 0) withMarks.set(row.gradingSystemId, (withMarks.get(row.gradingSystemId) ?? 0) + 1);
    }
    const usage = new Map<string, number>();
    for (const row of templates) usage.set(row.gradingSystemId, (usage.get(row.gradingSystemId) ?? 0) + 1);

    return {
      term,
      classes: classList.map(({ id, name, level }) => ({ id, name, level })),
      subjects,
      templates: templates.map((row) => {
        const scope = scopeOf(row);
        const covered = classList.filter((klass) => classScopeScore(scope, klass) !== null).map((klass) => klass.id);
        return {
          id: row.id,
          name: row.name,
          description: row.description,
          isActive: row.isActive,
          isLocked: row.isLocked,
          deadline: row.deadline,
          termNumber: row.termNumber,
          subjectCode: row.subjectCode,
          gradingSystem: row.gradingSystem,
          allClasses: covered.length === classList.length,
          classIds: covered,
          marksRecorded: row._count.assessmentScores,
          components: row.components.map((component) => ({
            id: component.id,
            name: component.name,
            componentType: component.componentType,
            maxMarks: Number(component.maxMarks),
            weight: Number(component.weight),
            isRequired: component.isRequired,
            isRepeatable: component.isRepeatable,
            expectedCount: component.expectedCount,
          })),
        };
      }),
      gradingSystems: gradingSystems.map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        description: row.description,
        shared: row.schoolId === null,
        usedBy: usage.get(row.id) ?? 0,
        hasMarks: (withMarks.get(row.id) ?? 0) > 0,
        scales: row.gradeScales.map((scale) => ({
          grade: scale.grade,
          description: scale.description,
          minScore: Number(scale.minScore),
          maxScore: Number(scale.maxScore),
          gradePoint: Number(scale.gradePoint),
        })),
      })),
      uncovered: term
        ? findUncoveredPairs(
            pairs,
            new Map(classList.map((klass) => [klass.id, klass])),
            new Map(subjects.map((subject) => [subject.id, subject])),
            templates.map(scopeOf),
            term.termNumber,
          ).slice(0, 200)
        : [],
    };
  }

  // ------------------------------------------------------------- templates

  async createTemplate(schoolId: string, userId: string, input: SaveAssessmentTemplateInput) {
    await this.checkTemplateInput(schoolId, input);
    const id = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.assessmentTemplate.create({
        data: {
          schoolId,
          gradingSystemId: input.gradingSystemId,
          name: input.name,
          description: input.description ?? null,
          subjectCode: input.subjectCode ?? null,
          termNumber: input.termNumber ?? null,
          deadline: deadlineFromDate(input.deadline),
          isActive: input.isActive,
          isLocked: input.isLocked,
          components: {
            create: input.components.map((component, index) => ({
              name: component.name,
              componentType: component.componentType,
              maxMarks: component.maxMarks,
              weight: component.weight,
              displayOrder: index + 1,
              isRequired: component.isRequired,
              isRepeatable: component.isRepeatable,
              expectedCount: component.isRepeatable ? component.expectedCount : 1,
            })),
          },
          classes: { create: input.classIds.map((classId) => ({ classId })) },
        },
        select: { id: true },
      });
      await this.audit(tx, userId, schoolId, "CREATE", "ASSESSMENT_TEMPLATE", created.id, { name: input.name });
      return created.id;
    });
    return { id };
  }

  async updateTemplate(schoolId: string, userId: string, id: string, input: SaveAssessmentTemplateInput) {
    const existing = await this.prisma.client.assessmentTemplate.findFirst({
      where: { id, schoolId },
      include: {
        classes: { select: { classId: true } },
        components: true,
        _count: { select: { assessmentScores: true } },
      },
    });
    if (!existing) throw new NotFoundException("Assessment not found.");
    await this.checkTemplateInput(schoolId, input, id);

    if (existing._count.assessmentScores > 0) {
      if (input.gradingSystemId !== existing.gradingSystemId) {
        throw new ConflictException("Marks have already been recorded, so the grading scale can't change. Duplicate this assessment to use a different scale.");
      }
      const problem = lockedStructureProblem(
        existing.components.map((component) => ({
          id: component.id,
          maxMarks: Number(component.maxMarks),
          weight: Number(component.weight),
          componentType: component.componentType,
          isRequired: component.isRequired,
          isRepeatable: component.isRepeatable,
          expectedCount: component.expectedCount,
        })),
        input.components.map((component) => ({ ...component, expectedCount: component.isRepeatable ? component.expectedCount : 1 })),
      );
      if (problem) throw new ConflictException(problem);

      const allClasses = await this.prisma.client.class.findMany({
        where: { schoolId, deletedAt: null, isActive: true },
        select: { id: true, level: true, departmentId: true },
      });
      const before = allClasses
        .filter((klass) =>
          classScopeScore(
            { classId: existing.classId, classIds: existing.classes.map((item) => item.classId), classLevel: existing.classLevel, departmentId: existing.departmentId },
            { ...klass },
          ) !== null,
        )
        .map((klass) => klass.id);
      const narrowed = narrowsCoverage(
        {
          classIds: before.length === allClasses.length ? null : before,
          subjectCode: existing.subjectCode,
          termNumber: existing.termNumber,
        },
        {
          classIds: input.classIds.length === 0 || input.classIds.length >= allClasses.length ? null : input.classIds,
          subjectCode: input.subjectCode ?? null,
          termNumber: input.termNumber ?? null,
        },
      );
      if (narrowed) {
        throw new ConflictException(`Marks have already been recorded, so you can widen where this assessment applies but not narrow it (${narrowed}).`);
      }
    }

    await this.prisma.client.$transaction(async (tx) => {
      await tx.assessmentTemplate.update({
        where: { id },
        data: {
          gradingSystemId: input.gradingSystemId,
          name: input.name,
          description: input.description ?? null,
          subjectCode: input.subjectCode ?? null,
          termNumber: input.termNumber ?? null,
          deadline: deadlineFromDate(input.deadline),
          isActive: input.isActive,
          isLocked: input.isLocked,
          // Scope is stored as explicit classes from now on.
          classId: null,
          classLevel: null,
          departmentId: null,
        },
      });
      await tx.assessmentTemplateClass.deleteMany({ where: { templateId: id } });
      if (input.classIds.length) {
        await tx.assessmentTemplateClass.createMany({ data: input.classIds.map((classId) => ({ templateId: id, classId })) });
      }

      const known = new Set(existing.components.map((component) => component.id));
      const keep = new Set(input.components.flatMap((component) => (component.id && known.has(component.id) ? [component.id] : [])));
      if (existing._count.assessmentScores === 0) {
        const removed = existing.components.filter((component) => !keep.has(component.id)).map((component) => component.id);
        if (removed.length) await tx.assessmentComponent.deleteMany({ where: { id: { in: removed }, templateId: id } });
      }
      for (const [index, component] of input.components.entries()) {
        const values = {
          name: component.name,
          componentType: component.componentType,
          maxMarks: component.maxMarks,
          weight: component.weight,
          displayOrder: index + 1,
          isRequired: component.isRequired,
          isRepeatable: component.isRepeatable,
          expectedCount: component.isRepeatable ? component.expectedCount : 1,
        };
        if (component.id && known.has(component.id)) {
          await tx.assessmentComponent.update({ where: { id: component.id }, data: values });
        } else {
          await tx.assessmentComponent.create({ data: { templateId: id, ...values } });
        }
      }
      await this.audit(tx, userId, schoolId, "UPDATE", "ASSESSMENT_TEMPLATE", id, { name: input.name });
    });
    return { id };
  }

  async deleteTemplate(schoolId: string, userId: string, id: string) {
    const existing = await this.prisma.client.assessmentTemplate.findFirst({
      where: { id, schoolId },
      select: { name: true, _count: { select: { assessmentScores: true } } },
    });
    if (!existing) throw new NotFoundException("Assessment not found.");
    if (existing._count.assessmentScores > 0) {
      throw new ConflictException("Marks have been recorded with this assessment, so it can't be deleted. Turn it off instead.");
    }
    await this.prisma.client.$transaction(async (tx) => {
      await tx.assessmentExtension.deleteMany({ where: { templateId: id } });
      await tx.assessmentComponent.deleteMany({ where: { templateId: id } });
      await tx.assessmentTemplateClass.deleteMany({ where: { templateId: id } });
      await tx.assessmentTemplate.delete({ where: { id } });
      await this.audit(tx, userId, schoolId, "DELETE", "ASSESSMENT_TEMPLATE", id, { name: existing.name });
    });
    return { success: true };
  }

  /** A copy to adjust: same components, classes and scale, turned off until the admin is ready. */
  async duplicateTemplate(schoolId: string, userId: string, id: string) {
    const source = await this.prisma.client.assessmentTemplate.findFirst({
      where: { id, schoolId },
      include: { classes: { select: { classId: true } }, components: { orderBy: { displayOrder: "asc" } } },
    });
    if (!source) throw new NotFoundException("Assessment not found.");
    const names = await this.prisma.client.assessmentTemplate.findMany({ where: { schoolId }, select: { name: true } });
    const name = nextCopyName(source.name, names.map((row) => row.name));
    const copyId = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.assessmentTemplate.create({
        data: {
          schoolId,
          gradingSystemId: source.gradingSystemId,
          name,
          description: source.description,
          termNumber: source.termNumber,
          subjectCode: source.subjectCode,
          classId: source.classId,
          classLevel: source.classLevel,
          departmentId: source.departmentId,
          deadline: source.deadline,
          isActive: false,
          isLocked: false,
          components: {
            create: source.components.map((component) => ({
              name: component.name,
              componentType: component.componentType,
              maxMarks: component.maxMarks,
              weight: component.weight,
              displayOrder: component.displayOrder,
              isRequired: component.isRequired,
              isRepeatable: component.isRepeatable,
              expectedCount: component.expectedCount,
            })),
          },
          classes: { create: source.classes.map((item) => ({ classId: item.classId })) },
        },
        select: { id: true },
      });
      await this.audit(tx, userId, schoolId, "CREATE", "ASSESSMENT_TEMPLATE", created.id, { name, copiedFrom: id });
      return created.id;
    });
    return { id: copyId, name };
  }

  // -------------------------------------------------------- grading scales

  async createGradingSystem(schoolId: string, userId: string, input: SaveGradingSystemInput) {
    const code = await this.freeCode(schoolId, slugCode(input.name));
    const id = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.gradingSystem.create({
        data: {
          schoolId,
          name: input.name,
          code,
          description: input.description ?? null,
          createdById: userId,
          gradeScales: { create: this.scaleRows(input) },
        },
        select: { id: true },
      });
      await this.audit(tx, userId, schoolId, "CREATE", "GRADING_SYSTEM", created.id, { name: input.name });
      return created.id;
    });
    return { id };
  }

  async updateGradingSystem(schoolId: string, userId: string, id: string, input: SaveGradingSystemInput) {
    const system = await this.ownedGradingSystem(schoolId, id);
    const withMarks = await this.prisma.client.assessmentScore.count({ where: { template: { gradingSystemId: id, schoolId } } });
    if (withMarks > 0) {
      throw new ConflictException("Marks have already been graded with this scale, so it can't change. Create a new grading scale for new assessments.");
    }
    await this.prisma.client.$transaction(async (tx) => {
      await tx.gradingSystem.update({ where: { id }, data: { name: input.name, description: input.description ?? null } });
      await tx.gradeScale.deleteMany({ where: { gradingSystemId: id } });
      await tx.gradeScale.createMany({ data: this.scaleRows(input).map((row) => ({ ...row, gradingSystemId: id })) });
      await this.audit(tx, userId, schoolId, "UPDATE", "GRADING_SYSTEM", id, { name: input.name, was: system.name });
    });
    return { id };
  }

  async deleteGradingSystem(schoolId: string, userId: string, id: string) {
    const system = await this.ownedGradingSystem(schoolId, id);
    const used = await this.prisma.client.assessmentTemplate.count({ where: { gradingSystemId: id } });
    if (used > 0) {
      throw new ConflictException("This grading scale is used by an assessment, so it can't be deleted.");
    }
    await this.prisma.client.$transaction(async (tx) => {
      await tx.gradingSystem.delete({ where: { id } });
      await this.audit(tx, userId, schoolId, "DELETE", "GRADING_SYSTEM", id, { name: system.name });
    });
    return { success: true };
  }

  // --------------------------------------------------------------- helpers

  /** Higher scores first, so A leads the list. */
  private scaleRows(input: SaveGradingSystemInput) {
    return [...input.scales]
      .sort((a, b) => b.minScore - a.minScore)
      .map((band, index) => ({
        grade: band.grade,
        description: band.description,
        minScore: band.minScore,
        maxScore: band.maxScore,
        gradePoint: band.gradePoint,
        displayOrder: index + 1,
      }));
  }

  private async ownedGradingSystem(schoolId: string, id: string) {
    const system = await this.prisma.client.gradingSystem.findFirst({
      where: { id, OR: [{ schoolId }, { schoolId: null }] },
      select: { id: true, name: true, schoolId: true },
    });
    if (!system) throw new NotFoundException("Grading scale not found.");
    if (system.schoolId === null) {
      throw new ForbiddenException("Shared grading scales can't be changed. Create your own scale instead.");
    }
    return system;
  }

  private async freeCode(schoolId: string, wanted: string) {
    const taken = await this.prisma.client.gradingSystem.findMany({ where: { schoolId, code: { startsWith: wanted } }, select: { code: true } });
    const used = new Set(taken.map((row) => row.code));
    let code = wanted;
    for (let n = 2; used.has(code); n++) code = `${wanted}_${n}`;
    return code;
  }

  private async checkTemplateInput(schoolId: string, input: SaveAssessmentTemplateInput, exceptId?: string) {
    const db = this.prisma.client;
    const [scale, classes, subject, sameName] = await Promise.all([
      db.gradingSystem.findFirst({
        where: { id: input.gradingSystemId, isActive: true, OR: [{ schoolId }, { schoolId: null, isSystemDefault: true }] },
        select: { id: true },
      }),
      input.classIds.length
        ? db.class.count({ where: { id: { in: input.classIds }, schoolId, deletedAt: null } })
        : Promise.resolve(0),
      input.subjectCode ? db.subject.findFirst({ where: { schoolId, code: { equals: input.subjectCode, mode: "insensitive" } }, select: { id: true } }) : Promise.resolve(true),
      db.assessmentTemplate.findFirst({
        where: { schoolId, name: { equals: input.name, mode: "insensitive" }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
        select: { id: true },
      }),
    ]);
    if (!scale) throw new BadRequestException("Choose a grading scale that belongs to this school.");
    if (input.classIds.length && classes !== new Set(input.classIds).size) {
      throw new BadRequestException("Choose classes that belong to this school.");
    }
    if (!subject) throw new BadRequestException("Choose a subject that belongs to this school.");
    if (sameName) throw new ConflictException("An assessment with this name already exists.");
  }

  private async audit(tx: Db, userId: string, schoolId: string, action: "CREATE" | "UPDATE" | "DELETE", entityType: string, entityId: string, newValues: Prisma.InputJsonObject) {
    await tx.auditLog.create({ data: { userId, schoolId, action, entityType, entityId, newValues } });
  }
}
