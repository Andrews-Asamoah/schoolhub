import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { SchoolWorkspaceLayout } from "@/components/school/school-workspace-layout";
import {
  PreviewDataNotice,
  WorkspaceDataTable,
  WorkspaceEmptyState,
  WorkspacePageHeading,
  WorkspaceStat,
  type WorkspaceColumn,
} from "@/components/school/workspace-ui";
import { apiFetch, ApiError } from "@/lib/api";
import { SubjectsWorkspace } from "@/components/school/subjects-workspace";
import { TimetableWorkspace } from "@/components/school/timetable-workspace";
import { useSession } from "@/lib/auth-client";
import { canRoleAccessPage, getSchoolNavItem } from "@/lib/school-navigation";
import { TicketWorkspace } from "@/components/support/ticket-workspace";
import { AcademicYearSetup } from "@/components/school/academic-year-setup";
import { TeamRoleWorkspace } from "@/components/school/team-role-workspace";
import { ClassesWorkspace } from "@/components/school/classes-workspace";
import { useSchoolRole } from "@/components/school/school-role-switcher";
import { useTeachingOverview } from "@/lib/teaching";
import { AdmissionsWorkspace } from "@/components/school/admissions-workspace";
import { EnrollmentWorkspace } from "@/components/school/enrollment-workspace";
import { StudentDirectoryWorkspace } from "@/components/school/student-directory-workspace";
import { PeopleWorkspace } from "@/components/school/people-workspace";
import { SchoolLogoUploader } from "@/components/school/school-logo-uploader";
import { AssessmentEntryWorkspace } from "@/components/school/assessment-entry-workspace";
import { AssessmentsAdmin } from "@/components/school/assessments-admin";
import { ClassRegister } from "@/components/school/class-register";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SchoolSettingsForm } from "@/components/school/school-settings-form";
import { ProfileWorkspace } from "@/components/school/profile-workspace";
import { HousesWorkspace } from "@/components/school/houses-workspace";
import { ClubsWorkspace } from "@/components/school/clubs-workspace";
import { TeacherPortalWorkspace } from "@/components/portal/teacher-portal-workspace";
import { AccountantPortalWorkspace } from "@/components/portal/accountant-portal-workspace";
import { GuardianPortalWorkspace } from "@/components/portal/guardian-portal-workspace";
import { StudentPortalWorkspace } from "@/components/portal/student-portal-workspace";
import { StudentSubjectsView } from "@/components/portal/student-subjects-view";
import { StudentAttendanceView } from "@/components/portal/student-attendance-view";
import { StudentReportView } from "@/components/portal/student-report-view";
import { StudentClassmatesView } from "@/components/portal/student-classmates-view";
import { StudentHouseClubsView } from "@/components/portal/student-house-clubs-view";
import { StudentAssignmentsView } from "@/components/portal/student-assignments-view";
import { StudentAnnouncementsView } from "@/components/portal/student-announcements-view";
import { AdminAnnouncementsWorkspace } from "@/components/portal/admin-announcements-workspace";

export const Route = createFileRoute("/$page")({
  component: WorkspaceRoute,
});

interface SchoolClass {
  id: string;
  name: string;
  level: string;
  capacity?: number | null;
  department?: { id: string; name: string; code: string } | null;
  isActive: boolean;
  isGraduatingClass: boolean;
  classTeacher?: {
    profile?: { firstName: string; lastName: string } | null;
  } | null;
  _count: { students: number };
}

interface ClassTeacher {
  id: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
}

interface AcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  terms: {
    id: string;
    name: string;
    termNumber: number;
    startDate: string;
    endDate: string;
    isCurrent: boolean;
  }[];
}

interface FeeStructure {
  id: string;
  name: string;
  description?: string | null;
  classLevel?: string | null;
  termBased: boolean;
  items: { id: string; name: string; amount: number | string }[];
  targetClasses: { class: { id: string; name: string } }[];
}

interface AttendanceRow {
  studentId: string;
  admissionNumber: string;
  name: string;
  attendance: { status: string; remarks?: string | null } | null;
}

interface School {
  id: string;
  name: string;
  code: string;
  subdomain: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  motto?: string | null;
  website?: string | null;
  logo?: string | null;
}

