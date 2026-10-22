import { templateSpecificity, type TargetClass, type TemplateScope } from "./assessment-entry.js";

/** Where an assessment applies. null means "all". */
export interface Coverage {
  /** null = every class */
  classIds: string[] | null;
  /** null = every subject */
  subjectCode: string | null;
  /** null = every term */
  termNumber: number | null;
}

/**
 * Once marks exist an assessment may be widened but not narrowed: narrowing could
 * leave marks that no teacher can reach, because the sheet would stop finding the assessment.
 */
export function narrowsCoverage(before: Coverage, after: Coverage): string | null {
  const narrowedClasses =
    before.classIds === null
      ? after.classIds !== null
      : after.classIds !== null && before.classIds.some((id) => !after.classIds!.includes(id));
  if (narrowedClasses) return "classes";
  if (before.subjectCode !== null && after.subjectCode !== null && before.subjectCode.toLowerCase() !== after.subjectCode.toLowerCase()) return "subject";
  if (before.subjectCode === null && after.subjectCode !== null) return "subject";
  if (before.termNumber !== null && after.termNumber !== null && before.termNumber !== after.termNumber) return "term";
  if (before.termNumber === null && after.termNumber !== null) return "term";
  return null;
}

/** First free name of the form "Name", "Name (copy)", "Name (copy 2)" ... */
export function nextCopyName(base: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((name) => name.trim().toLowerCase()));
  let candidate = `${base} (copy)`;
  for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${base} (copy ${n})`;
  return candidate;
}

/** Class and subject pairs that no active assessment covers this term, so teachers cannot enter marks for them. */
export function findUncoveredPairs(
  pairs: { classId: string; subjectId: string }[],
  classes: Map<string, TargetClass & { name: string }>,
  subjects: Map<string, { id: string; code: string; name: string }>,
  templates: TemplateScope[],
  termNumber: number,
) {
  const uncovered: { classId: string; className: string; subjectId: string; subjectName: string }[] = [];
  for (const pair of pairs) {
    const klass = classes.get(pair.classId);
    const subject = subjects.get(pair.subjectId);
    if (!klass || !subject) continue;
    if (templates.some((template) => templateSpecificity(template, klass, subject.code, termNumber) !== null)) continue;
    uncovered.push({ classId: klass.id, className: klass.name, subjectId: subject.id, subjectName: subject.name });
  }
  return uncovered.sort((a, b) => a.className.localeCompare(b.className, undefined, { numeric: true }) || a.subjectName.localeCompare(b.subjectName));
}

/** "2026-12-18" becomes the end of that day, so marks can be entered all day on the deadline. */
export function deadlineFromDate(date: string | null | undefined): Date | null {
  return date ? new Date(`${date}T23:59:59.999Z`) : null;
}

export function slugCode(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24) || "SCALE";
}
