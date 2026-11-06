import { describe, expect, it, vi } from "vitest";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { AssessmentEntryService } from "./assessment-entry.service.js";

const open = { isLocked: false, deadline: null, extensions: [], submission: null };

function fixture(template: Record<string, unknown> = {}) {
  const tx = {
    $executeRaw: vi.fn(),
    assessmentScore: {
      findMany: vi.fn().mockResolvedValue([
        { id: "score", studentId: "student", isLocked: false, componentScores: [{ id: "cell", componentId: "component", occurrenceIndex: 0, marksObtained: 25 }] },
      ]),
      createManyAndReturn: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn(),
      update: vi.fn(),
    },
    componentScore: { update: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  const service = new AssessmentEntryService({ client: { $transaction: async (fn: (tx: unknown) => unknown) => fn(tx) } } as never, {} as never);
  Object.assign(service, {
    loadContext: async () => ({
      klass: { id: "class" }, subject: { id: "subject" }, term: { id: "term" }, assignments: { teacherId: null },
      templates: [{ id: "template", ...open, ...template, method: "SCORE_BANDS", bands: [], components: [{ id: "component", maxMarks: 100, weight: 100, slots: 1, isRepeatable: false, expectedCount: 1, isRequired: true, subjectStrandId: null }] }],
    }),
    loadRoster: async () => [{ id: "student" }],
    getSheet: async () => ({}),
  });
  const input = { classId: "class", subjectId: "subject", templateId: "template", termId: "term", entries: [{ studentId: "student", componentId: "component", occurrenceIndex: 0, marks: 40, expectedMarks: 20 }] };
  return { service, tx, input };
}

describe("assessment draft concurrency", () => {
  it("rejects a changed server mark without writing the stale draft", async () => {
    const { service, tx, input } = fixture();
    await expect(service.saveEntries("school", "actor", "admin", input)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.componentScore.update).not.toHaveBeenCalled();
    expect(tx.componentScore.createMany).not.toHaveBeenCalled();
    expect(tx.$executeRaw).toHaveBeenCalled();
  });
  it("rejects a draft from a different academic term", async () => {
    const { service, tx, input } = fixture();
    await expect(service.saveEntries("school", "actor", "admin", { ...input, termId: "old-term" })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.assessmentScore.findMany).not.toHaveBeenCalled();
  });
});

describe("assessment entry locks", () => {
  const edit = (input: { entries: { expectedMarks?: number }[] }) => ({ ...input, entries: input.entries.map(({ expectedMarks: _drop, ...entry }) => entry) });
  it("refuses direct edits after the deadline, even for managers", async () => {
    const { service, tx, input } = fixture({ deadline: new Date("2020-01-01") });
    await expect(service.saveEntries("school", "actor", "owner", edit(input) as never)).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it("lets an extension reopen a sheet past its base deadline", async () => {
    const { service, tx, input } = fixture({ deadline: new Date("2020-01-01"), extensions: [{ teacherId: null, deadline: new Date("2999-01-01") }] });
    await service.saveEntries("school", "actor", "admin", edit(input) as never);
    expect(tx.componentScore.update).toHaveBeenCalledTimes(1);
  });
  it("refuses direct edits once the sheet is submitted or locked", async () => {
    const submitted = fixture({ submission: { submittedAt: new Date(), excusedStudentIds: [] } });
    await expect(submitted.service.saveEntries("school", "actor", "admin", edit(submitted.input) as never)).rejects.toBeInstanceOf(ForbiddenException);
    const locked = fixture({ isLocked: true });
    await expect(locked.service.saveEntries("school", "actor", "admin", edit(locked.input) as never)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("assessment entry writes", () => {
  it("writes only changed marks and records the old and new values in the audit trail", async () => {
    const { service, tx, input } = fixture();
    const entries = [
      { studentId: "student", componentId: "component", occurrenceIndex: 0, marks: 25 }, // unchanged
      { studentId: "student", componentId: "component", occurrenceIndex: 0, marks: 30 }, // last edit wins
    ];
    await service.saveEntries("school", "actor", "admin", { ...input, entries });
    expect(tx.componentScore.update).toHaveBeenCalledTimes(1);
    expect(tx.componentScore.createMany).not.toHaveBeenCalled();
    const audit = tx.auditLog.create.mock.calls[0]![0].data;
    expect(audit.oldValues).toEqual([{ s: "student", c: "component", o: 0, v: 25 }]);
    expect(audit.newValues).toMatchObject({ via: "ENTRY", cells: [{ s: "student", c: "component", o: 0, v: 30 }] });
  });
  it("does nothing, and writes no audit row, when nothing changed", async () => {
    const { service, tx, input } = fixture();
    await service.saveEntries("school", "actor", "admin", { ...input, entries: [{ studentId: "student", componentId: "component", occurrenceIndex: 0, marks: 25 }] });
    expect(tx.componentScore.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