function WorkspaceRoute() {
  const { page } = useParams({ from: "/$page" });
  const navItem = getSchoolNavItem(page);
  const { activeRole } = useSchoolRole();
  const navigate = useNavigate();
  const blocked = Boolean(navItem && activeRole && !canRoleAccessPage(activeRole, navItem.id));

  // Switching to a role that cannot open this page (for example Administrator
  // -> Teacher while on Team roles) must not leave the old page showing.
  useEffect(() => {
    if (blocked) void navigate({ to: "/dashboard", replace: true });
  }, [blocked, navigate]);
  if (blocked) return null;

  if (!navItem) {
    return (
      <SchoolWorkspaceLayout
        activePage=""
        title="Page not found"
        section="Workspace"
      >
        <WorkspaceEmptyState
          title="We couldn’t find that page"
          description="This workspace page does not exist. Use the sidebar to return to a school area."
        />
      </SchoolWorkspaceLayout>
    );
  }

  return (
    <SchoolWorkspaceLayout
      activePage={navItem.id}
      title={navItem.label}
      section={navItem.section}
    >
      <WorkspaceContent pageId={navItem.id} />
    </SchoolWorkspaceLayout>
  );
}

function WorkspaceContent({ pageId }: { pageId: string }) {
  const { data: session } = useSession();
  const isSignedIn = !!session?.user;
  const { activeRole } = useSchoolRole();
  const canManageClasses = activeRole === "owner" || activeRole === "admin";

  const classesQuery = useQuery({
    queryKey: ["academics", "classes"],
    queryFn: () => apiFetch<SchoolClass[]>("/academics/classes"),
    enabled:
      isSignedIn && ["classes", "attendance", "enrollments"].includes(pageId),
    retry: false,
  });
  const departmentsQuery = useQuery({
    queryKey: ["academics", "departments"],
    queryFn: () =>
      apiFetch<
        {
          id: string;
          name: string;
          code: string;
          description?: string | null;
          _count: { classes: number };
        }[]
      >("/academics/departments"),
    enabled: isSignedIn && pageId === "classes",
    retry: false,
  });
  const classTeachersQuery = useQuery({
    queryKey: ["academics", "class-teachers"],
    queryFn: () => apiFetch<ClassTeacher[]>("/academics/teachers"),
    enabled: isSignedIn && pageId === "classes" && canManageClasses,
    retry: false,
  });
  const yearsQuery = useQuery({
    queryKey: ["schools", "academic-years"],
    queryFn: () => apiFetch<AcademicYear[]>("/schools/academic-years"),
    enabled: isSignedIn && ["academic-years", "enrollments"].includes(pageId),
    retry: false,
  });
  const feesQuery = useQuery({
    queryKey: ["finance", "fee-structures"],
    queryFn: () => apiFetch<FeeStructure[]>("/finance/fee-structures"),
    enabled: isSignedIn && pageId === "fees",
    retry: false,
  });
  const schoolQuery = useQuery({
    queryKey: ["school", "current"],
    queryFn: () => apiFetch<School>("/schools/current"),
    enabled: isSignedIn && pageId === "settings",
    retry: false,
  });

  const page = getSchoolNavItem(pageId)!;
  return (
    <>
      {activeRole !== "student" &&
        !["classes", "students", "teachers", "staff", "guardians", "teacher-portal", "accountant-portal", "guardian-portal", "student-portal", "clubs", "houses", "assignments", "classmates", "announcements"].includes(
          pageId,
        ) && (
        <WorkspacePageHeading
          section={page.section}
          title={page.label}
          description={page.description}
          icon={page.icon}
        />
      )}

      {!isSignedIn ? (
        <WorkspaceEmptyState
          title="Sign in to view school records"
          description="School information is private. Sign in to load records belonging to your active school."
        />
      ) : (
        <>
          {pageId === "teacher-portal" && <TeacherPortalWorkspace />}
          {pageId === "accountant-portal" && <AccountantPortalWorkspace />}
          {pageId === "guardian-portal" && <GuardianPortalWorkspace />}
          {pageId === "student-portal" && <StudentPortalWorkspace />}
          {pageId === "invoices" && <AccountantPortalWorkspace defaultTab="invoices" />}
          {pageId === "expenses" && <AccountantPortalWorkspace defaultTab="expenses" />}
          {pageId === "payroll" && <AccountantPortalWorkspace defaultTab="payroll" />}
          {pageId === "inventory" && <AccountantPortalWorkspace defaultTab="inventory" />}
          {pageId === "timetable" && (
            activeRole === "student" ? <StudentPortalWorkspace defaultTab="timetable" /> : <TimetableWorkspace />
          )}
          {pageId === "students" && <StudentDirectoryWorkspace />}
          {pageId === "admissions" && <AdmissionsWorkspace />}
          {pageId === "teachers" && <PeopleWorkspace kind="teachers" />}
          {pageId === "staff" && <PeopleWorkspace kind="staff" />}
          {pageId === "guardians" && <PeopleWorkspace kind="guardians" />}
          {pageId === "houses" && (
            activeRole === "student" ? <StudentHouseClubsView /> : <HousesWorkspace />
          )}
          {pageId === "clubs" && (
            activeRole === "student" ? <StudentHouseClubsView /> : <ClubsWorkspace />
          )}
          {pageId === "classmates" && <StudentClassmatesView />}
          {pageId === "assignments" && <StudentAssignmentsView />}
          {pageId === "announcements" && (
            activeRole === "student" ? <StudentAnnouncementsView />
              : activeRole === "teacher" ? <AdminAnnouncementsWorkspace mode="teacher" />
                : activeRole === "accountant" ? <AdminAnnouncementsWorkspace mode="accountant" />
                  : ["owner", "admin", "headteacher"].includes(activeRole ?? "")
                    ? <AdminAnnouncementsWorkspace />
                    : <AdminAnnouncementsWorkspace mode="viewer" />
          )}
          {pageId === "classes" && (
            <ClassesWorkspace
              classesQuery={classesQuery}
              departmentsQuery={departmentsQuery}
              teachersQuery={classTeachersQuery}
            />
          )}
          {pageId === "enrollments" && (
            <EnrollmentWorkspace
              yearsQuery={yearsQuery}
              classesQuery={classesQuery}
            />
          )}
          {pageId === "subjects" && (
            activeRole === "student" ? <StudentSubjectsView /> : <SubjectsWorkspace />
          )}
          {pageId === "academic-years" && <AcademicYears query={yearsQuery} />}
          {pageId === "assessments" && (
            activeRole === "student" ? (
              <StudentReportView />
            ) : activeRole === "teacher" ? (
              <AssessmentEntryWorkspace mode="teacher" />
            ) : (
              <AssessmentsAdmin />
            )
          )}
          {pageId === "reports" && (
            activeRole === "student" ? <StudentReportView /> : <PlannedWorkspace title={page.label} />
          )}
          {pageId === "attendance" && (
            activeRole === "student" ? <StudentAttendanceView /> : <AttendanceWorkspace query={classesQuery} />
          )}
          {pageId === "fees" && (
            activeRole === "student" ? (
              <WorkspaceEmptyState
                title="Fees are managed by parents / guardians"
                description="Detailed billing schedules and payment invoices are accessible to your parent or guardian on their guardian portal."
              />
            ) : (
              <FeeStructureList query={feesQuery} />
            )
          )}
          {pageId === "payments" && <AccountantPortalWorkspace defaultTab="payments" />}
          {pageId === "settings" && <SchoolSettings query={schoolQuery} />}
          {pageId === "profile" && <ProfileWorkspace />}
          {pageId === "team" && <TeamRoleWorkspace />}
          {pageId === "support" && <TicketWorkspace mode="school" />}
          {page.apiStatus === "planned" && (
            <PlannedWorkspace title={page.label} />
          )}
        </>
      )}
    </>
  );
}

