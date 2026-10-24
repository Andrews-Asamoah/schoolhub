import type { TeacherAssignments } from "./teacher-scope.service.js";

/** Roles that can work with any class's register and marks. */
export const SCHOOL_MANAGER_ROLES = ["owner", "admin", "headteacher"] as const;

export function isSchoolManager(role: string | undefined) {
  return (SCHOOL_MANAGER_ROLES as readonly string[]).includes(role ?? "");
}

/**
 * Who may do what with a class, in one place.
 *  - Marking the register: managers, or the class teacher of every class involved.
 *  - Entering marks: managers, or the teacher assigned to that subject in that class.
 *  - Viewing marks: the above, plus the class teacher (who compiles the class's reports).
 */
export function canMarkRegister(
  role: string | undefined,
  assignments: TeacherAssignments,
  classIds: readonly string[],
): boolean {
  if (isSchoolManager(role)) return true;
  if (role !== "teacher" || classIds.length === 0) return false;
  const owned = new Set(assignments.classTeacherClassIds);
  return classIds.every((classId) => owned.has(classId));
}

export function canEnterMarks(
  role: string | undefined,
  assignments: TeacherAssignments,
  classId: string,
  subjectId: string,
): boolean {
  if (isSchoolManager(role)) return true;
  if (role !== "teacher") return false;
  return assignments.subjectAssignments.some((row) => row.classId === classId && row.subjectId === subjectId);
}

export function canViewMarks(
  role: string | undefined,
  assignments: TeacherAssignments,
  classId: string,
  subjectId: string,
): boolean {
  if (canEnterMarks(role, assignments, classId, subjectId)) return true;
  return role === "teacher" && assignments.classTeacherClassIds.includes(classId);
}
