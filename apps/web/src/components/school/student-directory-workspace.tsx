import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleAlert,
  Check,
  LoaderCircle,
  Plus,
  Search,
  SquarePen,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useState } from "react";
import {
  createStudentSchema,
  updateStudentRecordSchema,
  type CreateStudentInput,
  type IssuedCredentials,
  type StudentGuardianInput,
  type UpdateStudentInput,
} from "@schoolhub/shared";
import {
  WorkspaceDataTable,
  WorkspaceEmptyState,
  WorkspaceStat,
  type WorkspaceColumn,
} from "@/components/school/workspace-ui";
import { useSchoolRole } from "@/components/school/school-role-switcher";
import { apiFetch } from "@/lib/api";
import {
  CredentialsDialog,
  type CredentialEntry,
} from "@/components/credentials/credentials-dialog";

interface Student {
  id: string;
  studentId: string;
  admissionNumber: string | null;
  status: StudentStatus;
  profile: {
    firstName: string;
    lastName: string;
    otherNames: string | null;
    gender: string;
    dateOfBirth: string;
    phone: string | null;
  };
  class: { id: string; name: string; level: string } | null;
  department?: { id: string; name: string } | null;
  house?: { id: string; name: string } | null;
  guardians?: {
    guardian: {
      id: string;
      firstName: string;
      lastName: string;
      phone: string;
    };
  }[];
}

type StudentStatus =
  | "ACTIVE"
  | "GRADUATED"
  | "WITHDRAWN"
  | "SUSPENDED"
  | "TRANSFERRED"
  | "EXPELLED"
  | "DECEASED";

interface StudentFormValues extends CreateStudentInput {
  status: StudentStatus;
}

interface GuardianDraft extends StudentGuardianInput {
  key: string;
}