function AcademicYears({
  query,
}: {
  query: UseQueryResult<AcademicYear[], Error>;
}) {
  if (query.isPending) return <LoadingState label="Loading academic years" />;
  if (query.error) return <QueryError error={query.error} />;
  return <AcademicYearSetup years={query.data ?? []} />;
}

function FeeStructureList({
  query,
}: {
  query: UseQueryResult<FeeStructure[], Error>;
}) {
  if (query.isPending) return <LoadingState label="Loading fee structures" />;
  if (query.error) return <QueryError error={query.error} />;
  const columns: WorkspaceColumn<FeeStructure>[] = [
    {
      id: "name",
      header: "Fee structure",
      cell: (fee) => (
        <span className="font-semibold text-foreground">{fee.name}</span>
      ),
    },
    {
      id: "class",
      header: "Applies to",
      cell: (fee) =>
        fee.targetClasses.length > 0
          ? fee.targetClasses
              .map(({ class: schoolClass }) => schoolClass.name)
              .join(", ")
          : (fee.classLevel ?? "All classes"),
    },
    { id: "items", header: "Fee items", value: (fee) => fee.items.length, cell: (fee) => fee.items.length },
    {
      id: "total",
      header: "Structure total (GHS)",
      value: (fee) => fee.items.reduce((total, item) => total + Number(item.amount), 0),
      cell: (fee) =>
        new Intl.NumberFormat("en-GH", {
          style: "currency",
          currency: "GHS",
        }).format(
          fee.items.reduce((total, item) => total + Number(item.amount), 0),
        ),
    },
  ];
  return (
    <WorkspaceDataTable
      rows={query.data ?? []}
      columns={columns}
      getRowId={(fee) => fee.id}
      exportTitle="Fee structures"
      emptyTitle="No active fee structures"
      emptyDescription="Add an active fee structure before generating student bills."
    />
  );
}

