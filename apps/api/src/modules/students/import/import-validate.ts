import type { NormalizedStudentRow } from "@schoolhub/shared";

/** "JHS 1-A", "jhs1a" and "JHS 1A" all match the same class. */
export const matchKey = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
export const studentKey = (firstName: string, lastName: string, dateOfBirth: string) =>
  `${matchKey(firstName)}|${matchKey(lastName)}|${dateOfBirth}`;

export interface NamedItem {
  id: string;
  name: string;
}

export interface ImportContext {
  classes: NamedItem[];
  houses: NamedItem[];
  /** Placing students in a class needs a current academic year and term. */
  hasCurrentTerm: boolean;
  /** Lowercased admission numbers already in the school. */
  admissionNumbers: Set<string>;
  /** studentKey() of every student already in the school. */
  studentKeys: Set<string>;
}

export type RowStatus = "ready" | "warning" | "duplicate" | "error";

export interface RowVerdict {
  status: RowStatus;
  errors: string[];
  warnings: string[];
  classId: string | null;
  houseId: string | null;
}

/** Earlier rows of the same file, so a student listed twice is caught. */
export interface SeenInFile {
  admissions: Map<string, number>;
  keys: Map<string, number>;
}
export const newSeen = (): SeenInFile => ({ admissions: new Map(), keys: new Map() });

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length]!;
}

export type NameMatch = { id: string } | { ambiguous: string[] } | { suggestion: string | null };

/** Finds the class or house a name refers to, or the closest likely typo. */
export function resolveByName(items: NamedItem[], value: string): NameMatch {
  const key = matchKey(value);
  const hits = items.filter((item) => matchKey(item.name) === key);
  if (hits.length === 1) return { id: hits[0]!.id };
  if (hits.length > 1) return { ambiguous: hits.map((item) => item.name) };
  const close = items
    .map((item) => ({ item, d: distance(key, matchKey(item.name)) }))
    .filter(({ d }) => d <= Math.max(1, Math.min(2, Math.floor(key.length / 4))))
    .sort((a, b) => a.d - b.d)[0];
  return { suggestion: close?.item.name ?? null };
}

/**
 * Checks one cleaned row against the school: its class and house exist, and it
 * isn't already there or earlier in the file. A student the school already has
 * is "duplicate" (skipped, not an error) so the same file can safely be uploaded again.
 */
export function evaluateRow(
  row: NormalizedStudentRow,
  ctx: ImportContext,
  carriedWarnings: string[] = [],
  seen?: SeenInFile,
): RowVerdict {
  const errors: string[] = [];
  const warnings = [...carriedWarnings];
  const key = studentKey(row.firstName, row.lastName, row.dateOfBirth);
  const admission = row.admissionNumber?.trim().toLowerCase();

  if (admission && ctx.admissionNumbers.has(admission)) {
    return { status: "duplicate", errors, warnings, classId: null, houseId: null };
  }
  if (ctx.studentKeys.has(key)) {
    return { status: "duplicate", errors, warnings, classId: null, houseId: null };
  }

  if (seen) {
    const sameAdmission = admission ? seen.admissions.get(admission) : undefined;
    if (sameAdmission) errors.push(`Same admission number as row ${sameAdmission}.`);
    const sameKey = seen.keys.get(key);
    if (sameKey) errors.push(`Same name and date of birth as row ${sameKey}.`);
    if (admission && !sameAdmission) seen.admissions.set(admission, row.rowNumber);
    if (!sameKey) seen.keys.set(key, row.rowNumber);
  }

  let classId: string | null = null;
  if (row.className) {
    if (!ctx.hasCurrentTerm) {
      errors.push("Set a current academic year and term before placing students in classes.");
    } else {
      const match = resolveByName(ctx.classes, row.className);
      if ("id" in match) classId = match.id;
      else if ("ambiguous" in match) errors.push(`Class "${row.className}" matches more than one class: ${match.ambiguous.join(", ")}.`);
      else errors.push(`Class "${row.className}" doesn't exist${match.suggestion ? `. Did you mean ${match.suggestion}?` : ". Create it first, or fix the spelling."}`);
    }
  }

  let houseId: string | null = null;
  if (row.houseName) {
    const match = resolveByName(ctx.houses, row.houseName);
    if ("id" in match) houseId = match.id;
    else if ("ambiguous" in match) errors.push(`House "${row.houseName}" matches more than one house.`);
    else errors.push(`House "${row.houseName}" doesn't exist${match.suggestion ? `. Did you mean ${match.suggestion}?` : "."}`);
  }

  return { status: errors.length ? "error" : warnings.length ? "warning" : "ready", errors, warnings, classId, houseId };
}

/** After a student is created, later rows in the same run see them as already present. */
export function remember(ctx: ImportContext, row: NormalizedStudentRow) {
  if (row.admissionNumber) ctx.admissionNumbers.add(row.admissionNumber.trim().toLowerCase());
  ctx.studentKeys.add(studentKey(row.firstName, row.lastName, row.dateOfBirth));
}