interface StudentPage {
  data: Student[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

interface SchoolClass {
  id: string;
  name: string;
  level?: string;
  isActive: boolean;
  departmentId?: string | null;
  capacity?: number | null;
  _count?: { students: number };
}

interface DepartmentOption {
  id: string;
  name: string;
  code: string;
}

interface HouseOption {
  id: string;
  name: string;
  color: string | null;
  isActive: boolean;
}

const emptyStudent: CreateStudentInput = {
  firstName: "",
  lastName: "",
  otherNames: "",
  gender: "MALE",
  dateOfBirth: "",
  departmentId: "",
  classId: "",
  houseId: "",
  nationality: "Ghanaian",
  residentialAddress: "",
  city: "",
  region: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  emergencyRelationship: "",
  bloodGroup: "",
  allergies: "",
  medicalConditions: "",
  guardians: [],
};

const inputClasses =
  "mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20";
const statuses = [
  "ACTIVE",
  "SUSPENDED",
  "GRADUATED",
  "WITHDRAWN",
  "TRANSFERRED",
  "EXPELLED",
  "DECEASED",
] as const;

export function StudentDirectoryWorkspace() {
  const queryClient = useQueryClient();
  const { activeRole } = useSchoolRole();
  const canManage = ["owner", "admin", "headmistress", "staff"].includes(
    activeRole ?? "",
  );
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [classId, setClassId] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Student | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [issued, setIssued] = useState<CredentialEntry[]>([]);
  const resetLoginMutation = useMutation({
    mutationFn: ({ id }: { id: string; name: string }) =>
      apiFetch<IssuedCredentials>(`/accounts/people/student/${id}/credentials`, {
        method: "POST",
      }),
    // Held in component state only, never in the query cache.
    onSuccess: (credentials, variables) =>
      setIssued([{ label: `${variables.name} (student)`, credentials }]),
  });
  const periodKey =
    typeof window === "undefined"
      ? ""
      : (window.sessionStorage.getItem("schoolhub-accountant-academic-view") ??
        "");
  const classesQuery = useQuery({
    queryKey: ["academics", "classes"],
    queryFn: () => apiFetch<SchoolClass[]>("/academics/classes"),
    retry: false,
  });
  const departmentsQuery = useQuery({
    queryKey: ["academics", "departments"],
    queryFn: () => apiFetch<DepartmentOption[]>("/academics/departments"),
    enabled: canManage,
    retry: false,
  });
  const housesQuery = useQuery({
    queryKey: ["academics", "houses"],
    queryFn: () => apiFetch<HouseOption[]>("/academics/houses"),
    enabled: canManage,
    retry: false,
  });
  const studentsQuery = useQuery({
    queryKey: [
      "students",
      "directory",
      { search, status, classId, page, periodKey },
    ],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (search.trim()) params.set("search", search.trim());
      if (status) params.set("status", status);
      if (classId) params.set("classId", classId);
      return apiFetch<StudentPage>(`/students?${params.toString()}`);
    },
    retry: false,
  });

  function openCreate() {
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(student: Student) {
    setEditing(student);
    setShowForm(true);
  }

  const columns: WorkspaceColumn<Student>[] = [
    {
      id: "name",
      header: "Student",
      value: (student) =>
        `${student.profile.firstName} ${student.profile.lastName}${student.profile.otherNames ? ` ${student.profile.otherNames}` : ""} (${student.studentId})`,
      cell: (student) => (
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            {student.profile.firstName.slice(0, 1)}
            {student.profile.lastName.slice(0, 1)}
          </span>
          <span className="min-w-0">
            <span className="block font-semibold text-foreground">
              {student.profile.firstName} {student.profile.lastName}
              {student.profile.otherNames
                ? ` ${student.profile.otherNames}`
                : ""}
            </span>
            <span className="block text-[11px] text-muted-foreground">
              {student.studentId}
            </span>
          </span>
        </div>
      ),
    },
    {
      id: "admission",
      header: "Admission no.",
      cell: (student) => student.admissionNumber ?? "—",
    },
    {
      id: "class",
      header: "Current class",
      cell: (student) => student.class?.name ?? "Not enrolled this term",
    },
    {
      id: "guardian",
      header: "Primary guardian",
      cell: (student) => {
        const guardian = student.guardians?.[0]?.guardian;
        return guardian
          ? `${guardian.firstName} ${guardian.lastName}`
          : "Not linked";
      },
    },
    {
      id: "status",
      header: "Status",
      value: (student) => student.status,
      cell: (student) => <StudentStatusBadge status={student.status} />,
    },
    ...(canManage
      ? [
          {
            id: "actions",
            header: "",
            className: "w-44 text-right",
            cell: (student: Student) => (
              <span className="inline-flex gap-1">
                {["owner", "admin", "headmistress"].includes(activeRole ?? "") && (
                  <button
                    type="button"
                    disabled={resetLoginMutation.isPending}
                    onClick={() => {
                      const name = `${student.profile.firstName} ${student.profile.lastName}`;
                      if (
                        window.confirm(
                          `Issue a new temporary password for ${name}? Their current password will stop working and they will be signed out.`,
                        )
                      ) {
                        resetLoginMutation.mutate({ id: student.id, name });
                      }
                    }}
                    className="rounded-md px-2 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
                  >
                    Reset login
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => openEdit(student)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
                  aria-label={`Edit ${student.profile.firstName} ${student.profile.lastName}`}
                >
                  <SquarePen className="size-3.5" />
                  Edit
                </button>
              </span>
            ),
          } satisfies WorkspaceColumn<Student>,
        ]
      : []),
  ];

  if (
    studentsQuery.isPending ||
    classesQuery.isPending ||
    (canManage && housesQuery.isPending)
  ) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" />
        Loading student directory…
      </div>
    );
  }
  if (studentsQuery.error) {
    return <PeopleError message={studentsQuery.error.message} />;
  }
  if (classesQuery.error) {
    return (
      <PeopleError
        message={`Class filters could not be loaded: ${classesQuery.error.message}`}
      />
    );
  }
  if (canManage && housesQuery.error) {
    return (
      <PeopleError
        message={`Houses could not be loaded: ${housesQuery.error.message}`}
      />
    );
  }

  const rows = studentsQuery.data?.data ?? [];
  const total = studentsQuery.data?.meta.total ?? 0;
  const activeCount = rows.filter(
    (student) => student.status === "ACTIVE",
  ).length;
  const needsEnrollment = rows.filter(
    (student) => student.status === "ACTIVE" && !student.class,
  ).length;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-sky-500/5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <UserRound className="size-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-foreground">
                Student directory
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                Manage student identity, admission details, contacts, and
                lifecycle status. Current class is derived from the active term;
                use Enrollments to place or move students between classes and
                review placement history.
              </p>
            </div>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90"
            >
              <Plus className="size-4" />
              Add student
            </button>
          )}
        </div>
      </section>

