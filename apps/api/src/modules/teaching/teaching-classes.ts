import type { TeacherAssignments } from "../../common/scope/teacher-scope.service.js";

export interface TeachingClass {
  id: string;
  name: string;
  level: string;
  /** Class teacher: may manage the class and mark its register. */
  isClassTeacher: boolean;
  studentCount: number;
  /** Subjects this teacher teaches in the class. */
  subjects: { id: string; name: string; code: string }[];
}

/** Puts the teacher's class-teacher and subject assignments together, one entry per class. */
export function buildTeachingClasses(
  assignments: TeacherAssignments,
  classes: { id: string; name: string; level: string }[],
  subjects: { id: string; name: string; code: string }[],
  studentCounts: ReadonlyMap<string, number>,
): TeachingClass[] {
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
  const classTeacherOf = new Set(assignments.classTeacherClassIds);

  return classes
    .map((klass) => ({
      id: klass.id,
      name: klass.name,
      level: klass.level,
      isClassTeacher: classTeacherOf.has(klass.id),
      studentCount: studentCounts.get(klass.id) ?? 0,
      subjects: assignments.subjectAssignments
        .filter((row) => row.classId === klass.id)
        .map((row) => subjectById.get(row.subjectId))
        .filter((subject): subject is NonNullable<typeof subject> => subject !== undefined)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => Number(b.isClassTeacher) - Number(a.isClassTeacher) || a.name.localeCompare(b.name));
}
