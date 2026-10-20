export interface ClassTeacherAssignment {
  classId: string;
  teacherId?: string | null;
}

/**
 * Teachers that would be newly placed in a class but are not assigned to the
 * subject. A teacher who already teaches the subject in that class is left
 * alone, so older assignments (made before this rule) do not block other edits.
 */
export function findUnqualifiedTeachers(
  assignments: ClassTeacherAssignment[],
  qualifiedTeacherIds: ReadonlySet<string>,
  currentTeacherByClass: ReadonlyMap<string, string | null>,
): string[] {
  const offending = new Set<string>();
  for (const { classId, teacherId } of assignments) {
    if (!teacherId || qualifiedTeacherIds.has(teacherId)) continue;
    if (currentTeacherByClass.get(classId) === teacherId) continue;
    offending.add(teacherId);
  }
  return [...offending];
}