      {showForm && canManage && (
        <StudentEditor
          key={editing?.id ?? "new"}
          student={editing}
          classes={classesQuery.data ?? []}
          departments={departmentsQuery.data ?? []}
          houses={housesQuery.data ?? []}
          onIssued={setIssued}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSaved={async () => {
            setShowForm(false);
            setEditing(null);
            await queryClient.invalidateQueries({ queryKey: ["students"] });
          }}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <WorkspaceStat
          label="Directory records"
          value={String(total)}
          detail="matching filters"
        />
        <WorkspaceStat
          label="Active on this page"
          value={String(activeCount)}
          detail="student profiles"
        />
        <WorkspaceStat
          label="Needs placement"
          value={String(needsEnrollment)}
          detail="active, no current class"
        />
      </div>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_180px_200px]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search name or admission number"
              aria-label="Search students"
              className={`${inputClasses} mt-0 pl-9`}
            />
          </label>
          <label>
            <span className="sr-only">Filter by status</span>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className={`${inputClasses} mt-0`}
            >
              <option value="">All statuses</option>
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {formatStatus(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Filter by current class</span>
            <select
              value={classId}
              onChange={(event) => {
                setClassId(event.target.value);
                setPage(1);
              }}
              className={`${inputClasses} mt-0`}
            >
              <option value="">All current classes</option>
              {(classesQuery.data ?? []).map((schoolClass) => (
                <option key={schoolClass.id} value={schoolClass.id}>
                  {schoolClass.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <CredentialsDialog entries={issued} onClose={() => setIssued([])} />
      {resetLoginMutation.error && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {resetLoginMutation.error.message}
        </p>
      )}
      <WorkspaceDataTable
        rows={rows}
        columns={columns}
        getRowId={(student) => student.id}
        exportTitle="Student directory"
        emptyTitle="No students match these filters"
        emptyDescription="Clear a filter or add a student record to start building your school directory."
      />
      {studentsQuery.data && studentsQuery.data.meta.totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Page {studentsQuery.data.meta.page} of{" "}
            {studentsQuery.data.meta.totalPages} · {total} records
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= studentsQuery.data.meta.totalPages}
              onClick={() => setPage((value) => value + 1)}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StudentEditor({
  student,
  classes,
  departments,
  houses,
  onCancel,
  onSaved,
  onIssued,
}: {
  student: Student | null;
  classes: SchoolClass[];
  departments: DepartmentOption[];
  houses: HouseOption[];
  onIssued: (entries: CredentialEntry[]) => void;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [guardians, setGuardians] = useState<GuardianDraft[]>([]);
  const mutation = useMutation({
    mutationFn: async (values: StudentFormValues) => {
      const payload = student
        ? updateStudentRecordSchema.parse(values)
        : createStudentSchema.parse(values);
      return apiFetch<
        Student & {
          credentials?: IssuedCredentials;
          guardianCredentials?: {
            name: string;
            credentials: IssuedCredentials | null;
          }[];
        }
      >(
        student ? `/students/${student.id}` : "/students",
        {
          method: student ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
    },
    onSuccess: async (saved) => {
      if (saved.credentials) {
        const name = `${saved.profile.firstName} ${saved.profile.lastName}`;
        onIssued([
          { label: `${name} (student)`, credentials: saved.credentials },
          ...(saved.guardianCredentials ?? [])
            .filter((g) => g.credentials)
            .map((g) => ({
              label: `${g.name} (guardian of ${name})`,
              credentials: g.credentials!,
            })),
        ]);
      }
      await onSaved();
      await queryClient.invalidateQueries({ queryKey: ["academics"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  const defaultValues: StudentFormValues = student
    ? {
        ...emptyStudent,
        firstName: student.profile.firstName,
        lastName: student.profile.lastName,
        otherNames: student.profile.otherNames ?? "",
        gender: student.profile.gender as CreateStudentInput["gender"],
        dateOfBirth: student.profile.dateOfBirth.slice(0, 10),
        departmentId: student.department?.id ?? "",
        houseId: student.house?.id ?? "",
        status: student.status,
      }
    : { ...emptyStudent, status: "ACTIVE" };
  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      mutation.reset();
      mutation.mutate({
        ...value,
        guardians: guardians.map(({ key: _key, ...guardian }) => guardian),
      });
    },
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-foreground">
            {student ? "Edit student record" : "Add a student"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {student
              ? "Class placement is per term: change a student's class in the Enrollments workspace."
              : "Choose a department and class to place the student now. The student automatically inherits the subjects linked to that class."}
            {!student &&
              " Admission numbers are generated as SCHOOLCODE + two-digit year + four-digit sequence (for example, ABC260001)."}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close student form"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
        >
          <X className="size-4" />
        </button>
      </div>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <form.Field name="firstName">
            {(field) => (
              <StudentTextField
                label="First name"
                required
                value={field.state.value}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
          <form.Field name="lastName">
            {(field) => (
              <StudentTextField
                label="Last name"
                required
                value={field.state.value}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
          <form.Field name="otherNames">
            {(field) => (
              <StudentTextField
                label="Other names"
                value={field.state.value ?? ""}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
          <form.Field name="gender">
            {(field) => (
              <label className="text-xs font-semibold text-foreground">
                Gender
                <select
                  className={inputClasses}
                  value={field.state.value}
                  onChange={(event) =>
                    field.handleChange(
                      event.target.value as CreateStudentInput["gender"],
                    )
                  }
                >
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
            )}
          </form.Field>
          <form.Field name="dateOfBirth">
            {(field) => (
              <StudentTextField
                label="Date of birth"
                type="date"
                required
                value={field.state.value}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
          <form.Field name="nationality">
            {(field) => (
              <StudentTextField
                label="Nationality"
                value={field.state.value ?? ""}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
          <form.Field name="residentialAddress">
            {(field) => (
              <StudentTextField
                label="Residential address"
                value={field.state.value ?? ""}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
          <form.Field name="city">
            {(field) => (
              <StudentTextField
                label="City"
                value={field.state.value ?? ""}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
          <form.Field name="region">
            {(field) => (
              <StudentTextField
                label="Region"
                value={field.state.value ?? ""}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
          <form.Field name="emergencyContactName">
            {(field) => (
              <StudentTextField
                label="Emergency contact"
                value={field.state.value ?? ""}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
          <form.Field name="emergencyContactPhone">
            {(field) => (
              <StudentTextField
                label="Emergency phone"
                value={field.state.value ?? ""}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
          <form.Field name="emergencyRelationship">
            {(field) => (
              <StudentTextField
                label="Emergency relationship"
                value={field.state.value ?? ""}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
          <form.Field name="bloodGroup">
            {(field) => (
              <StudentTextField
                label="Blood group"
                value={field.state.value ?? ""}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
          <form.Field name="allergies">
            {(field) => (
              <StudentTextField
                label="Allergies"
                value={field.state.value ?? ""}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
          <form.Field name="medicalConditions">
            {(field) => (
              <StudentTextField
                label="Medical conditions"
                value={field.state.value ?? ""}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
          <form.Field name="departmentId">
            {(field) => (
              <label className="text-xs font-semibold text-foreground">
                Department
                <select
                  className={inputClasses}
                  value={field.state.value ?? ""}
                  onChange={(event) => {
                    field.handleChange(event.target.value);
                    // A class that sits in another department no longer applies.
                    const chosen = classes.find(
                      (c) => c.id === form.getFieldValue("classId"),
                    );
                    if (
                      chosen?.departmentId &&
                      event.target.value &&
                      chosen.departmentId !== event.target.value
                    ) {
                      form.setFieldValue("classId", "");
                    }
                  }}
                >
                  <option value="">No department</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </form.Field>
          {!student && (
            <form.Subscribe selector={(state) => state.values.departmentId}>
              {(departmentId) => (
                <form.Field name="classId">
                  {(field) => {
                    const options = classes.filter(
                      (c) =>
                        c.isActive &&
                        (!departmentId ||
                          !c.departmentId ||
                          c.departmentId === departmentId),
                    );
                    return (
                      <label className="text-xs font-semibold text-foreground">
                        Class (current term)
                        <select
                          className={inputClasses}
                          value={field.state.value ?? ""}
                          onChange={(event) => {
                            field.handleChange(event.target.value);
                            const picked = classes.find(
                              (c) => c.id === event.target.value,
                            );
                            // Picking a class fills in its department.
                            if (picked?.departmentId && !departmentId) {
                              form.setFieldValue(
                                "departmentId",
                                picked.departmentId,
                              );
                            }
                          }}
                        >
                          <option value="">Place in a class later</option>
                          {options.map((c) => {
                            const full =
                              c.capacity != null &&
                              (c._count?.students ?? 0) >= c.capacity;
                            return (
                              <option key={c.id} value={c.id} disabled={full}>
                                {c.name}
                                {c.capacity != null
                                  ? ` (${c._count?.students ?? 0}/${c.capacity}${full ? ", full" : ""})`
                                  : ""}
                              </option>
                            );
                          })}
                        </select>
                      </label>
                    );
                  }}
                </form.Field>
              )}
            </form.Subscribe>
          )}
          <form.Field name="houseId">
            {(field) => (
              <label className="text-xs font-semibold text-foreground">
                House (optional)
                <select
                  className={inputClasses}
                  value={field.state.value ?? ""}
                  onChange={(event) => field.handleChange(event.target.value)}
                >
                  <option value="">No house assigned</option>
                  {houses
                    .filter(
                      (house) =>
                        house.isActive || house.id === student?.house?.id,
                    )
                    .map((house) => (
                      <option key={house.id} value={house.id}>
                        {house.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </form.Field>
          {student && (
            <label className="text-xs font-semibold text-foreground">
              Student status
              <select
                className={inputClasses}
                value={
                  (form.getFieldValue("status" as never) as string) ??
                  student.status
                }
                onChange={(event) =>
                  form.setFieldValue(
                    "status" as never,
                    event.target.value as never,
                  )
                }
              >
                {statuses.map((value) => (
                  <option key={value} value={value}>
                    {formatStatus(value)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {student ? (
          <div className="mt-4 rounded-lg border border-border bg-muted/40 px-3 py-2">
            <p className="text-[11px] font-medium text-muted-foreground">
              Admission number · generated on admission and not editable
            </p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">
              {student.admissionNumber ?? "Not assigned"}
            </p>
          </div>
        ) : (
          <section className="mt-6 rounded-xl border border-border bg-muted/20 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-foreground">
                  Parents and guardians
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add one or more contacts now. One contact must be marked as
                  the primary guardian.
                </p>
              </div>
              <button
                type="button"
                disabled={guardians.length >= 10}
                onClick={() =>
                  setGuardians((current) => [
                    ...current,
                    createGuardianDraft(current.length === 0),
                  ])
                }
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
              >
                <Plus className="size-3.5" />
                Add guardian
              </button>
            </div>
            {guardians.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                No guardian added yet. You can also create and link guardians
                later from the Guardians page.
              </p>
            ) : (
              <div className="space-y-3">
                {guardians.map((guardian, index) => (
                  <GuardianDraftEditor
                    key={guardian.key}
                    guardian={guardian}
                    index={index}
                    onChange={(next) =>
                      setGuardians((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? next : item,
                        ),
                      )
                    }
                    onRemove={() =>
                      setGuardians((current) => {
                        const remaining = current.filter(
                          (_, itemIndex) => itemIndex !== index,
                        );
                        if (
                          guardian.isPrimary &&
                          remaining.length > 0 &&
                          !remaining.some((item) => item.isPrimary)
                        ) {
                          const firstRemaining = remaining[0];
                          if (firstRemaining) {
                            remaining[0] = {
                              ...firstRemaining,
                              isPrimary: true,
                            };
                          }
                        }
                        return remaining;
                      })
                    }
                    onMakePrimary={() =>
                      setGuardians((current) =>
                        current.map((item, itemIndex) => ({
                          ...item,
                          isPrimary: itemIndex === index,
                        })),
                      )
                    }
                  />
                ))}
              </div>
            )}
          </section>
        )}
        {mutation.error && (
          <p
            role="alert"
            className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          >
            <CircleAlert className="size-4" /> {mutation.error.message}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-lg border border-border px-3 text-xs font-semibold text-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {mutation.isPending ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
            {student ? "Save changes" : "Create student"}
          </button>
        </div>
      </form>
    </section>
  );
}

function StudentTextField({
  label,
  type = "text",
  required = false,
  value,
  onChange,
}: {
  label: string;
  type?: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs font-semibold text-foreground">
      {label}
      {required ? " *" : ""}
      <input
        type={type}
        required={required}
        className={inputClasses}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function createGuardianDraft(isPrimary: boolean): GuardianDraft {
  return {
    key: crypto.randomUUID(),
    firstName: "",
    lastName: "",
    otherNames: "",
    phone: "",
    alternatePhone: "",
    email: "",
    relationshipType: "GUARDIAN",
    occupation: "",
    employer: "",
    residentialAddress: "",
    city: "",
    region: "",
    isPrimary,
    createLogin: false,
  };
}

function GuardianDraftEditor({
  guardian,
  index,
  onChange,
  onRemove,
  onMakePrimary,
}: {
  guardian: GuardianDraft;
  index: number;
  onChange: (guardian: GuardianDraft) => void;
  onRemove: () => void;
  onMakePrimary: () => void;
}) {
  function update<K extends keyof StudentGuardianInput>(
    key: K,
    value: StudentGuardianInput[K],
  ) {
    onChange({ ...guardian, [key]: value });
  }

  return (
    <fieldset className="rounded-xl border border-border bg-card p-4">
      <legend className="px-1 text-xs font-bold text-foreground">
        Guardian {index + 1}
      </legend>
      <div className="mb-3 flex justify-end gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onMakePrimary}
            aria-pressed={guardian.isPrimary}
            className={`inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11px] font-semibold ${
              guardian.isPrimary
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {guardian.isPrimary && <Check className="size-3.5" />}
            {guardian.isPrimary ? "Primary guardian" : "Make primary"}
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove guardian ${index + 1}`}
            className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StudentTextField
          label="First name"
          required
          value={guardian.firstName}
          onChange={(value) => update("firstName", value)}
        />
        <StudentTextField
          label="Last name"
          required
          value={guardian.lastName}
          onChange={(value) => update("lastName", value)}
        />
        <StudentTextField
          label="Other names"
          value={guardian.otherNames ?? ""}
          onChange={(value) => update("otherNames", value)}
        />
        <label className="text-xs font-semibold text-foreground">
          Relationship *
          <select
            required
            value={guardian.relationshipType}
            onChange={(event) =>
              update(
                "relationshipType",
                event.target.value as StudentGuardianInput["relationshipType"],
              )
            }
            className={inputClasses}
          >
            <option value="FATHER">Father</option>
            <option value="MOTHER">Mother</option>
            <option value="GUARDIAN">Guardian</option>
            <option value="GRANDFATHER">Grandfather</option>
            <option value="GRANDMOTHER">Grandmother</option>
            <option value="SIBLING">Sibling</option>
            <option value="RELATIVE">Relative</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <StudentTextField
          label="Phone"
          type="tel"
          required
          value={guardian.phone}
          onChange={(value) => update("phone", value)}
        />
        <StudentTextField
          label="Alternate phone"
          type="tel"
          value={guardian.alternatePhone ?? ""}
          onChange={(value) => update("alternatePhone", value)}
        />
        <StudentTextField
          label="Email"
          type="email"
          value={guardian.email ?? ""}
          onChange={(value) => update("email", value)}
        />
        <label className="flex items-start gap-2 text-xs text-foreground sm:col-span-2 lg:col-span-3">
          <input
            type="checkbox"
            checked={guardian.createLogin}
            disabled={!guardian.email}
            onChange={(event) => update("createLogin", event.target.checked)}
            className="mt-0.5 size-4 rounded border-border"
          />
          <span>
            <span className="font-semibold">Create parent-portal login</span>
            <span className="block text-muted-foreground">
              {guardian.email
                ? "A temporary password is shown once after saving; the guardian must change it at first sign-in."
                : "Enter an email address to enable this."}
            </span>
          </span>
        </label>
        <StudentTextField
          label="Occupation"
          value={guardian.occupation ?? ""}
          onChange={(value) => update("occupation", value)}
        />
        <StudentTextField
          label="Employer"
          value={guardian.employer ?? ""}
          onChange={(value) => update("employer", value)}
        />
      </div>
    </fieldset>
  );
}

function StudentStatusBadge({ status }: { status: string }) {
  const active = status === "ACTIVE";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${active ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}
    >
      {formatStatus(status)}
    </span>
  );
}

function formatStatus(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function PeopleError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-semibold">Student directory could not be loaded</p>
        <p className="mt-1 text-xs">{message}</p>
      </div>
    </div>
  );
}
