import { BadRequestException, ForbiddenException, HttpException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  marksImportColumns,
  normalizeMarksImportKey,
  type ImportAssessmentMarksBatchInput,
  type MarksImportColumn,
} from "@schoolhub/shared";
import { httpExceptionMessage } from "../../common/http-exception-message.js";
import { canEnterComponentMarks } from "../../common/scope/teacher-access.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { parseUpload } from "../students/import/import-parse.js";
import { AssessmentEntryService } from "./assessment-entry.service.js";
import {
  describeChange,
  identityField,
  identityKey,
  lookupColumns,
  parseMarkCell,
} from "./assessment-marks-import.js";
import { cellId } from "./assessment-workflow.js";

export type MarksPreviewStatus = "ready" | "update" | "unchanged" | "duplicate" | "error";

export interface MarksPreviewRow {
  rowNumber: number;
  name: string;
  status: MarksPreviewStatus;
  errors: string[];
  /** What this row will do, e.g. "Class Test 1: 14 → 17". */
  detail: string;
  row: {
    studentId: string;
    entries: { componentId: string; occurrenceIndex: number; marks: number; expectedMarks: number | null }[];
  } | null;
}

export interface MarksImportResult {
  rowNumber: number;
  name: string;
  status: "created" | "updated" | "failed";
  message?: string;
}

interface SheetRef {
  classId: string;
  subjectId: string;
  templateId: string;
}

/**
 * Bulk upload of one assessment's marks for one class and subject.
 *
 * The preview reads the file against the class list and the assessment's
 * components and saves nothing. Each import batch then goes through
 * AssessmentEntryService.persistEntries, the same path as typing a mark, so
 * deadlines, locks, per-component teacher access, range checks, optimistic
 * conflict detection, result rebuilding and the audit trail all apply unchanged.
 */
@Injectable()
export class AssessmentMarksImportService {
  private readonly logger = new Logger(AssessmentMarksImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entry: AssessmentEntryService,
  ) {}

