/** Pure scheduling rules, kept free of database access so they are easy to test. */

export interface ClockRange {
  startTime: string; // 24-hour HH:MM
  endTime: string;
}

/** Two periods overlap when each starts before the other ends. */
export function periodsOverlap(a: ClockRange, b: ClockRange): boolean {
  return a.startTime < b.endTime && b.startTime < a.endTime;
}

export interface SlotUsage {
  id: string;
  classId: string | null;
  className?: string | null;
  teacherId: string | null;
  classroomId: string | null;
  type: 'LESSON' | 'BREAK' | 'ACTIVITY';
}

export interface Placement {
  id?: string;
  classId: string;
  teacherId: string | null;
  classroomId: string | null;
  type: 'LESSON' | 'BREAK' | 'ACTIVITY';
}

/**
 * Compares a proposed placement with everything already scheduled in the same
 * time slot and returns a human-readable clash message, or null when free.
 * Breaks are timetabled per class and never clash with a teacher or room.
 */
export function findPlacementClash(existing: SlotUsage[], next: Placement): string | null {
  for (const entry of existing) {
    if (entry.id === next.id) continue;
    if (entry.classId === next.classId) {
      return 'This class already has something scheduled in that period.';
    }
    if (next.type === 'BREAK' || entry.type === 'BREAK') continue;
    if (next.teacherId && entry.teacherId === next.teacherId) {
      return `That teacher is already teaching ${entry.className ?? 'another class'} in that period.`;
    }
    if (next.classroomId && entry.classroomId === next.classroomId) {
      return `That room is already used by ${entry.className ?? 'another class'} in that period.`;
    }
  }
  return null;
}
