/**
 * Rules for reading a marks upload sheet. Pure functions, no database, so the
 * rules that decide whether a cell becomes a mark can be tested directly.
 */
import { normalizeMarksImportKey } from "@schoolhub/shared";

/** Accepted spellings of the two identifying columns, after normalizeMarksImportKey. */
export const ADMISSION_HEADERS = ["admissionno", "admissionnumber", "admission", "admno", "admnumber", "studentid", "pupilid"];
export const NAME_HEADERS = ["pupilname", "studentname", "name", "pupil", "student", "fullname"];

export type MarkCell = { kind: "empty" } | { kind: "mark"; value: number } | { kind: "invalid"; message: string };

/**
 * Turns one spreadsheet cell into a mark. An empty cell means "no change", never
 * zero, so a half-filled sheet cannot wipe or invent marks. Marks are stored to two
 * decimal places, so anything finer is refused rather than silently rounded.
 */
export function parseMarkCell(raw: string, maxMarks: number): MarkCell {
  const text = raw.replace(/\u00a0/g, " ").trim();
  if (text === "") return { kind: "empty" };

  // Some regional settings write 12.5 as "12,5"; a thousands separator such as "1,200" is not a mark.
  const normalized = /^\d+,\d{1,2}$/.test(text) ? text.replace(",", ".") : text;
  if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(normalized)) {
    return { kind: "invalid", message: `"${text}" is not a number. Leave the cell empty if there is no mark.` };
  }
  const value = Number(normalized);
  if (value < 0 || value > maxMarks) {
    return { kind: "invalid", message: `${text} is outside 0 to ${maxMarks}.` };
  }
  if (Math.round(value * 100) / 100 !== value) {
    return { kind: "invalid", message: `${text} has more than 2 decimal places.` };
  }
  return { kind: "mark", value };
}

export interface ColumnLookup<T> {
  /** Column key -> column, for the headings that identify exactly one column. */
  byKey: Map<string, T>;
  /** Keys that two columns share; a sheet using one of these cannot be read safely. */
  ambiguous: Set<string>;
}

/** Indexes columns by their normalized label, noting labels that collide. */
export function lookupColumns<T extends { label: string }>(columns: readonly T[]): ColumnLookup<T> {
  const byKey = new Map<string, T>();
  const ambiguous = new Set<string>();
  for (const column of columns) {
    const key = normalizeMarksImportKey(column.label);
    if (byKey.has(key)) ambiguous.add(key);
    else byKey.set(key, column);
  }
  return { byKey, ambiguous };
}

/** Matches a heading to the identity column it names, or null. */
export function identityField(header: string): "admission" | "name" | null {
  const key = normalizeMarksImportKey(header);
  if (ADMISSION_HEADERS.includes(key)) return "admission";
  if (NAME_HEADERS.includes(key)) return "name";
  return null;
}

/** Lower-case, single-spaced, accent-free text for comparing pupil names and admission numbers. */
export function identityKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const formatMark = (value: number | null) => (value === null ? "empty" : String(value));

/** One short phrase for the Details column, e.g. "Class Test 1: 14 → 17". */
export function describeChange(label: string, before: number | null, after: number) {
  return before === null ? `${label}: ${formatMark(after)}` : `${label}: ${formatMark(before)} → ${formatMark(after)}`;
}
