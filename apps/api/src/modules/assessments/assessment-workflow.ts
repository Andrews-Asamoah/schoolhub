/**
 * Rules for the marks-entry workflow: which deadline applies, when a sheet can
 * be edited, how completion is counted and how a correction is checked. Pure
 * functions with no database, so each rule can be tested directly.
 */

export const CORRECTION_APPROVER_ROLES = ["owner", "admin", "headteacher"] as const;
export const CORRECTION_REQUESTER_ROLES = ["owner", "admin", "headteacher", "teacher"] as const;
export const REASON_MIN = 10;
export const REASON_MAX = 2000;

export interface DeadlineExtension {
  teacherId: string | null;
  deadline: Date;
}

/**
 * The deadline that applies to one teacher: the latest of the assessment's own
 * deadline, a class-wide extension and an extension granted to this teacher.
 * An extension can only ever lengthen the time allowed, never shorten it.
 */
export function effectiveDeadline(
  base: Date | null,
  extensions: DeadlineExtension[],
  teacherId: string | null,
): Date | null {
  if (!base) return null;
  let latest = base;
  for (const extension of extensions) {
    if (extension.teacherId !== null && extension.teacherId !== teacherId) continue;
    if (extension.deadline > latest) latest = extension.deadline;
  }
  return latest;
}

export type SheetLock = "TEMPLATE_LOCKED" | "SUBMITTED" | "DEADLINE_PASSED" | "NO_TEACHING_AREA" | null;

export interface SheetStateInput {
  templateLocked: boolean;
  submitted: boolean;
  deadline: Date | null;
  now: Date;
  canEnterAnyComponent: boolean;
}

/**
 * Why a sheet cannot be edited, or null when it can. After a deadline, a
 * submission or a lock nobody edits directly, managers included: changes go
 * through a reviewed correction, so every late change has an approver and a trail.
 */
export function sheetLock(input: SheetStateInput): SheetLock {
  if (input.templateLocked) return "TEMPLATE_LOCKED";
  if (input.submitted) return "SUBMITTED";
  if (input.deadline && input.deadline < input.now) return "DEADLINE_PASSED";
  if (!input.canEnterAnyComponent) return "NO_TEACHING_AREA";
  return null;
}

export const LOCK_MESSAGES: Record<Exclude<SheetLock, null>, string> = {
  TEMPLATE_LOCKED: "This assessment has been locked.",
  SUBMITTED: "These marks were submitted. Request a correction to change them.",
  DEADLINE_PASSED: "The deadline for this assessment has passed. Request a correction to change marks.",
  NO_TEACHING_AREA: "You can view these marks, but you are not assigned to any teaching area in this subject.",
};

/** A lock that a reviewed correction can lift; "no teaching area" can't be fixed that way. */
export function correctionAllowed(lock: SheetLock): boolean {
  return lock === "TEMPLATE_LOCKED" || lock === "SUBMITTED" || lock === "DEADLINE_PASSED";
}

export interface Completion {
  total: number;
  complete: number;
  excused: number;
  /** Pupils with some but not all required marks and no excuse. */
  partial: number;
  /** Pupils with no marks and no excuse. */
  missing: number;
  /** Complete or excused pupils as a whole percentage of the roster (0 for an empty roster). */
  percent: number;
}

/**
 * Counts how much of a class's roster is done. A pupil is done when every
 * required mark is in, or when the teacher has excused them (absent, exempt).
 */
export function completion(
  roster: readonly string[],
  progress: ReadonlyMap<string, { complete: boolean; hasMarks: boolean }>,
  excused: ReadonlySet<string>,
): Completion {
  let complete = 0;
  let excusedCount = 0;
  let partial = 0;
  let missing = 0;
  for (const id of roster) {
    const row = progress.get(id);
    if (row?.complete) complete++;
    else if (excused.has(id)) excusedCount++;
    else if (row?.hasMarks) partial++;
    else missing++;
  }
  const total = roster.length;
  const percent = total === 0 ? 0 : Math.round(((complete + excusedCount) / total) * 100);
  return { total, complete, excused: excusedCount, partial, missing, percent };
}

export type TrackingStatus = "NO_PUPILS" | "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE" | "SUBMITTED" | "OVERDUE";

export function trackingStatus(
  stats: Completion,
  submitted: boolean,
  deadline: Date | null,
  now: Date,
): TrackingStatus {
  if (stats.total === 0) return "NO_PUPILS";
  if (submitted) return "SUBMITTED";
  // Every pupil done but not signed off: finished work is never reported as overdue.
  if (stats.percent === 100) return "COMPLETE";
  if (deadline && deadline < now) return "OVERDUE";
  return stats.complete + stats.excused + stats.partial === 0 ? "NOT_STARTED" : "IN_PROGRESS";
}

/** A pupil is excused only if they are on the roster; anything else is dropped. */
export function cleanExcused(requested: readonly string[], roster: readonly string[]): string[] {
  const onRoster = new Set(roster);
  return [...new Set(requested)].filter((id) => onRoster.has(id));
}