function AttendanceWorkspace({
  query,
}: {
  query: UseQueryResult<SchoolClass[], Error>;
}) {
  const [selectedClassId, setSelectedClassId] = useState("");
  const { activeRole: attendanceRole } = useSchoolRole();
  const teaching = useTeachingOverview(attendanceRole === "teacher");

  if (query.isPending || (attendanceRole === "teacher" && teaching.isPending)) {
    return <LoadingState label="Loading attendance classes" />;
  }
  if (query.error) return <QueryError error={query.error} />;
  if (attendanceRole === "teacher" && teaching.error) {
    return <QueryError error={teaching.error} />;
  }

  // Only assigned class teachers can mark attendance; every other school role is read-only.
  const availableClasses =
    attendanceRole === "teacher"
      ? (query.data ?? []).filter((schoolClass) =>
          teaching.data?.classes.some(
            (item) => item.id === schoolClass.id && item.isClassTeacher,
          ),
        )
      : (query.data ?? []);
  const classId =
    availableClasses.find((schoolClass) => schoolClass.id === selectedClassId)?.id ??
    availableClasses[0]?.id ??
    "";

  if (!availableClasses.length) {
    return (
      <WorkspaceEmptyState
        title={attendanceRole === "teacher" ? "No class register assigned to you" : "No classes available"}
        description={
          attendanceRole === "teacher"
            ? "Only the assigned class teacher can record attendance. Ask the school administrator to review your class-teacher assignment if a class is missing."
            : "Create a class and enrol students before reviewing attendance records."
        }
      />
    );
  }

  const className =
    availableClasses.find((schoolClass) => schoolClass.id === classId)?.name ?? "Class";
  const canMark =
    attendanceRole === "teacher" &&
    !!teaching.data?.classes.some(
      (item) => item.id === classId && item.isClassTeacher,
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between sm:p-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">School operations</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">Daily attendance</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            {canMark
              ? "Record and review attendance for your assigned class."
              : "Review attendance records. Only the assigned class teacher can edit the register."}
          </p>
        </div>
        <div className="grid gap-1.5 sm:w-64">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="attendance-class">Class</label>
          <Select value={classId} onValueChange={setSelectedClassId}>
            <SelectTrigger id="attendance-class" className="w-full">
              <SelectValue placeholder="Choose a class" />
            </SelectTrigger>
            <SelectContent>
              {availableClasses.map((schoolClass) => (
                <SelectItem key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <ClassRegister
        key={classId}
        classId={classId}
        className={className}
        canMark={canMark}
      />
    </div>
  );
}

function SchoolSettings({ query }: { query: UseQueryResult<School, Error> }) {
  if (query.isPending) return <LoadingState label="Loading school profile" />;
  if (query.error) return <QueryError error={query.error} />;
  const school = query.data;
  if (!school) return null;

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-slate-900/70">
      <SchoolLogoUploader logo={school.logo} />
      <SchoolSettingsForm school={school} />
    </div>
  );
}

function PlannedWorkspace({ title }: { title: string }) {
  return (
    <>
      <PreviewDataNotice>
        This section is part of the school workspace roadmap. Its menu entry and
        page are ready, but the API does not yet provide these records.
      </PreviewDataNotice>
      <div className="grid gap-4 sm:grid-cols-2">
        <WorkspaceStat label="Workspace area" value={title} detail="planned" />
        <WorkspaceStat
          label="Backend data"
          value="Not connected"
          detail="feature API"
        />
      </div>
      <div className="mt-5 rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <CircleAlert className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              This page is ready for its feature data
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
              The reference SMS includes this workflow. The data model and
              endpoints need to be connected before SchoolHub can show live
              records here. No sample records are presented as real school data.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex min-h-52 items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-white text-xs text-slate-500">
      <LoaderCircle className="size-4 animate-spin text-blue-600" />
      {label}…
    </div>
  );
}

function QueryError({ error }: { error: Error }) {
  const message =
    error instanceof ApiError && error.status === 401
      ? "Your session has expired. Sign in again to access this school data."
      : error instanceof ApiError && error.status === 403
        ? "You do not have permission to view this school data."
        : error.message;
  return (
    <div
      role="alert"
      className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-xs text-rose-800"
    >
      <p className="font-semibold">Could not load this workspace data</p>
      <p className="mt-1 leading-relaxed">{message}</p>
    </div>
  );
}

function StatusBadge({ value }: { value: string }) {
  const normalized = value.toUpperCase();
  const isPositive = ["ACTIVE", "PRESENT", "PAID", "CURRENT"].includes(
    normalized,
  );
  const isNegative = ["ABSENT", "SUSPENDED", "WITHDRAWN", "OVERDUE"].includes(
    normalized,
  );
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-[9px] font-semibold ${
        isPositive
          ? "bg-emerald-50 text-emerald-700"
          : isNegative
            ? "bg-rose-50 text-rose-700"
            : "bg-slate-100 text-slate-600"
      }`}
    >
      {normalized.replaceAll("_", " ")}
    </span>
  );
}

