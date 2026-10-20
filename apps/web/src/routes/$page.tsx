import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowRight, Check, CircleAlert, LoaderCircle } from "lucide-react";
import { useState } from "react";
import {
  recordPaymentSchema,
  type RecordPaymentInput,
} from "@schoolhub/shared";
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
import { getSchoolNavItem } from "@/lib/school-navigation";
import { TicketWorkspace } from "@/components/support/ticket-workspace";
import { AcademicYearSetup } from "@/components/school/academic-year-setup";
import { TeamRoleWorkspace } from "@/components/school/team-role-workspace";
import { ClassesWorkspace } from "@/components/school/classes-workspace";
import { useSchoolRole } from "@/components/school/school-role-switcher";
import { AdmissionsWorkspace } from "@/components/school/admissions-workspace";
import { EnrollmentWorkspace } from "@/components/school/enrollment-workspace";
import { StudentDirectoryWorkspace } from "@/components/school/student-directory-workspace";
import { PeopleWorkspace } from "@/components/school/people-workspace";
import { SchoolLogoUploader } from "@/components/school/school-logo-uploader";
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

interface AssessmentTemplate {
  id: string;
  name: string;
  description?: string | null;
  termNumber?: number | null;
  components: { id: string; name: string; maxMarks: number | string }[];
  gradingSystem: { name: string };
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
  const assessmentsQuery = useQuery({
    queryKey: ["assessments", "templates"],
    queryFn: () => apiFetch<AssessmentTemplate[]>("/assessments/templates"),
    enabled: isSignedIn && pageId === "assessments",
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
        !["classes", "students", "teachers", "staff", "guardians", "teacher-portal", "accountant-portal", "guardian-portal", "student-portal", "clubs", "houses", "assignments", "classmates"].includes(
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
            activeRole === "student" ? <StudentAnnouncementsView /> : <PlannedWorkspace title={page.label} />
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
            activeRole === "student" ? <StudentReportView /> : <AssessmentList query={assessmentsQuery} />
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
          {pageId === "payments" && <PaymentEntry />}
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

function AssessmentList({
  query,
}: {
  query: UseQueryResult<AssessmentTemplate[], Error>;
}) {
  if (query.isPending) return <LoadingState label="Loading assessments" />;
  if (query.error) return <QueryError error={query.error} />;
  const columns: WorkspaceColumn<AssessmentTemplate>[] = [
    {
      id: "template",
      header: "Template",
      cell: (template) => (
        <span className="font-semibold text-foreground">{template.name}</span>
      ),
    },
    {
      id: "grading",
      header: "Grading system",
      cell: (template) => template.gradingSystem.name,
    },
    {
      id: "term",
      header: "Term",
      cell: (template) => template.termNumber ?? "All terms",
    },
    {
      id: "components",
      header: "Components",
      value: (template) => template.components.length,
      cell: (template) => template.components.length,
    },
  ];
  return (
    <WorkspaceDataTable
      rows={query.data ?? []}
      columns={columns}
      getRowId={(template) => template.id}
      exportTitle="Assessment templates"
      emptyTitle="No assessment templates yet"
      emptyDescription="Active templates configured for your school will appear here."
    />
  );
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
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const classId = selectedClassId || query.data?.[0]?.id || "";
  const attendanceQuery = useQuery({
    queryKey: ["attendance", "class", classId, selectedDate],
    queryFn: () =>
      apiFetch<AttendanceRow[]>(
        `/attendance/class/${classId}?date=${selectedDate}`,
      ),
    enabled: !!classId,
    retry: false,
  });

  if (query.isPending) return <LoadingState label="Loading classes" />;
  if (query.error) return <QueryError error={query.error} />;
  if (!query.data?.length) {
    return (
      <WorkspaceEmptyState
        title="Set up a class to begin attendance"
        description="Attendance records are recorded against a class roster. Create a class and add students first."
      />
    );
  }

  const columns: WorkspaceColumn<AttendanceRow>[] = [
    {
      id: "student",
      header: "Student",
      cell: (row) => (
        <span className="font-semibold text-foreground">{row.name}</span>
      ),
    },
    {
      id: "admission",
      header: "Admission no.",
      cell: (row) => row.admissionNumber,
    },
    {
      id: "attendance",
      header: "Attendance",
      value: (row) => row.attendance?.status ?? "Not recorded",
      cell: (row) =>
        row.attendance ? (
          <StatusBadge value={row.attendance.status} />
        ) : (
          <span className="text-slate-400">Not recorded</span>
        ),
    },
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/80 bg-white p-4">
        <label className="grid gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Class
          <select
            value={classId}
            onChange={(event) => setSelectedClassId(event.target.value)}
            className="h-9 min-w-48 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium normal-case tracking-normal text-slate-700 outline-none focus:border-blue-400"
          >
            {query.data.map((schoolClass) => (
              <option key={schoolClass.id} value={schoolClass.id}>
                {schoolClass.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Date
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium normal-case tracking-normal text-slate-700 outline-none focus:border-blue-400"
          />
        </label>
      </div>
      {attendanceQuery.isPending ? (
        <LoadingState label="Loading attendance" />
      ) : attendanceQuery.error ? (
        <QueryError error={attendanceQuery.error} />
      ) : (
        <WorkspaceDataTable
          rows={attendanceQuery.data ?? []}
          columns={columns}
          getRowId={(row) => row.studentId}
          exportTitle="Class attendance"
          emptyTitle="No students in this class"
          emptyDescription="Add students to this class to record attendance."
        />
      )}
    </>
  );
}

function PaymentEntry() {
  const queryClient = useQueryClient();
  const [studentId, setStudentId] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<RecordPaymentInput["paymentMethod"]>("CASH");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [message, setMessage] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (input: RecordPaymentInput) =>
      apiFetch("/finance/payments", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      setMessage("Payment recorded successfully.");
      await queryClient.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (error: Error) => setMessage(error.message),
  });

  function submitPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const result = recordPaymentSchema.safeParse({
      studentId,
      amount: Number(amount),
      paymentMethod,
      paymentDate,
    });
    if (!result.success) {
      setMessage(
        result.error.issues[0]?.message ?? "Check the payment details.",
      );
      return;
    }
    mutation.mutate(result.data);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.7fr)]">
      <form
        onSubmit={submitPayment}
        className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.025)] sm:p-6"
      >
        <h2 className="text-sm font-semibold text-slate-900">
          Record a payment
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Record a payment against a student account.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <FormField label="Student ID">
            <input
              required
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
              placeholder="Paste the student record ID"
              className={formInputClass}
            />
          </FormField>
          <FormField label="Amount (GHS)">
            <input
              required
              min="0.01"
              step="0.01"
              type="number"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              className={formInputClass}
            />
          </FormField>
          <FormField label="Payment method">
            <select
              value={paymentMethod}
              onChange={(event) =>
                setPaymentMethod(
                  event.target.value as RecordPaymentInput["paymentMethod"],
                )
              }
              className={formInputClass}
            >
              {[
                "CASH",
                "BANK_TRANSFER",
                "CHEQUE",
                "MOBILE_MONEY",
                "CARD",
                "ONLINE",
                "OTHER",
              ].map((method) => (
                <option key={method} value={method}>
                  {method.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Payment date">
            <input
              required
              type="date"
              value={paymentDate}
              onChange={(event) => setPaymentDate(event.target.value)}
              className={formInputClass}
            />
          </FormField>
        </div>
        {message && (
          <p
            role={mutation.isError ? "alert" : "status"}
            className={`mt-4 text-xs ${mutation.isError ? "text-red-600" : "text-emerald-700"}`}
          >
            {message}
          </p>
        )}
        <button
          type="submit"
          disabled={mutation.isPending}
          className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
        >
          {mutation.isPending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          {mutation.isPending ? "Recording…" : "Record payment"}
        </button>
      </form>
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-slate-900">
          Payment history
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Payments can be recorded here. A school-wide payment history endpoint
          is not yet available, so receipts are not listed in this view.
        </p>
        <Link
          to="/$page"
          params={{ page: "fees" }}
          className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-blue-600 hover:text-blue-700"
        >
          Review fee structures <ArrowRight className="size-3.5" />
        </Link>
      </div>
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

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
      {label}
      {children}
    </label>
  );
}

const formInputClass =
  "h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium normal-case tracking-normal text-slate-700 outline-none placeholder:font-normal placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