  async preview(
    schoolId: string,
    userId: string,
    role: string | undefined,
    query: SheetRef,
    file: { buffer: Buffer; originalname: string },
  ) {
    const ctx = await this.entry.loadContext(schoolId, userId, role, query.classId, query.subjectId);
    const template = ctx.templates.find((item) => item.id === query.templateId);
    if (!template) throw new NotFoundException("That assessment does not apply to this class and subject.");
    // Fails with the reason (locked, submitted, past its deadline) before any file work.
    this.entry.assertEditable(template, ctx.assignments.teacherId);

    const editableIds = new Set(
      template.components
        .filter((component) =>
          canEnterComponentMarks(role, ctx.assignments, query.classId, query.subjectId, component.subjectStrandId),
        )
        .map((component) => component.id),
    );
    if (editableIds.size === 0) {
      throw new ForbiddenException("You are not assigned to enter any marks for this assessment in this class.");
    }

    const { format, sheet } = await parseUpload(file.buffer, file.originalname);

    // ---- headings -----------------------------------------------------------
    const columns = marksImportColumns(
      template.components.map((component) => ({
        id: component.id,
        name: component.name,
        maxMarks: component.maxMarks,
        slots: component.isRepeatable ? Math.max(component.expectedCount, 1) : 1,
        subjectStrandName: component.subjectStrandName ?? null,
      })),
    );
    const lookup = lookupColumns(columns);
    const identityAt = new Map<number, "admission" | "name">();
    const markAt = new Map<number, MarksImportColumn>();
    const used = new Set<string>();
    const ignored: string[] = [];
    sheet.headers.forEach((header, index) => {
      if (!header.trim()) return;
      const field = identityField(header);
      if (field && ![...identityAt.values()].includes(field)) {
        identityAt.set(index, field);
        return;
      }
      const key = normalizeMarksImportKey(header);
      if (lookup.ambiguous.has(key)) {
        throw new BadRequestException(
          `The heading "${header}" fits more than one column of this assessment. Download a fresh template and keep its headings.`,
        );
      }
      const column = lookup.byKey.get(key);
      const slot = column ? `${column.componentId}|${column.occurrenceIndex}` : null;
      if (column && slot && !used.has(slot)) {
        used.add(slot);
        markAt.set(index, column);
      } else {
        ignored.push(header);
      }
    });
    if (identityAt.size === 0) {
      throw new BadRequestException(
        `The file needs an "Admission No" or "Pupil name" column to say whose marks they are. Download the template and keep its headings.`,
      );
    }
    if (markAt.size === 0) {
      throw new BadRequestException(
        "None of the column headings match this assessment. Download the template for this class, subject and assessment and keep its headings.",
      );
    }

    // ---- who is on the register, and what they already have ------------------
    const roster = await this.entry.loadRoster(ctx.klass.id, ctx.term.id);
    const byAdmission = new Map<string, (typeof roster)[number]>();
    const ambiguousAdmission = new Set<string>();
    const byName = new Map<string, (typeof roster)[number][]>();
    for (const student of roster) {
      if (student.admissionNumber) {
        const key = identityKey(student.admissionNumber);
        if (byAdmission.has(key)) ambiguousAdmission.add(key);
        else byAdmission.set(key, student);
      }
      const nameKey = identityKey(student.name);
      byName.set(nameKey, [...(byName.get(nameKey) ?? []), student]);
    }
    const scores = await this.prisma.client.assessmentScore.findMany({
      where: {
        subjectId: ctx.subject.id,
        termId: ctx.term.id,
        templateId: template.id,
        studentId: { in: roster.map((student) => student.id) },
      },
      select: {
        studentId: true,
        componentScores: { select: { componentId: true, occurrenceIndex: true, marksObtained: true } },
      },
    });
    const current = new Map<string, number>();
    for (const score of scores) {
      for (const cell of score.componentScores) {
        current.set(cellId(score.studentId, cell.componentId, cell.occurrenceIndex), Number(cell.marksObtained));
      }
    }

    // ---- rows ----------------------------------------------------------------
    const seen = new Set<string>();
    const rows: MarksPreviewRow[] = sheet.records.map((record) => {
      const raw = { admission: "", name: "" };
      for (const [index, field] of identityAt) raw[field] = (record.cells[index] ?? "").trim();
      const label = raw.name || raw.admission || "(no name)";
      const errors: string[] = [];

      let student: (typeof roster)[number] | null = null;
      if (raw.admission) {
        const key = identityKey(raw.admission);
        if (ambiguousAdmission.has(key)) {
          errors.push(`More than one pupil has admission number "${raw.admission}". Fix it under Students first.`);
        } else {
          student = byAdmission.get(key) ?? null;
          if (!student) errors.push(`Admission number "${raw.admission}" is not on ${ctx.klass.name}'s register this term.`);
        }
      } else if (raw.name) {
        const matches = byName.get(identityKey(raw.name)) ?? [];
        if (matches.length === 0) errors.push(`No pupil named "${raw.name}" is on ${ctx.klass.name}'s register this term.`);
        else if (matches.length > 1) errors.push(`More than one pupil is named "${raw.name}". Add their admission number.`);
        else student = matches[0]!;
      } else {
        errors.push("This row has no admission number or pupil name.");
      }
      const name = student ? `${student.name}${student.admissionNumber ? ` (${student.admissionNumber})` : ""}` : label;

      const fail = (messages: string[], status: MarksPreviewStatus = "error"): MarksPreviewRow => ({
        rowNumber: record.rowNumber,
        name,
        status,
        errors: messages,
        detail: "",
        row: null,
      });

      const entries: NonNullable<MarksPreviewRow["row"]>["entries"] = [];
      const notes: string[] = [];
      for (const [index, column] of markAt) {
        const parsed = parseMarkCell(record.cells[index] ?? "", column.maxMarks);
        if (parsed.kind === "empty") continue;
        if (!editableIds.has(column.componentId)) {
          errors.push(`${column.label}: you are not assigned to enter these marks.`);
          continue;
        }
        if (parsed.kind === "invalid") {
          errors.push(`${column.label}: ${parsed.message}`);
          continue;
        }
        if (!student) continue;
        const before = current.get(cellId(student.id, column.componentId, column.occurrenceIndex)) ?? null;
        if (before === parsed.value) continue;
        entries.push({
          componentId: column.componentId,
          occurrenceIndex: column.occurrenceIndex,
          marks: parsed.value,
          expectedMarks: before,
        });
        notes.push(describeChange(column.label, before, parsed.value));
      }
      if (errors.length || !student) return fail(errors);

      if (seen.has(student.id)) return fail(["This pupil is already on an earlier row of the file."], "duplicate");
      seen.add(student.id);

      if (entries.length === 0) {
        return { rowNumber: record.rowNumber, name, status: "unchanged", errors: [], detail: "No new or different marks", row: null };
      }
      return {
        rowNumber: record.rowNumber,
        name,
        status: entries.some((entry) => entry.expectedMarks !== null) ? "update" : "ready",
        errors: [],
        detail: notes.join("; "),
        row: { studentId: student.id, entries },
      };
    });

    const count = (status: MarksPreviewStatus) => rows.filter((row) => row.status === status).length;
    const missing = roster.filter((student) => !seen.has(student.id)).length;
    const notices = [
      ...(ignored.length ? [`Ignored columns that are not part of this assessment: ${ignored.join(", ")}.`] : []),
      ...(missing > 0
        ? [`${missing} pupil${missing === 1 ? "" : "s"} on the class list ${missing === 1 ? "is" : "are"} not in this file. Their marks stay as they are.`]
        : []),
      "Empty cells are skipped: they never clear or change a mark already saved.",
    ];
    return {
      file: { name: file.originalname, format, rows: rows.length },
      notices,
      summary: {
        total: rows.length,
        ready: count("ready"),
        update: count("update"),
        unchanged: count("unchanged"),
        duplicate: count("duplicate"),
        error: count("error"),
      },
      rows,
    };
  }

