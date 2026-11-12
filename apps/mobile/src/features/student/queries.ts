import { useQuery } from "@tanstack/react-query";
import {
  getMyAssessmentReport,
  getMyAttendance,
  getMyClassmates,
  getMyClubs,
  getMyFeeStatus,
  getMyStudentProfile,
  getMySubjects,
  getMyTimetable,
  getSchoolClubsForStudents,
  getSchoolHousesForStudents,
  listMyAssignments,
  listMyPublishedReports,
} from "@/api/student";
import { useSession } from "@/lib/session";

function useStudentScope() {
  const session = useSession();
  return {
    school: session.subdomain,
    enabled: session.status === "ready" && session.activeRole === "student",
  };
}
export const studentKeys = {
  root: (school: string | null) =>
    ["school", school, "student", "student-app"] as const,
  profile: (school: string | null) =>
    [...studentKeys.root(school), "profile"] as const,
  fees: (school: string | null) =>
    [...studentKeys.root(school), "fee-status"] as const,
  subjects: (school: string | null) =>
    [...studentKeys.root(school), "subjects"] as const,
  classmates: (school: string | null) =>
    [...studentKeys.root(school), "classmates"] as const,
  clubs: (school: string | null) =>
    [...studentKeys.root(school), "my-clubs"] as const,
  houses: (school: string | null) =>
    [...studentKeys.root(school), "houses"] as const,
  schoolClubs: (school: string | null) =>
    [...studentKeys.root(school), "clubs"] as const,
  timetable: (school: string | null) =>
    [...studentKeys.root(school), "timetable"] as const,
  attendance: (school: string | null) =>
    [...studentKeys.root(school), "attendance"] as const,
  assignments: (school: string | null) =>
    [...studentKeys.root(school), "assignments"] as const,
  assessmentReport: (school: string | null) =>
    [...studentKeys.root(school), "assessment-report"] as const,
  publishedReports: (school: string | null) =>
    [...studentKeys.root(school), "published-reports"] as const,
};

function useStudentQuery<T>(
  key: readonly unknown[],
  queryFn: (signal: AbortSignal) => Promise<T>,
) {
  const scope = useStudentScope();
  return useQuery({
    queryKey: key,
    queryFn: ({ signal }) => queryFn(signal),
    enabled: scope.enabled,
    meta: { persist: false },
  });
}
export function useMyStudentProfileQuery() {
  const { school } = useStudentScope();
  return useStudentQuery(studentKeys.profile(school), (signal) =>
    getMyStudentProfile({ signal }),
  );
}
export function useMyFeeStatusQuery() {
  const { school } = useStudentScope();
  return useStudentQuery(studentKeys.fees(school), (signal) =>
    getMyFeeStatus({ signal }),
  );
}
export function useMySubjectsQuery() {
  const { school } = useStudentScope();
  return useStudentQuery(studentKeys.subjects(school), (signal) =>
    getMySubjects({ signal }),
  );
}
export function useMyClassmatesQuery() {
  const { school } = useStudentScope();
  return useStudentQuery(studentKeys.classmates(school), (signal) =>
    getMyClassmates({ signal }),
  );
}
export function useMyClubsQuery() {
  const { school } = useStudentScope();
  return useStudentQuery(studentKeys.clubs(school), (signal) =>
    getMyClubs({ signal }),
  );
}
export function useSchoolClubsQuery() {
  const { school } = useStudentScope();
  return useStudentQuery(studentKeys.schoolClubs(school), (signal) =>
    getSchoolClubsForStudents({ signal }),
  );
}
export function useSchoolHousesQuery() {
  const { school } = useStudentScope();
  return useStudentQuery(studentKeys.houses(school), (signal) =>
    getSchoolHousesForStudents({ signal }),
  );
}
export function useMyTimetableQuery() {
  const { school } = useStudentScope();
  return useStudentQuery(studentKeys.timetable(school), (signal) =>
    getMyTimetable({ signal }),
  );
}
export function useMyAttendanceQuery() {
  const { school } = useStudentScope();
  return useStudentQuery(studentKeys.attendance(school), (signal) =>
    getMyAttendance({ signal }),
  );
}
export function useMyAssignmentsQuery() {
  const { school } = useStudentScope();
  return useStudentQuery(studentKeys.assignments(school), (signal) =>
    listMyAssignments({ signal }),
  );
}
export function useMyAssessmentReportQuery() {
  const { school } = useStudentScope();
  return useStudentQuery(studentKeys.assessmentReport(school), (signal) =>
    getMyAssessmentReport({ signal }),
  );
}
export function useMyPublishedReportsQuery() {
  const { school } = useStudentScope();
  return useStudentQuery(studentKeys.publishedReports(school), (signal) =>
    listMyPublishedReports({ signal }),
  );
}
