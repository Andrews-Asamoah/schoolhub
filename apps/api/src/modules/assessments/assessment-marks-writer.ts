import { ConflictException, ForbiddenException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  classRankGrades,
  computeStudentResult,
  rankByPercentage,
  type EntryComponent,
  type GradingMethod,
  type RankBand,
} from "./assessment-entry.js";
import { cellId, effectiveChanges, type CellChange } from "./assessment-workflow.js";

const round2 = (value: number) => Math.round(value * 100) / 100;

export interface WriterTemplate {
  id: string;
  components: EntryComponent[];
  bands: RankBand[];
  method: GradingMethod;
}

export interface MarkChange {
  studentId: string;
  componentId: string;
  occurrenceIndex: number;
  marks: number | null;
  /** What the editor last saw; a different stored value means someone else changed it. */
  expectedMarks?: number | null;
}

export interface ApplyArgs {
  schoolId: string;
  userId: string;
  termId: string;
  classId: string;
  subjectId: string;
  template: WriterTemplate;
  /** Every pupil on the class register this term; totals, grades and positions are rebuilt for them. */
  roster: readonly string[];
  changes: readonly MarkChange[];
  /** Only a reviewed correction may change a pupil's individually locked marks. */
  allowLockedScores: boolean;
  /** Recorded in the audit trail so late changes can be traced to their approval. */
  source: { kind: "ENTRY" } | { kind: "CORRECTION"; correctionId: string };
}

const num = (value: Prisma.Decimal | number | null | undefined) => (value == null ? null : Number(value));

/**
 * Writes a batch of marks and rebuilds the class's totals, grades and positions,
 * all inside the caller's transaction. It reads each table once and writes only
 * the rows that actually change, so a save costs a handful of queries however
 * many pupils are on the sheet, rather than several per pupil.
 *
 * Callers decide whether the change is allowed (deadline, submission, approval).
 * This function only guarantees the write is consistent, conflict-checked and audited.
 */
