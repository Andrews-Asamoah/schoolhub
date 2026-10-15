import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import {
  CalendarDays,
  Check,
  CircleAlert,
  GraduationCap,
  Search,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CreateEnrollmentInput } from "@schoolhub/shared";
import { useSchoolRole } from "@/components/school/school-role-switcher";
import { apiFetch } from "@/lib/api";

interface EnrollmentClass {
  id: string;
  name: string;
  level: string;
  capacity?: number | null;
  isActive: boolean;
}

interface EnrollmentTerm {
  id: string;
  name: string;
  termNumber: number;
  isCurrent: boolean;
  startDate: string;
  endDate: string;
}

interface EnrollmentYear {
  id: string;
  name: string;
  isCurrent: boolean;
  terms: EnrollmentTerm[];
}

interface EnrollmentStudentOption {
  id: string;
  studentId: string;
  admissionNumber: string | null;
  profile: {
    firstName: string;
    lastName: string;
    otherNames: string | null;
  };
  class?: { id: string; name: string } | null;
}

interface EnrollmentRecord {
  id: string;
  enrolledAt: string;
  status: string;
  student: EnrollmentStudentOption;
  class: { id: string; name: string; level: string };
}

interface EnrollmentWorkspaceProps {
  yearsQuery: UseQueryResult<EnrollmentYear[], Error>;
  classesQuery: UseQueryResult<EnrollmentClass[], Error>;
}

const controlClasses =
  "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20";

