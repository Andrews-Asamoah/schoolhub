import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  CircleAlert,
  LoaderCircle,
  Plus,
} from "lucide-react";
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
import { useSession } from "@/lib/auth-client";
import { getSchoolNavItem } from "@/lib/school-navigation";

export const Route = createFileRoute("/$page")({
  component: WorkspaceRoute,
});

interface Student {
  id: string;
  studentId: string;
  admissionNumber: string;
  status: string;
  profile: {
    firstName: string;
    lastName: string;
    otherNames?: string | null;
  };
  class?: { name: string; level: string } | null;
}

interface StudentPage {
  data: Student[];
  meta: { total: number; page: number; totalPages: number };
}

interface SchoolClass {
  id: string;
  name: string;
  level: string;
  capacity?: number | null;
  academicYear?: { name: string; isCurrent: boolean } | null;
  classTeacher?: {
    profile?: { firstName: string; lastName: string } | null;
  } | null;
  _count: { students: number };
}

interface Subject {
  id: string;
  name: string;
  code: string;
  periodsPerWeek: number;
  description?: string | null;
}

interface AcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  terms: { id: string; name: string; termNumber: number }[];
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

  const studentsQuery = useQuery({
    queryKey: ["students", "list", { page: 1, limit: 50 }],
    queryFn: () => apiFetch<StudentPage>("/students?page=1&limit=50"),
    enabled: isSignedIn && pageId === "students",
    retry: false,
  });
  const classesQuery = useQuery({
    queryKey: ["academics", "classes"],
    queryFn: () => apiFetch<SchoolClass[]>("/academics/classes"),
    enabled:
      isSignedIn &&
      ["classes", "attendance"].includes(pageId),
    retry: false,
  });
  const subjectsQuery = useQuery({
    queryKey: ["academics", "subjects"],
    queryFn: () => apiFetch<Subject[]>("/academics/subjects"),
    enabled: isSignedIn && pageId === "subjects",
    retry: false,
  });
  const yearsQuery = useQuery({
    queryKey: ["schools", "academic-years"],
    queryFn: () => apiFetch<AcademicYear[]>("/schools/academic-years"),
    enabled: isSignedIn && pageId === "academic-years",
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
  const titleAction =
    pageId === "students" || pageId === "classes" ? (
      <button
        type="button"
        disabled
        title="Creation form is not part of this release yet"
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white opacity-60"
      >
        <Plus className="size-4" />
        Add {pageId === "students" ? "student" : "class"}
      </button>
    ) : undefined;

  return (
    <>
      <WorkspacePageHeading
        section={page.section}
        title={page.label}
        description={page.description}
        icon={page.icon}
        action={titleAction}
      />

      {!isSignedIn ? (
        <WorkspaceEmptyState
          title="Sign in to view school records"
          description="School information is private. Sign in to load records belonging to your active school."
        />
      ) : (
        <>
          {pageId === "students" && (
            <StudentList query={studentsQuery} />
          )}
          {pageId === "classes" && (
            <ClassList query={classesQuery} />
          )}
          {pageId === "subjects" && (
            <SubjectList query={subjectsQuery} />
          )}
          {pageId === "academic-years" && (
            <AcademicYears query={yearsQuery} />
          )}
          {pageId === "assessments" && (
            <AssessmentList query={assessmentsQuery} />
          )}
          {pageId === "attendance" && (
            <AttendanceWorkspace query={classesQuery} />
          )}
          {pageId === "fees" && <FeeStructureList query={feesQuery} />}
          {pageId === "payments" && <PaymentEntry />}
          {pageId === "settings" && <SchoolSettings query={schoolQuery} />}
          {page.apiStatus === "planned" && (
            <PlannedWorkspace title={page.label} />
          )}
        </>
      )}
    </>
  );
}

function StudentList({
  query,
}: {
  query: UseQueryResult<StudentPage, Error>;
}) {
  if (query.isPending) return <LoadingState label="Loading students" />;
  if (query.error) return <QueryError error={query.error} />;
  const rows = query.data?.data ?? [];
  const columns: WorkspaceColumn<Student>[] = [
    {
      id: "student",
      header: "Student",
      cell: (student) => (
        <span className="font-semibold text-slate-800">
          {student.profile.firstName} {student.profile.lastName}
        </span>
      ),
    },
    {
      id: "admission",
      header: "Admission no.",
      cell: (student) => student.admissionNumber,
    },
    {
      id: "class",
      header: "Class",
      cell: (student) => student.class?.name ?? "Not assigned",
    },
    {
      id: "status",
      header: "Status",
      cell: (student) => <StatusBadge value={student.status} />,
    },
  ];

  return (
    <>
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <WorkspaceStat
          label="Students in directory"
          value={String(query.data?.meta.total ?? 0)}
          detail="all records"
        />
        <WorkspaceStat
          label="On this page"
          value={String(rows.length)}
          detail="student profiles"
        />
        <WorkspaceStat
          label="Directory page"
          value={`${query.data?.meta.page ?? 1} / ${query.data?.meta.totalPages ?? 1}`}
          detail="pagination"
        />
      </div>
      <WorkspaceDataTable
        rows={rows}
        columns={columns}
        getRowId={(student) => student.id}
        emptyTitle="No students yet"
        emptyDescription="Students added to this school will appear here."
      />
      {rows.length > 0 && (
        <p className="mt-3 text-right text-[11px] text-slate-400">
          Showing {rows.length} of {query.data?.meta.total ?? rows.length} students
        </p>
      )}
    </>
  );
}

function ClassList({
  query,
}: {
  query: UseQueryResult<SchoolClass[], Error>;
}) {
  if (query.isPending) return <LoadingState label="Loading classes" />;
  if (query.error) return <QueryError error={query.error} />;
  const rows = query.data ?? [];
  const columns: WorkspaceColumn<SchoolClass>[] = [
    {
      id: "class",
      header: "Class",
      cell: (row) => (
        <span className="font-semibold text-slate-800">{row.name}</span>
      ),
    },
    { id: "level", header: "Level", cell: (row) => row.level },
    {
      id: "year",
      header: "Academic year",
      cell: (row) => row.academicYear?.name ?? "Not assigned",
    },
    {
      id: "students",
      header: "Students",
      cell: (row) => `${row._count.students}${row.capacity ? ` / ${row.capacity}` : ""}`,
    },
    {
      id: "teacher",
      header: "Class teacher",
      cell: (row) =>
        row.classTeacher?.profile
          ? `${row.classTeacher.profile.firstName} ${row.classTeacher.profile.lastName}`
          : "Not assigned",
    },
  ];
  return (
    <WorkspaceDataTable
      rows={rows}
      columns={columns}
      getRowId={(row) => row.id}
      emptyTitle="No classes set up"
      emptyDescription="Create school classes to organize students and lessons."
    />
  );
}

function SubjectList({
  query,
}: {
  query: UseQueryResult<Subject[], Error>;
}) {
  if (query.isPending) return <LoadingState label="Loading subjects" />;
  if (query.error) return <QueryError error={query.error} />;
  const columns: WorkspaceColumn<Subject>[] = [
    {
      id: "subject",
      header: "Subject",
      cell: (subject) => (
        <span className="font-semibold text-slate-800">{subject.name}</span>
      ),
    },
    { id: "code", header: "Code", cell: (subject) => subject.code },
    {
      id: "periods",
      header: "Periods per week",
      cell: (subject) => subject.periodsPerWeek,
    },
    {
      id: "description",
      header: "Description",
      cell: (subject) => subject.description ?? "—",
    },
  ];
  return (
    <WorkspaceDataTable
      rows={query.data ?? []}
      columns={columns}
      getRowId={(subject) => subject.id}
      emptyTitle="No subjects in the catalogue"
      emptyDescription="Add subjects to make them available for classes and assessments."
    />
  );
}

function AcademicYears({
  query,
}: {
  query: UseQueryResult<AcademicYear[], Error>;
}) {
  if (query.isPending) return <LoadingState label="Loading academic years" />;
  if (query.error) return <QueryError error={query.error} />;
  const columns: WorkspaceColumn<AcademicYear>[] = [
    {
      id: "year",
      header: "Academic year",
      cell: (year) => (
        <span className="font-semibold text-slate-800">{year.name}</span>
      ),
    },
    {
      id: "dates",
      header: "School year",
      cell: (year) =>
        `${new Date(year.startDate).toLocaleDateString()} – ${new Date(year.endDate).toLocaleDateString()}`,
    },
    {
      id: "terms",
      header: "Terms",
      cell: (year) => year.terms.length,
    },
    {
      id: "current",
      header: "Status",
      cell: (year) => (
        <StatusBadge value={year.isCurrent ? "CURRENT" : "UPCOMING"} />
      ),
    },
  ];
  return (
    <WorkspaceDataTable
      rows={query.data ?? []}
      columns={columns}
      getRowId={(year) => year.id}
      emptyTitle="No academic years configured"
      emptyDescription="Create an academic year to organize terms, classes, and student records."
    />
  );
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
        <span className="font-semibold text-slate-800">{template.name}</span>
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
      cell: (template) => template.components.length,
    },
  ];
  return (
    <WorkspaceDataTable
      rows={query.data ?? []}
      columns={columns}
      getRowId={(template) => template.id}
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
        <span className="font-semibold text-slate-800">{fee.name}</span>
      ),
    },
    {
      id: "class",
      header: "Applies to",
      cell: (fee) =>
        fee.targetClasses.length > 0
          ? fee.targetClasses.map(({ class: schoolClass }) => schoolClass.name).join(", ")
          : fee.classLevel ?? "All classes",
    },
    { id: "items", header: "Fee items", cell: (fee) => fee.items.length },
    {
      id: "total",
      header: "Structure total",
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
        <span className="font-semibold text-slate-800">{row.name}</span>
      ),
    },
    { id: "admission", header: "Admission no.", cell: (row) => row.admissionNumber },
    {
      id: "attendance",
      header: "Attendance",
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
      setMessage(result.error.issues[0]?.message ?? "Check the payment details.");
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

function SchoolSettings({
  query,
}: {
  query: UseQueryResult<School, Error>;
}) {
  if (query.isPending) return <LoadingState label="Loading school profile" />;
  if (query.error) return <QueryError error={query.error} />;
  const school = query.data;
  if (!school) return null;

  const details = [
    ["School name", school.name],
    ["School code", school.code],
    ["Subdomain", school.subdomain],
    ["Email", school.email ?? "Not set"],
    ["Phone", school.phone ?? "Not set"],
    ["Address", school.address ?? "Not set"],
    ["Motto", school.motto ?? "Not set"],
    ["Website", school.website ?? "Not set"],
  ];

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6">
      <h2 className="text-sm font-semibold text-slate-900">School profile</h2>
      <p className="mt-1 text-xs text-slate-500">
        Current details for your active school.
      </p>
      <dl className="mt-5 grid gap-x-8 sm:grid-cols-2">
        {details.map(([label, value]) => (
          <div
            key={label}
            className="border-b border-slate-100 py-3 first:pt-0"
          >
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {label}
            </dt>
            <dd className="mt-1 text-xs font-medium text-slate-700">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-5 text-[11px] text-slate-400">
        Editing school details will be available in a future update.
      </p>
    </div>
  );
}

function PlannedWorkspace({ title }: { title: string }) {
  return (
    <>
      <PreviewDataNotice>
        This section is part of the school workspace roadmap. Its menu entry
        and page are ready, but the API does not yet provide these records.
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