  /**
   * Saves one batch. The batch is one transaction: if anything in it is refused
   * (a conflict, a lock, a mark out of range) none of its marks are saved and every
   * row in it reports why, so no pupil is left half-updated.
   */
  async importBatch(
    schoolId: string,
    userId: string,
    role: string | undefined,
    input: ImportAssessmentMarksBatchInput,
  ): Promise<{ results: MarksImportResult[] }> {
    const label = (row: ImportAssessmentMarksBatchInput["rows"][number]) => row.name || `Row ${row.rowNumber}`;
    try {
      await this.entry.persistEntries(
        schoolId,
        userId,
        role,
        {
          classId: input.classId,
          subjectId: input.subjectId,
          templateId: input.templateId,
          ...(input.termId ? { termId: input.termId } : {}),
          entries: input.rows.flatMap((row) =>
            row.row.entries.map((entry) => ({ studentId: row.row.studentId, ...entry })),
          ),
        },
        "IMPORT",
      );
    } catch (error) {
      const message =
        error instanceof HttpException
          ? `Nothing in this group of ${input.rows.length} was saved. ${httpExceptionMessage(error)}`
          : "This group could not be saved, so none of its marks were changed.";
      if (!(error instanceof HttpException)) {
        this.logger.error("Marks import batch failed", error instanceof Error ? error.stack : String(error));
      }
      return {
        results: input.rows.map((row) => ({ rowNumber: row.rowNumber, name: label(row), status: "failed", message })),
      };
    }
    return {
      results: input.rows.map((row) => ({
        rowNumber: row.rowNumber,
        name: label(row),
        status: row.row.entries.some((entry) => entry.expectedMarks !== null) ? "updated" : "created",
      })),
    };
  }
}