export function EnrollmentWorkspace({
  yearsQuery,
  classesQuery,
}: EnrollmentWorkspaceProps) {
  const queryClient = useQueryClient();
  const { activeRole } = useSchoolRole();
  const canEnroll = ["owner", "admin", "staff"].includes(activeRole ?? "");
  const years = yearsQuery.data ?? [];
  const classes = (classesQuery.data ?? []).filter((schoolClass) => schoolClass.isActive);
  const [academicYearId, setAcademicYearId] = useState("");
  const [termId, setTermId] = useState("");
  const [classId, setClassId] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  useEffect(() => {
    if (!academicYearId && years.length) {
      setAcademicYearId(years.find((year) => year.isCurrent)?.id ?? years.at(0)?.id ?? "");
    }
  }, [academicYearId, years]);

  const selectedYear = years.find((year) => year.id === academicYearId);
  const terms = selectedYear?.terms ?? [];

  useEffect(() => {
    if (terms.length && !terms.some((term) => term.id === termId)) {
      setTermId(terms.find((term) => term.isCurrent)?.id ?? terms.at(0)?.id ?? "");
      setSelectedStudentIds([]);
    }
    if (!terms.length && termId) setTermId("");
  }, [academicYearId, termId, terms]);

  const eligibleQuery = useQuery({
    queryKey: ["academics", "eligible-students", academicYearId, termId, studentSearch],
    queryFn: () => {
      const params = new URLSearchParams({ academicYearId, termId });
      if (studentSearch.trim()) params.set("search", studentSearch.trim());
      return apiFetch<EnrollmentStudentOption[]>(
        `/academics/eligible-students?${params.toString()}`,
      );
    },
    enabled: Boolean(academicYearId && termId && canEnroll),
    retry: false,
  });
  const rosterQuery = useQuery({
    queryKey: ["academics", "enrollments", academicYearId, termId, classId],
    queryFn: () => {
      const params = new URLSearchParams({ academicYearId, termId });
      if (classId) params.set("classId", classId);
      return apiFetch<EnrollmentRecord[]>(
        `/academics/enrollments?${params.toString()}`,
      );
    },
    enabled: Boolean(academicYearId && termId),
    retry: false,
  });
  const enrollmentMutation = useMutation({
    mutationFn: (input: CreateEnrollmentInput) =>
      apiFetch<{ enrolledCount: number }>("/academics/enrollments", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      setSelectedStudentIds([]);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["academics", "enrollments"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["academics", "eligible-students"],
        }),
        queryClient.invalidateQueries({ queryKey: ["academics", "classes"] }),
        queryClient.invalidateQueries({ queryKey: ["students"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
  });

  const eligibleStudents = eligibleQuery.data ?? [];
  const roster = rosterQuery.data ?? [];
  const selectedClass = classes.find((schoolClass) => schoolClass.id === classId);
  const currentClassCount = roster.length;
  const atCapacity = Boolean(
    selectedClass?.capacity !== null &&
      selectedClass?.capacity !== undefined &&
      currentClassCount + selectedStudentIds.length > selectedClass.capacity,
  );
  const selectedIds = useMemo(
    () => new Set(selectedStudentIds),
    [selectedStudentIds],
  );

  function toggleStudent(studentId: string) {
    setSelectedStudentIds((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId],
    );
    enrollmentMutation.reset();
  }

  function selectAllEligible() {
    setSelectedStudentIds(eligibleStudents.map((student) => student.id));
    enrollmentMutation.reset();
  }

  async function enrollSelected() {
    if (!selectedClass || !academicYearId || !termId || !selectedStudentIds.length) {
      return;
    }
    enrollmentMutation.reset();
    await enrollmentMutation.mutateAsync({
      studentIds: selectedStudentIds,
      classId: selectedClass.id,
      academicYearId,
      termId,
    });
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <div className="border-b border-border bg-gradient-to-br from-primary/10 via-card to-sky-500/5 px-5 py-6 sm:px-7">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">
            Student placement history
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            Enroll students by year and term
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Each student has one class placement per term. Previous terms stay
            in the roster history, so changing a student’s current class does
            not rewrite earlier academic records.
          </p>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3 sm:p-6">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-secondary-foreground">Academic year</span>
            <select
              className={controlClasses}
              value={academicYearId}
              onChange={(event) => {
                setAcademicYearId(event.target.value);
                setSelectedStudentIds([]);
              }}
              disabled={yearsQuery.isPending || !years.length}
            >
              <option value="">Select academic year</option>
              {years.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}{year.isCurrent ? " (Current)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-secondary-foreground">Term</span>
            <select
              className={controlClasses}
              value={termId}
              onChange={(event) => {
                setTermId(event.target.value);
                setSelectedStudentIds([]);
              }}
              disabled={!terms.length}
            >
              <option value="">Select term</option>
              {terms.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.name}{term.isCurrent ? " (Current)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-secondary-foreground">Class roster</span>
            <select
              className={controlClasses}
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
              disabled={classesQuery.isPending}
            >
              <option value="">All classes</option>
              {classes.map((schoolClass) => (
                <option key={schoolClass.id} value={schoolClass.id}>
                  {schoolClass.name} · {schoolClass.level}
                </option>
              ))}
            </select>
          </label>
        </div>
        {(yearsQuery.error || classesQuery.error) && (
          <div className="px-5 pb-5 sm:px-6">
            <InlineError
              message={`Setup data could not be loaded: ${[yearsQuery.error?.message, classesQuery.error?.message].filter(Boolean).join("; ")}`}
            />
          </div>
        )}
        {!yearsQuery.isPending && !yearsQuery.error && !years.length && (
          <div className="px-5 pb-5 sm:px-6">
            <InlineError message="Create an academic year and at least one term before enrolling students." />
          </div>
        )}
      </section>

      {canEnroll && (
        <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
            <div>
              <h3 className="text-base font-bold text-foreground">Enroll eligible students</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Select a target class above, then choose students without a placement in this term.
              </p>
            </div>
            <button
              type="button"
              disabled={
                enrollmentMutation.isPending ||
                !selectedClass ||
                !selectedStudentIds.length ||
                atCapacity
              }
              onClick={() => void enrollSelected().catch(() => undefined)}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check className="size-4" />
              {enrollmentMutation.isPending
                ? "Enrolling…"
                : `Enroll selected${selectedStudentIds.length ? ` (${selectedStudentIds.length})` : ""}`}
            </button>
          </div>

          {enrollmentMutation.error && (
            <div className="px-5 pt-4 sm:px-6">
              <InlineError message={enrollmentMutation.error.message} />
            </div>
          )}
          {selectedStudentIds.length > 0 && !selectedClass && (
            <p className="px-5 pt-4 text-sm font-medium text-destructive sm:px-6">
              Choose a class before enrolling selected students.
            </p>
          )}
          {atCapacity && (
            <p className="px-5 pt-4 text-sm font-medium text-destructive sm:px-6">
              This selection exceeds the class capacity. Reduce the selected students or choose another class.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
            <label className="relative min-w-0 flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className={`${controlClasses} pl-9`}
                value={studentSearch}
                onChange={(event) => {
                  setStudentSearch(event.target.value);
                  setSelectedStudentIds([]);
                }}
                placeholder="Search unplaced students"
                aria-label="Search eligible students"
              />
            </label>
            <button
              type="button"
              onClick={selectAllEligible}
              disabled={!eligibleStudents.length || eligibleQuery.isPending}
              className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
            >
              Select visible ({eligibleStudents.length})
            </button>
          </div>
          {eligibleQuery.isPending ? (
            <InlineLoading label="Loading eligible students" />
          ) : eligibleQuery.error ? (
            <InlineError message={`Eligible students could not be loaded: ${eligibleQuery.error.message}`} />
          ) : eligibleStudents.length ? (
            <div className="max-h-[420px] overflow-auto border-t border-border">
              <ul className="divide-y divide-border">
                {eligibleStudents.map((student) => (
                  <li key={student.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-5 py-3.5 transition hover:bg-muted/30 sm:px-6">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(student.id)}
                        onChange={() => toggleStudent(student.id)}
                        className="size-4 rounded border-border accent-primary"
                        aria-label={`Select ${student.profile.firstName} ${student.profile.lastName}`}
                      />
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <GraduationCap className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground">
                          {student.profile.firstName} {student.profile.lastName}
                          {student.profile.otherNames ? ` ${student.profile.otherNames}` : ""}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {student.admissionNumber || student.studentId}
                        </span>
                      </span>
                      {student.class && (
                        <span className="hidden text-xs text-muted-foreground sm:block">
                          Current pointer: {student.class.name}
                        </span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
              <p className="border-t border-border px-5 py-3 text-center text-xs text-muted-foreground sm:px-6">
                Showing up to 100 matching students. Refine your search to find others.
              </p>
            </div>
          ) : (
            <div className="border-t border-border px-5 py-10 text-center">
              <Users className="mx-auto size-7 text-muted-foreground" />
              <p className="mt-3 text-sm font-semibold text-foreground">
                No eligible students found
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                All matching active students may already have a placement in this term.
              </p>
            </div>
          )}
        </section>
      )}

      <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
          <div>
            <h3 className="text-base font-bold text-foreground">Term roster</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedYear?.name ?? "Select a year"}
              {terms.find((term) => term.id === termId)
                ? ` · ${terms.find((term) => term.id === termId)?.name}`
                : ""}
              {selectedClass ? ` · ${selectedClass.name}` : " · All classes"}
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
            <Users className="size-3.5" />
            {roster.length} {roster.length === 1 ? "student" : "students"}
          </span>
        </div>
        {rosterQuery.isPending ? (
          <InlineLoading label="Loading term roster" />
        ) : rosterQuery.error ? (
          <InlineError message={`Roster could not be loaded: ${rosterQuery.error.message}`} />
        ) : roster.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left">
              <thead className="bg-muted/50">
                <tr className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3.5">Student</th>
                  <th className="px-5 py-3.5">Admission number</th>
                  <th className="px-5 py-3.5">Class</th>
                  <th className="px-5 py-3.5">Enrolled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {roster.map((enrollment) => (
                  <tr key={enrollment.id} className="hover:bg-muted/20">
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-semibold text-foreground">
                        {enrollment.student.profile.firstName} {enrollment.student.profile.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {enrollment.student.studentId}
                      </p>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-secondary-foreground">
                      {enrollment.student.admissionNumber || "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                        {enrollment.class.name}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-muted-foreground">
                      {new Date(enrollment.enrolledAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-10 text-center">
            <CalendarDays className="mx-auto size-7 text-muted-foreground" />
            <p className="mt-3 text-sm font-semibold text-foreground">No placements for these filters</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Select another year, term, or class, or enroll eligible students above.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function InlineLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-5 py-8 text-sm text-muted-foreground">
      <span className="size-2 animate-pulse rounded-full bg-primary" />
      {label}…
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
