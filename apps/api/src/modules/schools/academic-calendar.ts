/** Pure date-range helpers for academic years and terms (ISO `YYYY-MM-DD` strings). */

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface TermRange extends DateRange {
  id?: string;
  name?: string;
}

export function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Returns a message when `term` is not valid inside `year`, otherwise null. */
export function termProblemWithinYear(year: DateRange, term: DateRange): string | null {
  if (term.endDate <= term.startDate) return 'A term must end after it starts.';
  if (term.startDate < year.startDate || term.endDate > year.endDate) {
    return 'The term must fall inside the academic year dates.';
  }
  return null;
}

/** The first existing term whose dates overlap `candidate`, or undefined. */
export function findOverlappingTerm(
  existing: TermRange[],
  candidate: TermRange,
): TermRange | undefined {
  return existing.find(
    (term) =>
      term.id !== candidate.id &&
      candidate.startDate <= term.endDate &&
      candidate.endDate >= term.startDate,
  );
}

/** Existing terms that would fall outside a changed year range. */
export function termsOutsideYear(terms: TermRange[], year: DateRange): TermRange[] {
  return terms.filter(
    (term) => term.startDate < year.startDate || term.endDate > year.endDate,
  );
}
