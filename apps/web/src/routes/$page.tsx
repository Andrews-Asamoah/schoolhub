import {
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { SchoolWorkspaceLayout } from "@/components/school/school-workspace-layout";
import {
  PreviewDataNotice,
  WorkspaceEmptyState,
  WorkspacePageHeading,
  WorkspaceStat,
} from "@/components/school/workspace-ui";
import { apiFetch, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { canRoleAccessPage, getSchoolNavItem } from "@/lib/school-navigation";
import { useSchoolRole } from "@/components/school/school-role-switcher";
import { useTeachingOverview } from "@/lib/teaching";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const AbsenceRequestsWorkspace = lazy(() => import("@/components/portal/absence-requests-workspace").then(module => ({default:module.AbsenceRequestsWorkspace})));
const TicketWorkspace = lazy(() => import("@/components/support/ticket-workspace").then((m) => ({ default: m.TicketWorkspace })));
const AcademicYearSetup = lazy(() => import("@/components/school/academic-year-setup").then((m) => ({ default: m.AcademicYearSetup })));
const SchoolLogoUploader = lazy(() => import("@/components/school/school-logo-uploader").then((m) => ({ default: m.SchoolLogoUploader })));
const SubjectsWorkspace = lazy(() => import("@/components/school/subjects-workspace").then((m) => ({ default: m.SubjectsWorkspace })));
const TimetableWorkspace = lazy(() => import("@/components/school/timetable-workspace").then((m) => ({ default: m.TimetableWorkspace })));
const ReportCardArchiveWorkspace = lazy(() => import("@/components/school/report-card-archive-workspace").then((m) => ({ default: m.ReportCardArchiveWorkspace })));
const HeadteacherReportApprovalsWorkspace = lazy(() => import("@/components/school/headteacher-report-approvals-workspace").then((m) => ({ default: m.HeadteacherReportApprovalsWorkspace })));
const FinanceApprovalSettingsWorkspace = lazy(() => import("@/components/school/finance-approval-settings-workspace").then((m) => ({ default: m.FinanceApprovalSettingsWorkspace })));
const TeamRoleWorkspace = lazy(() => import("@/components/school/team-role-workspace").then((m) => ({ default: m.TeamRoleWorkspace })));
const ClassesWorkspace = lazy(() => import("@/components/school/classes-workspace").then((m) => ({ default: m.ClassesWorkspace })));
const AdmissionsWorkspace = lazy(() => import("@/components/school/admissions-workspace").then((m) => ({ default: m.AdmissionsWorkspace })));
const EnrollmentWorkspace = lazy(() => import("@/components/school/enrollment-workspace").then((m) => ({ default: m.EnrollmentWorkspace })));
const StudentDirectoryWorkspace = lazy(() => import("@/components/school/student-directory-workspace").then((m) => ({ default: m.StudentDirectoryWorkspace })));
const PeopleWorkspace = lazy(() => import("@/components/school/people-workspace").then((m) => ({ default: m.PeopleWorkspace })));
const AssessmentEntryWorkspace = lazy(() => import("@/components/school/assessment-entry-workspace").then((m) => ({ default: m.AssessmentEntryWorkspace })));
const AssessmentTrackingWorkspace = lazy(() => import("@/components/school/assessment-tracking-workspace").then((m) => ({ default: m.AssessmentTrackingWorkspace })));
const AssessmentsAdmin = lazy(() => import("@/components/school/assessments-admin").then((m) => ({ default: m.AssessmentsAdmin })));
const ClassRegister = lazy(() => import("@/components/school/class-register").then((m) => ({ default: m.ClassRegister })));
const AttendanceReviewWorkspace = lazy(() => import("@/components/school/attendance-review-workspace").then((m) => ({ default: m.AttendanceReviewWorkspace })));
const SchoolSettingsForm = lazy(() => import("@/components/school/school-settings-form").then((m) => ({ default: m.SchoolSettingsForm })));
const ProfileWorkspace = lazy(() => import("@/components/school/profile-workspace").then((m) => ({ default: m.ProfileWorkspace })));
const HousesWorkspace = lazy(() => import("@/components/school/houses-workspace").then((m) => ({ default: m.HousesWorkspace })));
const ClubsWorkspace = lazy(() => import("@/components/school/clubs-workspace").then((m) => ({ default: m.ClubsWorkspace })));
const TeacherPortalWorkspace = lazy(() => import("@/components/portal/teacher-portal-workspace").then((m) => ({ default: m.TeacherPortalWorkspace })));
const AccountantPortalWorkspace = lazy(() => import("@/components/portal/accountant-portal-workspace").then((m) => ({ default: m.AccountantPortalWorkspace })));
const ExpenseManagementWorkspace = lazy(() => import("@/components/portal/expense-management-workspace").then((m) => ({ default: m.ExpenseManagementWorkspace })));
const PayrollManagementWorkspace = lazy(() => import("@/components/portal/payroll-management-workspace").then((m) => ({ default: m.PayrollManagementWorkspace })));
const FeeReminderWorkspace = lazy(() => import("@/components/portal/fee-reminder-workspace").then((m) => ({ default: m.FeeReminderWorkspace })));
const InventoryManagementWorkspace = lazy(() => import("@/components/portal/inventory-management-workspace").then((m) => ({ default: m.InventoryManagementWorkspace })));
const FeeStructuresWorkspace = lazy(() => import("@/components/portal/fee-structures-workspace").then((m) => ({ default: m.FeeStructuresWorkspace })));
const ConcessionsWorkspace = lazy(() => import("@/components/portal/concessions-workspace").then((m) => ({ default: m.ConcessionsWorkspace })));
const FinanceAuditWorkspace = lazy(() => import("@/components/portal/finance-audit-workspace").then((m) => ({ default: m.FinanceAuditWorkspace })));
const StudentStatementWorkspace = lazy(() => import("@/components/portal/student-statement-workspace").then((m) => ({ default: m.StudentStatementWorkspace })));
const TermEndReviewWorkspace = lazy(() => import("@/components/portal/term-end-review-workspace").then((m) => ({ default: m.TermEndReviewWorkspace })));
const SignaturesWorkspace = lazy(() => import("@/components/school/signatures-workspace").then((m) => ({ default: m.SignaturesWorkspace })));
const GuardianPortalWorkspace = lazy(() => import("@/components/portal/guardian-portal-workspace").then((m) => ({ default: m.GuardianPortalWorkspace })));
const GuardianChildRecordsWorkspace = lazy(() => import("@/components/portal/guardian-child-records-workspace").then((m) => ({ default: m.GuardianChildRecordsWorkspace })));
const GuardianFeesWorkspace = lazy(() => import("@/components/portal/guardian-fees-workspace").then((m) => ({ default: m.GuardianFeesWorkspace })));
const StudentPortalWorkspace = lazy(() => import("@/components/portal/student-portal-workspace").then((m) => ({ default: m.StudentPortalWorkspace })));
const StudentSubjectsView = lazy(() => import("@/components/portal/student-subjects-view").then((m) => ({ default: m.StudentSubjectsView })));
const StudentAttendanceView = lazy(() => import("@/components/portal/student-attendance-view").then((m) => ({ default: m.StudentAttendanceView })));
const StudentReportView = lazy(() => import("@/components/portal/student-report-view").then((m) => ({ default: m.StudentReportView })));
const StudentClassmatesView = lazy(() => import("@/components/portal/student-classmates-view").then((m) => ({ default: m.StudentClassmatesView })));
const StudentHouseClubsView = lazy(() => import("@/components/portal/student-house-clubs-view").then((m) => ({ default: m.StudentHouseClubsView })));
const StudentAssignmentsView = lazy(() => import("@/components/portal/student-assignments-view").then((m) => ({ default: m.StudentAssignmentsView })));
const TeacherAssignmentsWorkspace = lazy(() => import("@/components/portal/teacher-assignments-workspace").then((m) => ({ default: m.TeacherAssignmentsWorkspace })));
const StudentAnnouncementsView = lazy(() => import("@/components/portal/student-announcements-view").then((m) => ({ default: m.StudentAnnouncementsView })));
const AdminAnnouncementsWorkspace = lazy(() => import("@/components/portal/admin-announcements-workspace").then((m) => ({ default: m.AdminAnnouncementsWorkspace })));
const DocumentsWorkspace = lazy(() => import("@/components/portal/documents-workspace").then((m) => ({ default: m.DocumentsWorkspace })));
const MessagesWorkspace = lazy(() => import("@/components/portal/messages-workspace").then((m) => ({ default: m.MessagesWorkspace })));
const NotificationsHistoryWorkspace = lazy(() => import("@/components/portal/notifications-history-workspace").then((m) => ({ default: m.NotificationsHistoryWorkspace })));
const SchoolReportsWorkspace = lazy(() => import("@/components/school/reports-workspace").then((m) => ({ default: m.SchoolReportsWorkspace })));
const MockAnalysisWorkspace = lazy(() => import("@/components/school/mock-analysis-workspace").then((m) => ({ default: m.MockAnalysisWorkspace })));
const ExternalExaminationsWorkspace = lazy(() => import("@/components/school/external-examinations-workspace").then((m) => ({ default: m.ExternalExaminationsWorkspace })));
const TeacherReportReviewWorkspace = lazy(() => import("@/components/school/teacher-report-review-workspace").then((m) => ({ default: m.TeacherReportReviewWorkspace })));

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
  const { activeRole, isPending: rolePending, error: roleError } = useSchoolRole();
  const navigate = useNavigate();
  const blocked = Boolean(navItem && activeRole && !canRoleAccessPage(activeRole, navItem.id));

  // Switching to a role that cannot open this page (for example Administrator
  // -> Teacher while on Team roles) must not leave the old page showing.
  useEffect(() => {
    if (blocked) void navigate({ to: "/dashboard", replace: true });
  }, [blocked, navigate]);
  if (rolePending) return <p role="status" className="p-6">Loading your role…</p>;
  if (roleError || !activeRole) return <p role="alert" className="p-6">Your role could not be verified. Please sign in again.</p>;
  if (blocked) return null;

  if (!navItem) {
    return (
      <SchoolWorkspaceLayout
        activePage=""
        title="Page not found"
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
    >
      <Suspense
        fallback={
          <div role="status" className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Loading workspace…
          </div>
        }
      >
        <WorkspaceContent pageId={navItem.id} />
      </Suspense>
    </SchoolWorkspaceLayout>
  );
}

function WorkspaceContent({ pageId }: { pageId: string }) {
  const { data: session } = useSession();
  const isSignedIn = !!session?.user;
  const { activeRole } = useSchoolRole();
  const canManageClasses = ["owner", "admin", "headteacher"].includes(activeRole ?? "");

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
        !["classes", "students", "teachers", "staff", "guardians", "teacher-portal", "accountant-portal", "fees", "concessions", "signatures", "payments", "invoices", "expenses", "payroll", "fee-reminders", "inventory", "outstanding", "finance-reports", "student-statements", "term-end-review", "guardian-portal", "guardian-attendance", "guardian-timetable", "guardian-reports", "guardian-notices", "guardian-fees", "documents", "messages", "notifications", "student-portal", "clubs", "houses", "assignments", "classmates", "announcements"].includes(
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
          {pageId === "dashboard" && activeRole === "guardian" && <GuardianPortalWorkspace showSectionNav={false} />}
          {pageId === "guardian-attendance" && <GuardianChildRecordsWorkspace view="attendance" />}
          {pageId === "guardian-timetable" && <GuardianChildRecordsWorkspace view="timetable" />}
          {pageId === "guardian-reports" && <GuardianPortalWorkspace defaultTab="academics" showSectionNav={false} />}
          {pageId === "guardian-notices" && <GuardianPortalWorkspace defaultTab="notices" showSectionNav={false} />}
          {pageId === "guardian-fees" && <GuardianFeesWorkspace />}
          {pageId === "student-portal" && <StudentPortalWorkspace />}
          {pageId === "invoices" && <AccountantPortalWorkspace defaultTab="invoices" />}
          {pageId === "outstanding" && <AccountantPortalWorkspace defaultTab="debtors" />}
          {pageId === "finance-reports" && <AccountantPortalWorkspace defaultTab="reports" />}
          {pageId === "expenses" && <ExpenseManagementWorkspace />}
          {pageId === "payroll" && <PayrollManagementWorkspace />}
          {pageId === "fee-reminders" && <FeeReminderWorkspace />}
          {pageId === "inventory" && <InventoryManagementWorkspace />}
          {pageId === "documents" && <DocumentsWorkspace />}
          {pageId === "messages" && <MessagesWorkspace />}
          {pageId === "notifications" && <NotificationsHistoryWorkspace />}
          {pageId === "timetable" && (
            activeRole === "student" ? <StudentPortalWorkspace page="timetable" /> : <TimetableWorkspace />
          )}
          {pageId === "students" && <StudentDirectoryWorkspace />}
          {pageId === "admissions" && <AdmissionsWorkspace />}
          {pageId === "teachers" && <PeopleWorkspace kind="teachers" />}
          {pageId === "staff" && <PeopleWorkspace kind="staff" />}
          {pageId === "guardians" && <PeopleWorkspace kind="guardians" />}
          {pageId === "houses" && (
            activeRole === "student" ? <StudentHouseClubsView view="HOUSE" /> : <HousesWorkspace />
          )}
          {pageId === "clubs" && (
            activeRole === "student" ? <StudentHouseClubsView view="CLUBS" /> : <ClubsWorkspace />
          )}
          {pageId === "classmates" && <StudentClassmatesView />}
          {pageId === "assignments" && (activeRole === "student" ? <StudentAssignmentsView /> : <TeacherAssignmentsWorkspace />)}
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
          {pageId === "mock-analysis" && <MockAnalysisWorkspace />}
          {pageId === "external-exams" && <ExternalExaminationsWorkspace />}
          {pageId === "assessments" && (
            activeRole === "student" ? (
              <StudentReportView />
            ) : activeRole === "teacher" ? (
              <><AssessmentEntryWorkspace mode="teacher" /><TeacherReportReviewWorkspace /></>
            ) : (
              <AssessmentsAdmin />
            )
          )}
          {pageId === "assessment-tracking" && <AssessmentTrackingWorkspace role={activeRole ?? undefined} />}
          {pageId === "report-approvals" && <HeadteacherReportApprovalsWorkspace />}
          {pageId === "report-cards" && <ReportCardArchiveWorkspace role={activeRole ?? undefined} />}
          {pageId === "reports" && (
            activeRole === "student" ? <StudentReportView /> : <SchoolReportsWorkspace />
          )}
          {pageId === "attendance" && (
            activeRole === "student" ? <StudentAttendanceView /> : <><AttendanceWorkspace query={classesQuery} /><AbsenceRequestsWorkspace /></>
          )}
          {pageId === "concessions" && <ConcessionsWorkspace />}
          {pageId === "signatures" && <SignaturesWorkspace />}
          {pageId === "fees" && (
            activeRole === "student" ? (
              <WorkspaceEmptyState
                title="Fees are managed by parents / guardians"
                description="Detailed billing schedules and payment invoices are accessible to your parent or guardian on their guardian portal."
              />
            ) : (
              <FeeStructuresWorkspace />
            )
          )}
          {pageId === "payments" && <AccountantPortalWorkspace defaultTab="payments" />}
          {pageId === "finance-audit" && <FinanceAuditWorkspace />}
          {pageId === "student-statements" && <StudentStatementWorkspace />}
          {pageId === "term-end-review" && <TermEndReviewWorkspace />}
          {pageId === "settings" && <SchoolSettings query={schoolQuery} />}
          {pageId === "finance-approvals" && <FinanceApprovalSettingsWorkspace />}
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
      <AttendanceReviewWorkspace key={classId} classId={classId}
        canManage={["owner","admin","headteacher"].includes(attendanceRole ?? "")} />
    </div>
  );
}

function SchoolSettings({ query }: { query: UseQueryResult<School, Error> }) {
  if (query.isPending) return <LoadingState label="Loading school profile" />;
  if (query.error) return <QueryError error={query.error} />;
  const school = query.data;
  if (!school) return null;

  return (
    <div className="rounded-2xl border border-border/80 bg-card p-5 sm:p-6">
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
      <div className="mt-5 rounded-2xl border border-border/80 bg-card p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CircleAlert className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              This page is ready for its feature data
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
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
    <div className="flex min-h-52 items-center justify-center gap-2 rounded-2xl border border-border bg-card text-sm text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin text-primary" />
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
      className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive"
    >
      <p className="font-semibold">Could not load this workspace data</p>
      <p className="mt-1 leading-relaxed">{message}</p>
    </div>
  );
}
