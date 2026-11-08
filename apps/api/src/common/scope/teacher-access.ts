import type { TeacherAssignments } from "./teacher-scope.service.js";

/** Roles allowed to manage academic marks; attendance marking is class-teacher-only. */
export const SCHOOL_MANAGER_ROLES = ["owner", "admin", "headteacher"] as const;

export function isSchoolManager(role: string | undefined) {
  return (SCHOOL_MANAGER_ROLES as readonly string[]).includes(role ?? "");
}

/**
 * Who may do what with a class, in one place.
 *  - Marking the register: only the class teacher of every class involved.
 *  - Entering marks: managers, or a teacher who teaches that subject in that class (whole subject or a teaching area).
 *  - Viewing marks: the above, plus the class teacher (who compiles the class's reports).
 */
export function canMarkRegister(
  role: string | undefined,
  assignments: TeacherAssignments,
  classIds: readonly string[],
): boolean {
  if (role !== "teacher" || classIds.length === 0) return false;
  const owned = new Set(assignments.classTeacherClassIds);
  return classIds.every((classId) => owned.has(classId));
}

export interface TeachingPair { classId: string; subjectId: string }

/**
 * Every (class, subject) a teacher teaches: as the whole-subject teacher, or through one or more
 * teaching areas (strands) of a subject that is shared between teachers. This is the single
 * definition of "teaches this subject", so a teacher who only owns a teaching area is never
 * treated as unattached to the class.
 */
export function teachingPairs(assignments: TeacherAssignments): TeachingPair[] {
  const pairs = new Map<string, TeachingPair>();
  for (const { classId, subjectId } of [...assignments.subjectAssignments, ...assignments.subjectStrandAssignments]) {
    pairs.set(`${classId}:${subjectId}`, { classId, subjectId });
  }
  return [...pairs.values()];
}

export function teachesSubject(assignments: TeacherAssignments, classId: string, subjectId: string): boolean {
  return teachingPairs(assignments).some((row) => row.classId === classId && row.subjectId === subjectId);
}

/** Every class a teacher is responsible for through the class-teacher or subject-teacher role. */
export function assignedClassIds(assignments: TeacherAssignments): string[] {
  return [...new Set([...assignments.classTeacherClassIds, ...teachingPairs(assignments).map((row) => row.classId)])];
}

export function canEnterMarks(
  role: string | undefined,
  assignments: TeacherAssignments,
  classId: string,
  subjectId: string,
): boolean {
  if (isSchoolManager(role)) return true;
  return role === "teacher" && teachesSubject(assignments, classId, subjectId);
}

/** Authorize an individual assessment component using strand-specific ownership. */
export function canEnterComponentMarks(
  role: string | undefined,
  assignments: TeacherAssignments,
  classId: string,
  subjectId: string,
  subjectStrandId?: string | null,
): boolean {
  if (isSchoolManager(role)) return true;
  if (role !== "teacher") return false;
  if (!subjectStrandId) return canEnterMarks(role, assignments, classId, subjectId);
  return assignments.subjectStrandAssignments.some(
    (row) => row.classId === classId && row.subjectId === subjectId && row.subjectStrandId === subjectStrandId,
  );
}

export function canViewMarks(
  role: string | undefined,
  assignments: TeacherAssignments,
  classId: string,
  subjectId: string,
): boolean {
  return canEnterMarks(role, assignments, classId, subjectId) || (role === "teacher" && assignments.classTeacherClassIds.includes(classId));
}