/**
 * Whether a teacher can sign a sheet off: every pupil must be complete or
 * excused. Returns the pupils still holding it up.
 */
export function submissionBlockers(
  roster: readonly string[],
  progress: ReadonlyMap<string, { complete: boolean; hasMarks: boolean }>,
  excused: ReadonlySet<string>,
): string[] {
  return roster.filter((id) => !progress.get(id)?.complete && !excused.has(id));
}

export interface CellChange {
  studentId: string;
  componentId: string;
  occurrenceIndex: number;
  before: number | null;
  after: number | null;
}

/** Drops requested cells that would not change anything, and de-duplicates by cell (last wins). */
export function effectiveChanges(
  requested: readonly { studentId: string; componentId: string; occurrenceIndex: number; marks: number | null }[],
  current: ReadonlyMap<string, number>,
): CellChange[] {
  const byCell = new Map<string, CellChange>();
  for (const item of requested) {
    const key = cellId(item.studentId, item.componentId, item.occurrenceIndex);
    const before = current.get(key) ?? null;
    byCell.set(key, { ...item, before, after: item.marks, });
  }
  return [...byCell.values()]
    .filter((change) => change.before !== change.after)
    .map(({ studentId, componentId, occurrenceIndex, before, after }) => ({ studentId, componentId, occurrenceIndex, before, after }));
}

export const cellId = (studentId: string, componentId: string, occurrenceIndex: number) =>
  `${studentId}|${componentId}|${occurrenceIndex}`;

export function reasonProblem(reason: string): string | null {
  const length = reason.trim().length;
  if (length < REASON_MIN || length > REASON_MAX) {
    return `Give a reason of ${REASON_MIN}–${REASON_MAX} characters.`;
  }
  return null;
}

export interface ApprovalCheck {
  role: string | undefined;
  reviewerId: string;
  requesterId: string | null;
}

/** Only approvers decide, and nobody but an owner approves their own request. */
export function approvalProblem(input: ApprovalCheck): string | null {
  if (!(CORRECTION_APPROVER_ROLES as readonly string[]).includes(input.role ?? "")) {
    return "Only the owner, an administrator or the headteacher can decide a correction.";
  }
  if (input.requesterId === input.reviewerId && input.role !== "owner") {
    return "You cannot approve a correction you requested. Ask the owner or another approver.";
  }
  return null;
}

export interface Stats {
  count: number;
  mean: number | null;
  median: number | null;
  highest: number | null;
  lowest: number | null;
  passRate: number | null;
}

const r2 = (value: number) => Math.round(value * 100) / 100;

/** Class statistics for the marks sheet, over pupils who have a complete result. */
export function classStats(percentages: readonly number[], passMark = 50): Stats {
  if (percentages.length === 0) {
    return { count: 0, mean: null, median: null, highest: null, lowest: null, passRate: null };
  }
  const sorted = [...percentages].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const passed = sorted.filter((value) => value >= passMark).length;
  return {
    count: sorted.length,
    mean: r2(mean),
    median: r2(median),
    highest: sorted[sorted.length - 1]!,
    lowest: sorted[0]!,
    passRate: Math.round((passed / sorted.length) * 100),
  };
}

/** Whether a pupil has at least one mark for every required component. */
export function hasAllRequired(
  components: readonly { id: string; isRequired: boolean }[],
  presentComponentIds: ReadonlySet<string>,
): boolean {
  return components.every((component) => !component.isRequired || presentComponentIds.has(component.id));
}

export interface TeacherRollup {
  teacherId: string | null;
  sheets: number;
  submitted: number;
  overdue: number;
  pupils: number;
  done: number;
  percent: number;
}

interface RollupRow {
  teacherIds: readonly string[];
  status: TrackingStatus;
  total: number;
  done: number;
}

/**
 * Groups sheet rows by the teacher responsible. A sheet shared by several
 * teachers (one per strand) counts for each; a sheet with no teacher goes under null.
 */
export function rollupByTeacher(rows: readonly RollupRow[]): TeacherRollup[] {
  const groups = new Map<string | null, TeacherRollup>();
  for (const row of rows) {
    for (const teacherId of row.teacherIds.length ? row.teacherIds : [null]) {
      const group = groups.get(teacherId) ?? { teacherId, sheets: 0, submitted: 0, overdue: 0, pupils: 0, done: 0, percent: 0 };
      group.sheets++;
      if (row.status === "SUBMITTED") group.submitted++;
      if (row.status === "OVERDUE") group.overdue++;
      group.pupils += row.total;
      group.done += row.done;
      groups.set(teacherId, group);
    }
  }
  return [...groups.values()]
    .map((group) => ({ ...group, percent: group.pupils === 0 ? 0 : Math.round((group.done / group.pupils) * 100) }))
    .sort((a, b) => b.overdue - a.overdue || a.percent - b.percent);
}