export async function applyMarkChanges(tx: Prisma.TransactionClient, args: ApplyArgs): Promise<CellChange[]> {
  const { schoolId, template, termId, classId, subjectId } = args;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}), hashtext(${classId + ":" + subjectId + ":" + termId}))`;

  const componentById = new Map(template.components.map((component) => [component.id, component]));
  const touched = [...new Set(args.changes.map((change) => change.studentId))];
  const existing = await tx.assessmentScore.findMany({
    where: { subjectId, termId, templateId: template.id, studentId: { in: touched } },
    select: {
      id: true,
      studentId: true,
      isLocked: true,
      componentScores: { select: { id: true, componentId: true, occurrenceIndex: true, marksObtained: true } },
    },
  });
  const scoreByStudent = new Map(existing.map((row) => [row.studentId, row]));
  const cellRow = new Map<string, { id: string; marks: number }>();
  const current = new Map<string, number>();
  for (const row of existing) {
    for (const cell of row.componentScores) {
      const key = cellId(row.studentId, cell.componentId, cell.occurrenceIndex);
      cellRow.set(key, { id: cell.id, marks: Number(cell.marksObtained) });
      current.set(key, Number(cell.marksObtained));
    }
  }

  for (const change of args.changes) {
    if (!args.allowLockedScores && scoreByStudent.get(change.studentId)?.isLocked) {
      throw new ForbiddenException("These marks have been locked.");
    }
    if (change.expectedMarks !== undefined) {
      const stored = current.get(cellId(change.studentId, change.componentId, change.occurrenceIndex)) ?? null;
      if (stored !== change.expectedMarks) {
        throw new ConflictException("Another user changed these marks. Your draft was preserved. Review the latest marks before retrying.");
      }
    }
  }

  const applied = effectiveChanges(args.changes, current);
  if (applied.length === 0) return [];

  // Pupils who have no score row yet but are being given a mark.
  const needRow = [...new Set(applied.filter((change) => change.after !== null && !scoreByStudent.has(change.studentId)).map((change) => change.studentId))];
  if (needRow.length) {
    const created = await tx.assessmentScore.createManyAndReturn({
      data: needRow.map((studentId) => ({
        studentId,
        subjectId,
        termId,
        templateId: template.id,
        totalScore: new Prisma.Decimal(0),
        percentage: new Prisma.Decimal(0),
      })),
      select: { id: true, studentId: true, isLocked: true, componentScores: { select: { id: true, componentId: true, occurrenceIndex: true, marksObtained: true } } },
    });
    for (const row of created) scoreByStudent.set(row.studentId, row);
  }

  const now = new Date();
  const toCreate: Prisma.ComponentScoreCreateManyInput[] = [];
  const toDelete: string[] = [];
  const updates: Promise<unknown>[] = [];
  for (const change of applied) {
    const component = componentById.get(change.componentId)!;
    const key = cellId(change.studentId, change.componentId, change.occurrenceIndex);
    const row = cellRow.get(key);
    if (change.after === null) {
      if (row) toDelete.push(row.id);
      continue;
    }
    const ratio = component.maxMarks > 0 ? change.after / component.maxMarks : 0;
    const values = {
      marksObtained: new Prisma.Decimal(change.after),
      maxMarks: new Prisma.Decimal(component.maxMarks),
      percentage: new Prisma.Decimal(round2(ratio * 100)),
      weightedScore: new Prisma.Decimal(round2(ratio * component.weight)),
      recordedById: args.userId,
      recordedAt: now,
    };
    if (row) {
      updates.push(tx.componentScore.update({ where: { id: row.id }, data: values }));
    } else {
      toCreate.push({ assessmentScoreId: scoreByStudent.get(change.studentId)!.id, componentId: change.componentId, occurrenceIndex: change.occurrenceIndex, ...values });
    }
  }
  if (toDelete.length) await tx.componentScore.deleteMany({ where: { id: { in: toDelete } } });
  if (toCreate.length) await tx.componentScore.createMany({ data: toCreate });
  // An interactive transaction runs one statement at a time; awaiting together just avoids idle round trips.
  await Promise.all(updates);

  await rebuildClassResults(tx, args);

  await tx.auditLog.create({
    data: {
      schoolId,
      userId: args.userId,
      action: "GRADE_ENTERED",
      entityType: "AssessmentEntry",
      entityId: `${template.id}:${classId}:${subjectId}:${termId}`,
      oldValues: applied.map((change) => ({ s: change.studentId, c: change.componentId, o: change.occurrenceIndex, v: change.before })),
      newValues: {
        via: args.source.kind,
        ...(args.source.kind === "CORRECTION" ? { correctionId: args.source.correctionId } : {}),
        cells: applied.map((change) => ({ s: change.studentId, c: change.componentId, o: change.occurrenceIndex, v: change.after })),
      },
    },
  });
  return applied;
}

/** Re-totals everyone on the register, ranks the complete results and writes only what changed. */
async function rebuildClassResults(tx: Prisma.TransactionClient, args: ApplyArgs) {
  const { template } = args;
  const rows = await tx.assessmentScore.findMany({
    where: { subjectId: args.subjectId, termId: args.termId, templateId: template.id, studentId: { in: [...args.roster] } },
    select: {
      id: true,
      totalScore: true,
      percentage: true,
      grade: true,
      gradePoint: true,
      position: true,
      componentScores: { select: { componentId: true, occurrenceIndex: true, marksObtained: true } },
    },
  });

  const emptyRows = rows.filter((row) => row.componentScores.length === 0).map((row) => row.id);
  if (emptyRows.length) await tx.assessmentScore.deleteMany({ where: { id: { in: emptyRows } } });

  const live = rows.filter((row) => row.componentScores.length > 0);
  const results = new Map(
    live.map((row) => [
      row.id,
      computeStudentResult(
        template.components,
        row.componentScores.map((cell) => ({ componentId: cell.componentId, occurrenceIndex: cell.occurrenceIndex, marks: Number(cell.marksObtained) })),
        template.bands,
        template.method,
      ),
    ]),
  );
  if (template.method === "CLASS_RANK") {
    // One pupil's marks move everyone else's band, so the whole class is regraded.
    const graded = classRankGrades(
      [...results].filter(([, result]) => result.complete).map(([id, result]) => ({ id, percentage: result.percentage })),
      template.bands,
    );
    for (const [id, result] of results) {
      const own = graded.get(id);
      results.set(id, { ...result, grade: own?.grade ?? null, gradePoint: own?.gradePoint ?? null });
    }
  }
  const ranks = rankByPercentage([...results].map(([id, result]) => ({ id, percentage: result.complete ? result.percentage : null })));

  const writes: Promise<unknown>[] = [];
  for (const row of live) {
    const result = results.get(row.id)!;
    const position = ranks.get(row.id) ?? null;
    const unchanged =
      num(row.totalScore) === result.totalScore &&
      num(row.percentage) === result.percentage &&
      row.grade === result.grade &&
      num(row.gradePoint) === result.gradePoint &&
      row.position === position;
    if (unchanged) continue;
    writes.push(
      tx.assessmentScore.update({
        where: { id: row.id },
        data: {
          totalScore: new Prisma.Decimal(result.totalScore),
          percentage: new Prisma.Decimal(result.percentage),
          grade: result.grade,
          gradePoint: result.gradePoint == null ? null : new Prisma.Decimal(result.gradePoint),
          position,
        },
      }),
    );
  }
  await Promise.all(writes);
}
