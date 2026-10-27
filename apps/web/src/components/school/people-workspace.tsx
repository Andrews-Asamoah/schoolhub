import { DatePicker } from "@/components/ui/date-picker";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CheckCircle2,
  Eye,
  Filter,
  GraduationCap,
  LoaderCircle,
  Mail,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { Children, isValidElement, useDeferredValue, useState, type ReactNode } from "react";
import type { IssuedCredentials } from "@schoolhub/shared";
import {
  CredentialsDialog,
  type CredentialEntry,
} from "@/components/credentials/credentials-dialog";
import {
  createGuardianSchema,
  createStaffSchema,
  createTeacherSchema,
  updateGuardianSchema,
  updateStaffSchema,
  updateTeacherSchema,
  type CreateGuardianInput,
  type CreateStaffInput,
  type CreateTeacherInput,
} from "@schoolhub/shared";
import {
  WorkspaceDataTable,
  WorkspaceStat,
  type WorkspaceColumn,
} from "@/components/school/workspace-ui";
import { useSchoolRole } from "@/components/school/school-role-switcher";
import { TeacherBiodataDialog } from "@/components/school/teacher-biodata-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { StaffBulkImport } from "@/components/school/staff-bulk-import";

type PeopleKind = "teachers" | "staff" | "guardians";
type Values = {
  firstName: string;
  lastName: string;
  otherNames: string;
  staffId: string;
  staffNumber: string;
  createLogin: boolean;
  email: string;
  phone: string;
  gender: string;
  dateOfBirth: string;
  departmentId: string;
  qualification: string;
  specialization: string;
  experience: string;
  staffType: string;
  jobTitle: string;
  employmentType: string;
  hireDate: string;
  relationshipType: string;
  alternatePhone: string;
  occupation: string;
  employer: string;
  studentIds: string[];
};

interface DirectoryPage<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

interface Department {
  id: string;
  name: string;
}

interface SchoolClass {
  id: string;
  name: string;
  level: string;
  isActive: boolean;
}

interface StudentOption {
  id: string;
  admissionNumber: string | null;
  status: string;
  profile: { firstName: string; lastName: string };
  class: { id: string; name: string; level: string } | null;
}

interface Teacher {
  id: string;
  teacherId: string;
  firstName: string | null;
  lastName: string | null;
  invitationEmail: string | null;
  isActive: boolean;
  staffNumber?: string | null;
  qualification?: string | null;
  specialization?: string | null;
  experience?: number | null;
  employmentType?: string;
  hireDate?: string;
  department: Department;
  profile: {
    firstName: string;
    lastName: string;
    phone: string | null;
    gender?: string | null;
    dateOfBirth?: string | null;
    user: { email: string } | null;
  } | null;
}

interface Staff {
  id: string;
  staffId: string;
  staffType: string;
  jobTitle: string | null;
  isActive: boolean;
  staffNumber?: string | null;
  employmentType?: string;
  hireDate?: string;
  department: Department | null;
  profile: {
    firstName: string;
    lastName: string;
    phone: string | null;
    gender?: string | null;
    dateOfBirth?: string | null;
    user: { email: string };
  };
}

interface Guardian {
  id: string;
  guardianId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  relationshipType: string;
  isActive: boolean;
  otherNames?: string | null;
  alternatePhone?: string | null;
  gender?: string | null;
  occupation?: string | null;
  employer?: string | null;
  residentialAddress?: string | null;
  city?: string | null;
  region?: string | null;
  canLogin?: boolean;
  profile?: { user: { email: string } } | null;
  students: {
    student: {
      id: string;
      admissionNumber: string | null;
      profile: { firstName: string; lastName: string };
    };
  }[];
}

interface Row {
  id: string;
  publicId: string;
  name: string;
  detail: string;
  contact: string;
  department: string;
  relatedStudents: string;
  isActive: boolean;
  hasLogin?: boolean;
}

const inputClasses =
  "mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20";
const staffTypes = [
  "ACCOUNTANT",
  "HEADTEACHER",
  "ADMIN",
  "LIBRARIAN",
  "DRIVER",
  "SECURITY",
  "NURSE",
  "COUNSELOR",
  "IT_SUPPORT",
  "RECEPTIONIST",
  "COOK",
  "CLEANER",
  "OTHER",
];
const employmentTypes = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "TEMPORARY",
  "INTERN",
];
const relationships = [
  "FATHER",
  "MOTHER",
  "GRANDFATHER",
  "GRANDMOTHER",
  "GUARDIAN",
  "SIBLING",
  "RELATIVE",
  "OTHER",
];

function initialValues(): Values {
  return {
    firstName: "",
    lastName: "",
    otherNames: "",
    staffId: "",
    staffNumber: "",
    createLogin: false,
    email: "",
    phone: "",
    gender: "MALE",
    dateOfBirth: "",
    departmentId: "",
    qualification: "",
    specialization: "",
    experience: "",
    staffType: "OTHER",
    jobTitle: "",
    employmentType: "FULL_TIME",
    hireDate: new Date().toISOString().slice(0, 10),
    relationshipType: "GUARDIAN",
    alternatePhone: "",
    occupation: "",
    employer: "",
    studentIds: [],
  };
}

export function PeopleWorkspace({ kind }: { kind: PeopleKind }) {
  const queryClient = useQueryClient();
  const { activeRole } = useSchoolRole();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [viewing, setViewing] = useState<{ id: string; name: string } | null>(null);
  const [confirmingLogin, setConfirmingLogin] = useState<{ id: string; name: string; hasLogin: boolean } | null>(null);
  const [issued, setIssued] = useState<CredentialEntry[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search.trim());
  const isGuardianPage = kind === "guardians";
  const canManage =
    ["owner", "admin", "headteacher"].includes(activeRole ?? "") ||
    (isGuardianPage && activeRole === "staff");
  const title =
    kind === "teachers"
      ? "Teachers"
      : isGuardianPage
        ? "Guardians"
        : "Non-teaching staff";
  const resourceName =
    kind === "teachers"
      ? "teacher"
      : isGuardianPage
        ? "guardian"
        : "staff member";

  const directoryQuery = useQuery({
    queryKey: [
      "people",
      kind,
      isGuardianPage ? { activeFilter } : { page, search: deferredSearch, activeFilter },
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: isGuardianPage ? "1" : String(page),
        limit: isGuardianPage ? "100" : "20",
      });
      if (!isGuardianPage && deferredSearch) params.set("search", deferredSearch);
      if (activeFilter) params.set("active", activeFilter);

      if (!isGuardianPage) {
        return apiFetch<DirectoryPage<Teacher | Staff | Guardian>>(
          `/people/${kind}?${params.toString()}`,
        );
      }

      // The API caps page size at 100. Fetch every guardian page so the
      // directory table can search and paginate across the complete record set.
      const firstPage = await apiFetch<DirectoryPage<Guardian>>(
        `/people/guardians?${params.toString()}`,
      );
      const remainingPages = await Promise.all(
        Array.from(
          { length: Math.max(0, firstPage.meta.totalPages - 1) },
          (_, index) => {
            const pageParams = new URLSearchParams(params);
            pageParams.set("page", String(index + 2));
            return apiFetch<DirectoryPage<Guardian>>(
              `/people/guardians?${pageParams.toString()}`,
            );
          },
        ),
      );
      const allGuardians = [
        ...firstPage.data,
        ...remainingPages.flatMap((result) => result.data),
      ];
      return {
        data: allGuardians,
        meta: { ...firstPage.meta, page: 1, limit: allGuardians.length, totalPages: 1 },
      } satisfies DirectoryPage<Teacher | Staff | Guardian>;
    },
    retry: false,
  });
  const departmentsQuery = useQuery({
    queryKey: ["academics", "departments"],
    queryFn: () => apiFetch<Department[]>("/academics/departments"),
    enabled: showForm && (kind === "teachers" || kind === "staff"),
    retry: false,
  });
  const classesQuery = useQuery({
    queryKey: ["academics", "classes"],
    queryFn: () => apiFetch<SchoolClass[]>("/academics/classes"),
    enabled: showForm && isGuardianPage,
    retry: false,
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiFetch(`/people/${kind}/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["people", kind] });
    },
  });
  const resetLoginMutation = useMutation({
    mutationFn: ({ id }: { id: string; name: string }) =>
      apiFetch<IssuedCredentials>(
        `/accounts/people/${kind === "teachers" ? "teacher" : kind === "staff" ? "staff" : "guardian"}/${id}/credentials`,
        { method: "POST" },
      ),
    onSuccess: async (credentials, variables) => {
      // Held in component state only, never in the query cache.
      setIssued([{ label: variables.name, credentials }]);
      await queryClient.invalidateQueries({ queryKey: ["people", kind] });
    },
  });
  const createMutation = useMutation({
    mutationFn: (values: Values) => {
      if (editing) {
        return apiFetch<{ credentials?: IssuedCredentials | null; linkedExistingAccount?: boolean }>(
          `/people/${kind}/${editing.id}`,
          {
            method: "PATCH",
            body: JSON.stringify(makeUpdatePayload(kind, values)),
          },
        );
      }
      const body = makePayload(kind, values);
      return apiFetch<{ credentials?: IssuedCredentials | null; linkedExistingAccount?: boolean }>(`/people/${kind}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: async (created, values) => {
      setNotice(
        !editing && created.linkedExistingAccount
          ? `${values.firstName} ${values.lastName} already has an account at this school. It now also has this role, and they keep signing in with their own password. No new password was created.`
          : null,
      );
      if (!editing && created.credentials) {
        setIssued([
          {
            label: `${values.firstName} ${values.lastName}`.trim(),
            credentials: created.credentials,
          },
        ]);
      }
      setShowForm(false);
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ["people", kind] });
      if (isGuardianPage) {
        await queryClient.invalidateQueries({ queryKey: ["students"] });
      }
    },
  });

  // The form library re-applies `defaultValues` on every render while the form is
  // untouched. They must therefore follow whatever the form was last reset to
  // (blank for "Add", the person's details for "Edit"); passing a fresh blank
  // object each render would wipe the prefilled edit values.
  const [formDefaults, setFormDefaults] = useState<Values>(initialValues);
  const form = useForm({
    defaultValues: formDefaults,
    onSubmit: async ({ value }) => {
      createMutation.reset();
      createMutation.mutate(value);
    },
  });

  if (directoryQuery.isPending) {
    return <Loading label={`Loading ${title.toLowerCase()}`} />;
  }
  if (directoryQuery.error) {
    return <ErrorPanel message={directoryQuery.error.message} />;
  }
  const people = directoryQuery.data?.data ?? [];
  const rows: Row[] = people.map((person) => toRow(person));
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const total = directoryQuery.data?.meta.total ?? 0;
  const activeCount = rows.filter((row) => row.isActive).length;
  const columns: WorkspaceColumn<Row>[] = [
    {
      id: "person",
      header: "Name",
      cell: (row) => (
        <span className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UserRound className="size-4" />
          </span>
          <span>
            <span className="block font-semibold text-foreground">
              {row.name}
            </span>
            <span className="block text-[11px] text-muted-foreground">
              {row.publicId}
            </span>
          </span>
        </span>
      ),
    },
    {
      id: "details",
      header: isGuardianPage ? "Relationship" : "Role",
      cell: (row) =>
        isGuardianPage ? (
          <span className="inline-flex items-center rounded-lg border border-primary/15 bg-primary/5 px-2.5 py-1 text-xs font-medium text-foreground">
            {row.detail}
          </span>
        ) : (
          row.detail
        ),
    },
    ...(!isGuardianPage
      ? [
          {
            id: "department",
            header: "Department",
            cell: (row: Row) => row.department || "—",
          },
        ]
      : []),
    {
      id: "contact",
      header: "Contact",
      cell: (row) => {
        if (isGuardianPage) {
          const [phone, email] = row.contact.split(" · ");
          return (
            <span className="flex min-w-0 flex-col gap-1.5">
              <span className="flex items-center gap-2 text-sm text-foreground">
                <Phone className="size-3.5 shrink-0 text-muted-foreground" />
                <span>{phone || "No phone number"}</span>
              </span>
              {email && (
                <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                  <Mail className="size-3.5 shrink-0" />
                  <span className="max-w-[240px] truncate">{email}</span>
                </span>
              )}
              {row.relatedStudents && (
                <span className="flex items-start gap-1.5 pt-0.5 text-[11px] text-muted-foreground">
                  <GraduationCap className="mt-0.5 size-3.5 shrink-0" />
                  <span className="max-w-[260px] leading-4">Linked students: {row.relatedStudents}</span>
                </span>
              )}
            </span>
          );
        }
        return (
          <span>
            <span className="block">{row.contact || "—"}</span>
            {row.relatedStudents && (
              <span className="block text-[11px] text-muted-foreground">
                Students: {row.relatedStudents}
              </span>
            )}
          </span>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => (
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            row.isActive
              ? "bg-success/10 text-success"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {row.isActive ? "Active" : "Inactive"}
        </span>
      ),
    },
    ...(kind === "teachers" || isGuardianPage
      ? [
          {
            id: "view",
            header: "",
            className: "w-24 text-right",
            cell: (row: Row) => (
              <button
                type="button"
                onClick={() => setViewing({ id: row.id, name: row.name })}
                aria-label={`View details for ${row.name}`}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
              >
                <Eye className="size-3.5" />
                View
              </button>
            ),
          } satisfies WorkspaceColumn<Row>,
        ]
      : []),
    ...(canManage
      ? [
          {
            id: "action",
            header: "",
            className: "w-64 text-right",
            cell: (row: Row) => (
              <span className="inline-flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    const person = peopleById.get(row.id);
                    if (!person) return;
                    createMutation.reset();
                    const personValues = valuesFromPerson(person);
                    setFormDefaults(personValues);
                    form.reset(personValues);
                    setEditing({ id: row.id, name: row.name });
                    setShowForm(true);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="rounded-md px-2 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={resetLoginMutation.isPending}
                  onClick={() =>
                    setConfirmingLogin({
                      id: row.id,
                      name: row.name,
                      hasLogin: row.hasLogin ?? true,
                    })
                  }
                  className="rounded-md px-2 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
                >
                  {isGuardianPage && !row.hasLogin ? "Create login" : "Reset login"}
                </button>
                <button
                  type="button"
                  disabled={statusMutation.isPending}
                  onClick={() =>
                    statusMutation.mutate({ id: row.id, isActive: !row.isActive })
                  }
                  className="rounded-md px-2 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
                >
                  {row.isActive ? "Deactivate" : "Reactivate"}
                </button>
              </span>
            ),
          } satisfies WorkspaceColumn<Row>,
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <ConfirmDialog
        open={confirmingLogin !== null}
        title={
          confirmingLogin && isGuardianPage && !confirmingLogin.hasLogin
            ? "Create guardian login?"
            : "Reset login credentials?"
        }
        description={
          confirmingLogin && isGuardianPage && !confirmingLogin.hasLogin
            ? `Create a parent-portal login for ${confirmingLogin.name}. A temporary password will be generated and shown once after creation.`
            : `Issue a new temporary password for ${confirmingLogin?.name ?? "this person"}? Their current password will stop working and they will be signed out.`
        }
        confirmLabel={
          confirmingLogin && isGuardianPage && !confirmingLogin.hasLogin
            ? "Create login"
            : "Reset login"
        }
        confirmVariant={confirmingLogin && isGuardianPage && !confirmingLogin.hasLogin ? "primary" : "danger"}
        loading={resetLoginMutation.isPending}
        onCancel={() => setConfirmingLogin(null)}
        onConfirm={() => {
          if (!confirmingLogin) return;
          resetLoginMutation.mutate(
            { id: confirmingLogin.id, name: confirmingLogin.name },
            { onSettled: () => setConfirmingLogin(null) },
          );
        }}
      />
      {viewing && kind === "teachers" && (
        <TeacherBiodataDialog teacherId={viewing.id} fallbackName={viewing.name} onClose={() => setViewing(null)} />
      )}
      {viewing && isGuardianPage && peopleById.get(viewing.id) && (
        <GuardianDetailsDialog
          guardian={peopleById.get(viewing.id) as Guardian}
          onClose={() => setViewing(null)}
        />
      )}
      <section
        className={`relative isolate overflow-hidden rounded-2xl border p-5 shadow-sm sm:p-6 ${
          isGuardianPage
            ? "border-primary/20 bg-gradient-to-br from-primary/15 via-card to-highlight/10 dark:from-primary/20 dark:via-card"
            : "border-border bg-gradient-to-br from-primary/10 via-card to-info/5"
        }`}
      >
        {isGuardianPage && (
          <>
            <span aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 size-48 rounded-full bg-primary/10 blur-3xl" />
            <span aria-hidden="true" className="pointer-events-none absolute -bottom-20 right-36 size-36 rounded-full bg-highlight/10 blur-3xl" />
          </>
        )}
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary shadow-sm">
              <UsersRound className="size-5" />
            </span>
            <div className="max-w-3xl">
              {isGuardianPage && (
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                  Family & student connections
                </p>
              )}
              <h2 className="text-lg font-bold tracking-tight text-foreground">
                {title} directory
              </h2>
              <p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted-foreground">
                {kind === "teachers"
                  ? "Manage teaching personnel and their school department. Teachers are not duplicated in the non-teaching Staff directory."
                  : isGuardianPage
                    ? "Keep guardian contacts, linked students and parent-portal access organised in one place."
                    : "Manage non-teaching employees, departments, and operational roles. Teaching personnel are managed separately under Teachers."}
              </p>
            </div>
          </div>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              {(kind === "teachers" || kind === "staff") && (
                <button type="button" onClick={() => setShowBulkImport(true)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-xs font-semibold text-foreground hover:bg-muted">
                  <UsersRound className="size-4" /> Bulk upload
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  createMutation.reset();
                  const blank = initialValues();
                  setFormDefaults(blank);
                  form.reset(blank);
                  setEditing(null);
                  setShowForm((value) => !value);
                }}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Plus className="size-4" />
                Add {resourceName}
              </button>
            </div>
          )}
        </div>
      </section>

      {showBulkImport && canManage && (kind === "teachers" || kind === "staff") && (
        <StaffBulkImport
          kind={kind === "teachers" ? "teacher" : "staff"}
          onClose={() => setShowBulkImport(false)}
          onComplete={() => void queryClient.invalidateQueries({ queryKey: ["people", kind] })}
        />
      )}

      {showForm && canManage && (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-5">
            <h3 className="text-sm font-bold text-foreground">
              {editing ? `Edit ${editing.name}` : `Add ${resourceName}`}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {kind === "staff"
                ? "A staff profile is created without a password or sign-in invitation."
                : isGuardianPage
                  ? "Linking students here creates family relationships only; it does not grant portal access."
                  : "A teacher profile can be invited to sign in later through school team management."}
            </p>
          </div>
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void form.handleSubmit();
            }}
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <form.Field name="firstName">
                {(field) => (
                  <TextField
                    label="First name"
                    required
                    value={field.state.value}
                    onChange={(value) => field.handleChange(value)}
                  />
                )}
              </form.Field>
              <form.Field name="lastName">
                {(field) => (
                  <TextField
                    label="Last name"
                    required
                    value={field.state.value}
                    onChange={(value) => field.handleChange(value)}
                  />
                )}
              </form.Field>
              {isGuardianPage && (
                <form.Field name="otherNames">
                  {(field) => (
                    <TextField
                      label="Other names"
                      value={field.state.value}
                      onChange={(value) => field.handleChange(value)}
                    />
                  )}
                </form.Field>
              )}
              {kind === "teachers" && (
                <>
                  <form.Field name="staffNumber">
                    {(field) => (
                      <TextField
                        label="Staff number (optional)"
                        value={field.state.value}
                        onChange={(value) => field.handleChange(value)}
                      />
                    )}
                  </form.Field>
                  <form.Field name="email">
                    {(field) => (
                      <TextField
                        label="Sign-in email"
                        required
                        type="email"
                        value={field.state.value}
                        onChange={(value) => field.handleChange(value)}
                      />
                    )}
                  </form.Field>
                  <form.Field name="qualification">
                    {(field) => (
                      <TextField
                        label="Qualification"
                        value={field.state.value}
                        onChange={(value) => field.handleChange(value)}
                      />
                    )}
                  </form.Field>
                  <form.Field name="specialization">
                    {(field) => (
                      <TextField
                        label="Specialization"
                        value={field.state.value}
                        onChange={(value) => field.handleChange(value)}
                      />
                    )}
                  </form.Field>
                  <form.Field name="experience">
                    {(field) => (
                      <TextField
                        label="Years of experience"
                        type="number"
                        value={field.state.value}
                        onChange={(value) => field.handleChange(value)}
                      />
                    )}
                  </form.Field>
                  <form.Field name="departmentId">
                    {(field) => (
                      <SelectField
                        label="Department"
                        required
                        value={field.state.value}
                        onChange={(value) => field.handleChange(value)}
                      >
                        <option value="">Choose a department</option>
                        {(departmentsQuery.data ?? []).map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.name}
                          </option>
                        ))}
                      </SelectField>
                    )}
                  </form.Field>
                  <form.Field name="employmentType">
                    {(field) => (
                      <SelectField
                        label="Employment type"
                        value={field.state.value}
                        onChange={(value) => field.handleChange(value)}
                      >
                        {employmentTypes.map((value) => (
                          <option key={value} value={value}>
                            {formatLabel(value)}
                          </option>
                        ))}
                      </SelectField>
                    )}
                  </form.Field>
                  <form.Field name="hireDate">
                    {(field) => (
                      <TextField
                        label="Hire date"
                        type="date"
                        required
                        value={field.state.value}
                        onChange={(value) => field.handleChange(value)}
                      />
                    )}
                  </form.Field>
                </>
              )}
              {kind === "staff" && (
                <>
                  <form.Field name="email">
                    {(field) => (
                      <TextField
                        label="Email"
                        type="email"
                        required
                        value={field.state.value}
                        onChange={(value) => field.handleChange(value)}
                      />
                    )}
                  </form.Field>
                  <form.Field name="phone">
                    {(field) => (
                      <TextField
                        label="Phone"
                        type="tel"
                        required
                        value={field.state.value}
                        onChange={(value) => field.handleChange(value)}
                      />
                    )}
                  </form.Field>
                  <form.Field name="gender">
                    {(field) => (
                      <SelectField
                        label="Gender"
                        required
                        value={field.state.value}
                        onChange={(value) => field.handleChange(value)}
                      >
                        <option value="MALE">Male</option>
                        <option value="FEMALE">Female</option>
                        <option value="OTHER">Other</option>
                      </SelectField>
                    )}
                  </form.Field>
                  <form.Field name="dateOfBirth">
                    {(field) => (
                      <TextField
                        label="Date of birth"
                        type="date"
                        required
                        value={field.state.value}
                        onChange={(value) => field.handleChange(value)}
                      />
                    )}
                  </form.Field>
                  <form.Field name="staffType">
                    {(field) => (
                      <SelectField
                        label="Staff type"
                        required
                        value={field.state.value}
                        onChange={(value) => field.handleChange(value)}
                      >
                        {staffTypes.map((value) => (
                          <option key={value} value={value}>
                            {formatLabel(value)}
                          </option>
                        ))}
                      </SelectField>
                    )}
                  </form.Field>
                  <form.Field name="jobTitle">
                    {(field) => (
                      <TextField
                        label="Job title"
                        value={field.state.value}
                        onChange={(value) => field.handleChange(value)}
                      />
                    )}
                  </form.Field>
                  <form.Field name="departmentId">
                    {(field) => (
                      <SelectField
                        label="Department"
                        value={field.state.value}
                        onChange={(value) => field.handleChange(value)}
                      >
                        <option value="">No department</option>
                        {(departmentsQuery.data ?? []).map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.name}
                          </option>
                        ))}
                      </SelectField>
                    )}
                  </form.Field>
                  <form.Field name="employmentType">
                    {(field) => (
                      <SelectField
                        label="Employment type"
                        value={field.state.value}
                        onChange={(value) => field.handleChange(value)}
                      >
                        {employmentTypes.map((value) => (
                          <option key={value} value={value}>
                            {formatLabel(value)}
                          </option>
                        ))}
                      </SelectField>
                    )}
                  </form.Field>
                  <form.Field name="hireDate">
                    {(field) => (
                      <TextField
                        label="Hire date"
                        type="date"
                        required
                        value={field.state.value}
                        onChange={(value) => field.handleChange(value)}
                      />
                    )}
                  </form.Field>
                </>
              )}
              {isGuardianPage && (
                <>
                  <form.Field name="phone">
                    {(field) => (
                      <TextField
                        label="Phone"
                        type="tel"
                        required
                        value={field.state.value}
                        onChange={(value) => field.handleChange(value)}
                      />
                    )}
                  </form.Field>
                  <form.Field name="alternatePhone">
                    {(field) => (
                      <TextField
                        label="Alternate phone"
                        type="tel"
                        value={field.state.value}
                        onChange={(value) => field.handleChange(value)}
                      />
                    )}
                  </form.Field>
                  <form.Field name="email">
                    {(field) => (
                      <TextField
                        label="Email"
                        type="email"
                        value={field.state.value}
                        onChange={(value) => field.handleChange(value)}
                      />
                    )}
                  </form.Field>
                  <form.Field name="createLogin">
                    {(field) => editing ? null : (
                      <label className="flex items-start gap-2 text-xs text-foreground sm:col-span-2">
                        <input
                          type="checkbox"
                          checked={field.state.value}
                          onChange={(event) => field.handleChange(event.target.checked)}
                          className="mt-0.5 size-4 rounded border-border"
                        />
                        <span>
                          <span className="font-semibold">Create parent-portal login</span>
                          <span className="block text-muted-foreground">
                            If no contact email is entered, a sign-in email is generated
                            using the school's domain. A temporary password is shown once;
                            the guardian must change it at first sign-in.
                          </span>
                        </span>
                      </label>
                    )}
                  </form.Field>
                  <form.Field name="relationshipType">
                    {(field) => (
                      <SelectField
                        label="Relationship"
                        required
                        value={field.state.value}
                        onChange={(value) => field.handleChange(value)}
                      >
                        {relationships.map((value) => (
                          <option key={value} value={value}>
                            {formatLabel(value)}
                          </option>
                        ))}
                      </SelectField>
                    )}
                  </form.Field>
                  <form.Field name="occupation">
                    {(field) => (
                      <TextField
                        label="Occupation"
                        value={field.state.value}
                        onChange={(value) => field.handleChange(value)}
                      />
                    )}
                  </form.Field>
                  <form.Field name="employer">
                    {(field) => (
                      <TextField
                        label="Employer"
                        value={field.state.value}
                        onChange={(value) => field.handleChange(value)}
                      />
                    )}
                  </form.Field>
                  {editing && (
                    <p className="text-[11px] text-muted-foreground sm:col-span-2">
                      Search below to link more children to this parent. Existing links are kept.
                    </p>
                  )}
                  <form.Field name="studentIds">
                    {(field) => (
                      <StudentSearchPicker
                        classes={classesQuery.data ?? []}
                        value={field.state.value}
                        onChange={(value) => field.handleChange(value)}
                      />
                    )}
                  </form.Field>
                </>
              )}
            </div>
            {(departmentsQuery.error || classesQuery.error) && (
              <ErrorPanel
                message={
                  departmentsQuery.error?.message ??
                  classesQuery.error?.message ??
                  "The form options could not be loaded."
                }
              />
            )}
            {(createMutation.error || statusMutation.error) && (
              <ErrorPanel
                message={
                  (createMutation.error ?? statusMutation.error)?.message ??
                  "The request failed."
                }
              />
            )}
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                }}
                className="h-9 rounded-lg border border-border px-4 text-xs font-semibold text-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-60"
              >
                {createMutation.isPending && (
                  <LoaderCircle className="size-3.5 animate-spin" />
                )}
                {editing ? "Save changes" : `Save ${resourceName}`}
              </button>
            </div>
          </form>
        </section>
      )}

      <div className={`grid gap-3 sm:grid-cols-3 ${isGuardianPage ? "xl:gap-4" : ""}`}>
        <WorkspaceStat
          label={isGuardianPage ? "Total guardians" : "Directory records"}
          value={String(total)}
          detail={isGuardianPage ? "in the directory" : "matching filters"}
          icon={UsersRound}
        />
        <WorkspaceStat
          label={isGuardianPage ? "Active guardians" : "Active on this page"}
          value={String(activeCount)}
          detail={isGuardianPage ? "active records" : title.toLowerCase()}
          icon={CheckCircle2}
        />
        <WorkspaceStat
          label={isGuardianPage ? "Portal access" : "Page"}
          value={isGuardianPage ? String(rows.filter((row) => row.hasLogin).length) : String(directoryQuery.data?.meta.page ?? 1) + " / " + String(directoryQuery.data?.meta.totalPages || 1)}
          detail={isGuardianPage ? "guardians with a login" : "directory pagination"}
          icon={isGuardianPage ? ShieldCheck : undefined}
        />
      </div>

      <section className={`rounded-2xl border border-border bg-card/80 p-4 shadow-sm backdrop-blur-sm ${isGuardianPage ? "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" : "grid gap-3 md:grid-cols-[minmax(220px,1fr)_180px]"}`}>
        {!isGuardianPage && (
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder={`Search ${title.toLowerCase()} by name, ID or contact`}
              aria-label={`Search ${title.toLowerCase()}`}
              className={`${inputClasses} mt-0 pl-9`}
            />
          </label>
        )}
        {isGuardianPage && (
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Filter className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">Filter guardians</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Narrow the directory by account status</p>
            </div>
          </div>
        )}
        <label className={isGuardianPage ? "w-full sm:w-52" : ""}>
          <span className="sr-only">Filter by status</span>
          <Select value={activeFilter || "__all__"} onValueChange={(value) => {
            setActiveFilter(value === "__all__" ? "" : value);
            setPage(1);
          }}>
            <SelectTrigger aria-label="Filter by status" className={`${inputClasses} mt-0 ${isGuardianPage ? "sm:h-11 sm:px-3" : ""}`}><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All statuses</SelectItem>
              <SelectItem value="true">Active</SelectItem>
              <SelectItem value="false">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </label>
      </section>

      {(statusMutation.error || resetLoginMutation.error) && !showForm && (
        <ErrorPanel
          message={(statusMutation.error ?? resetLoginMutation.error)!.message}
        />
      )}
      <CredentialsDialog entries={issued} onClose={() => setIssued([])} />
      {notice && (
        <p role="status" className="flex items-start justify-between gap-3 rounded-xl border border-success/20 bg-success/10 px-4 py-3 text-xs text-success">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="font-semibold underline-offset-2 hover:underline">Dismiss</button>
        </p>
      )}
      <WorkspaceDataTable
        rows={rows}
        columns={columns}
        getRowId={(row) => row.id}
        exportTitle={title}
        emptyTitle={`No ${title.toLowerCase()} match these filters`}
        emptyDescription={`Clear a filter or add a ${resourceName} to build the directory.`}
      />
      {!isGuardianPage && (directoryQuery.data?.meta.totalPages ?? 0) > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Page {directoryQuery.data?.meta.page} of{" "}
            {directoryQuery.data?.meta.totalPages} · {total} records
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
              disabled={page >= (directoryQuery.data?.meta.totalPages ?? 1)}
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

function isoDay(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function valuesFromPerson(person: Teacher | Staff | Guardian): Values {
  const base = initialValues();
  if ("teacherId" in person) {
    return {
      ...base,
      firstName: person.firstName || person.profile?.firstName || "",
      lastName: person.lastName || person.profile?.lastName || "",
      staffNumber: person.staffNumber ?? "",
      email: person.profile?.user?.email ?? person.invitationEmail ?? "",
      phone: person.profile?.phone ?? "",
      gender: person.profile?.gender ?? "",
      dateOfBirth: isoDay(person.profile?.dateOfBirth),
      departmentId: person.department.id,
      qualification: person.qualification ?? "",
      specialization: person.specialization ?? "",
      experience: person.experience != null ? String(person.experience) : "",
      employmentType: person.employmentType ?? "FULL_TIME",
      hireDate: isoDay(person.hireDate) || base.hireDate,
    };
  }
  if ("staffId" in person) {
    return {
      ...base,
      firstName: person.profile.firstName,
      lastName: person.profile.lastName,
      email: person.profile.user.email,
      phone: person.profile.phone ?? "",
      gender: person.profile.gender ?? "MALE",
      dateOfBirth: isoDay(person.profile.dateOfBirth),
      staffId: person.staffId,
      staffNumber: person.staffNumber ?? "",
      staffType: person.staffType,
      departmentId: person.department?.id ?? "",
      jobTitle: person.jobTitle ?? "",
      employmentType: person.employmentType ?? "FULL_TIME",
      hireDate: isoDay(person.hireDate) || base.hireDate,
    };
  }
  return {
    ...base,
    firstName: person.firstName,
    lastName: person.lastName,
    otherNames: person.otherNames ?? "",
    email: person.email ?? person.profile?.user?.email ?? "",
    phone: person.phone,
    alternatePhone: person.alternatePhone ?? "",
    gender: person.gender ?? "",
    relationshipType: person.relationshipType,
    occupation: person.occupation ?? "",
    employer: person.employer ?? "",
  };
}

/** Edit payloads are validated with the update schemas (no create-only fields). */
function makeUpdatePayload(kind: PeopleKind, values: Values) {
  if (kind === "teachers") {
    return updateTeacherSchema.parse({
      firstName: values.firstName,
      lastName: values.lastName,
      staffNumber: values.staffNumber,
      email: values.email,
      phone: values.phone,
      gender: values.gender || undefined,
      dateOfBirth: values.dateOfBirth,
      departmentId: values.departmentId,
      qualification: values.qualification,
      specialization: values.specialization,
      experience: values.experience ? Number(values.experience) : undefined,
      employmentType: values.employmentType,
      hireDate: values.hireDate,
    });
  }
  if (kind === "staff") {
    return updateStaffSchema.parse({
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email,
      phone: values.phone,
      gender: values.gender,
      dateOfBirth: values.dateOfBirth,
      staffNumber: values.staffNumber,
      staffType: values.staffType,
      departmentId: values.departmentId,
      jobTitle: values.jobTitle,
      employmentType: values.employmentType,
      hireDate: values.hireDate,
    });
  }
  return updateGuardianSchema.parse({
    firstName: values.firstName,
    lastName: values.lastName,
    otherNames: values.otherNames,
    phone: values.phone,
    alternatePhone: values.alternatePhone,
    email: values.email,
    gender: values.gender || undefined,
    relationshipType: values.relationshipType,
    occupation: values.occupation,
    employer: values.employer,
    addStudentIds: values.studentIds.length ? values.studentIds : undefined,
  });
}

function makePayload(kind: PeopleKind, values: Values) {
  if (kind === "teachers") {
    const payload: CreateTeacherInput = createTeacherSchema.parse({
      ...values,
      experience: values.experience ? Number(values.experience) : undefined,
    });
    return payload;
  }
  if (kind === "staff") {
    const payload: CreateStaffInput = createStaffSchema.parse(values);
    return payload;
  }
  const payload: CreateGuardianInput = createGuardianSchema.parse(values);
  return payload;
}

function toRow(person: Teacher | Staff | Guardian): Row {
  if ("teacherId" in person) {
    const teacher = person;
    const firstName = teacher.firstName || teacher.profile?.firstName || "";
    const lastName = teacher.lastName || teacher.profile?.lastName || "";
    return {
      id: teacher.id,
      publicId: teacher.teacherId,
      name: `${firstName} ${lastName}`.trim(),
      detail: "Teacher",
      contact: [
        teacher.invitationEmail || teacher.profile?.user?.email,
        teacher.profile?.phone,
      ]
        .filter(Boolean)
        .join(" · "),
      department: teacher.department.name,
      relatedStudents: "",
      isActive: teacher.isActive,
    };
  }
  if ("staffId" in person) {
    const staff = person;
    return {
      id: staff.id,
      publicId: staff.staffId,
      name: `${staff.profile.firstName} ${staff.profile.lastName}`,
      detail: staff.jobTitle || formatLabel(staff.staffType),
      contact: [staff.profile.user.email, staff.profile.phone]
        .filter(Boolean)
        .join(" · "),
      department: staff.department?.name ?? "",
      relatedStudents: "",
      isActive: staff.isActive,
    };
  }
  const guardian = person;
  return {
    id: guardian.id,
    publicId: guardian.guardianId,
    name: `${guardian.firstName} ${guardian.lastName}`,
    detail: formatLabel(guardian.relationshipType),
    contact: guardian.email
      ? `${guardian.phone} · ${guardian.email}`
      : guardian.phone,
    department: "",
    relatedStudents: guardian.students
      .map(
        ({ student }) =>
          `${student.profile.firstName} ${student.profile.lastName}`,
      )
      .join(", "),
    isActive: guardian.isActive,
    hasLogin: guardian.canLogin ?? Boolean(guardian.profile?.user.email),
  };
}

function TextField({
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
      {type === "date" ? (
        <DatePicker value={value} onChange={onChange} required={required}
          ariaLabel={label} buttonClassName={inputClasses} />
      ) : (
        <input
          type={type}
          value={value}
          required={required}
          min={type === "number" ? 0 : undefined}
          onChange={(event) => onChange(event.target.value)}
          className={inputClasses}
        />
      )}
    </label>
  );
}

function SelectField({
  label,
  required = false,
  children,
  value,
  onChange,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
  value: string;
  onChange: (value: string) => void;
}) {
  const options = Children.toArray(children)
    .filter(isValidElement)
    .map((child, index) => {
      const option = child as React.ReactElement<{
        value?: string;
        disabled?: boolean;
        children?: ReactNode;
      }>;
      const rawValue = String(option.props.value ?? "");
      return {
        key: `${rawValue || "empty"}-${index}`,
        value: rawValue || "__none__",
        label: option.props.children,
        disabled: option.props.disabled ?? false,
      };
    });

  return (
    <label className="text-xs font-semibold text-foreground">
      {label}
      {required ? " *" : ""}
      <Select value={value || "__none__"} onValueChange={(nextValue) => onChange(nextValue === "__none__" ? "" : nextValue)} required={required}>
        <SelectTrigger aria-label={label} className={inputClasses}><SelectValue placeholder={label} /></SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.key} value={option.value} disabled={option.disabled}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function StudentSearchPicker({
  classes,
  value,
  onChange,
}: {
  classes: SchoolClass[];
  value: string[];
  onChange: (values: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [classId, setClassId] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [selected, setSelected] = useState<StudentOption[]>([]);
  const studentsQuery = useQuery({
    queryKey: [
      "students",
      "guardian-picker",
      { search: deferredSearch, classId },
    ],
    queryFn: () => {
      const params = new URLSearchParams({
        page: "1",
        limit: "20",
        status: "ACTIVE",
      });
      if (deferredSearch.length >= 2) params.set("search", deferredSearch);
      if (classId) params.set("classId", classId);
      return apiFetch<DirectoryPage<StudentOption>>(`/students?${params}`);
    },
    enabled:
      deferredSearch.length >= 2 || (deferredSearch.length === 0 && !!classId),
    retry: false,
  });
  const selectedIds = new Set(value);

  function addStudent(student: StudentOption) {
    if (selectedIds.has(student.id)) return;
    setSelected((current) => [...current, student]);
    onChange([...value, student.id]);
  }

  function removeStudent(studentId: string) {
    setSelected((current) =>
      current.filter((student) => student.id !== studentId),
    );
    onChange(value.filter((id) => id !== studentId));
  }

  return (
    <div
      role="group"
      aria-labelledby="guardian-student-picker-label"
      className="text-xs font-semibold text-foreground sm:col-span-2 lg:col-span-3"
    >
      <p id="guardian-student-picker-label">Link students (optional)</p>
      <span className="mt-1 block font-normal text-muted-foreground">
        Search by student name or narrow the list by class. You can select
        multiple students.
      </span>
      <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px]">
        <span className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Type at least 2 characters"
            aria-label="Search students by name or admission number"
            className={`${inputClasses} mt-0 pl-9`}
          />
        </span>
        <span className="relative">
          <Select value={classId || "__all__"} onValueChange={(value) => setClassId(value === "__all__" ? "" : value)}>
            <SelectTrigger aria-label="Filter students by class" className={`${inputClasses} mt-0`}><SelectValue placeholder="All current classes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All current classes</SelectItem>
              {classes.filter((schoolClass) => schoolClass.isActive).map((schoolClass) => (
                <SelectItem key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </span>
      </div>
      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {selected.map((student) => (
            <span
              key={student.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary"
            >
              {student.profile.firstName} {student.profile.lastName}
              <button
                type="button"
                onClick={() => removeStudent(student.id)}
                aria-label={`Remove ${student.profile.firstName} ${student.profile.lastName}`}
                className="rounded-full p-0.5 hover:bg-primary/15"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div
        className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-border bg-background"
        aria-live="polite"
      >
        {studentsQuery.isFetching ? (
          <p className="flex items-center gap-2 px-3 py-3 text-xs font-normal text-muted-foreground">
            <LoaderCircle className="size-3.5 animate-spin" />
            Searching students…
          </p>
        ) : studentsQuery.error ? (
          <p
            role="alert"
            className="px-3 py-3 text-xs font-normal text-destructive"
          >
            {studentsQuery.error.message}
          </p>
        ) : deferredSearch.length === 1 ? (
          <p className="px-3 py-3 text-xs font-normal text-muted-foreground">
            Type one more character to search by name.
          </p>
        ) : deferredSearch.length < 2 && !classId ? (
          <p className="px-3 py-3 text-xs font-normal text-muted-foreground">
            Type at least 2 characters or choose a class to find students.
          </p>
        ) : studentsQuery.data?.data.length ? (
          studentsQuery.data.data.map((student) => {
            const isSelected = selectedIds.has(student.id);
            return (
              <button
                key={student.id}
                type="button"
                disabled={isSelected}
                onClick={() => addStudent(student)}
                className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2.5 text-left last:border-b-0 hover:bg-muted disabled:cursor-default disabled:bg-primary/5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-foreground">
                    {student.profile.firstName} {student.profile.lastName}
                  </span>
                  <span className="block truncate text-[11px] font-normal text-muted-foreground">
                    {student.class?.name ?? "Not placed this term"}
                    {student.admissionNumber
                      ? ` · ${student.admissionNumber}`
                      : ""}
                  </span>
                </span>
                {isSelected && (
                  <Check className="size-4 shrink-0 text-primary" />
                )}
              </button>
            );
          })
        ) : (
          <p className="px-3 py-3 text-xs font-normal text-muted-foreground">
            No active students match this search and class.
          </p>
        )}
      </div>
    </div>
  );
}

function formatLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function Loading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin" />
      {label}…
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
    >
      {message}
    </div>
  );
}


function GuardianDetailsDialog({
  guardian,
  onClose,
}: {
  guardian: Guardian;
  onClose: () => void;
}) {
  const fullName = [guardian.firstName, guardian.otherNames, guardian.lastName]
    .filter(Boolean)
    .join(" ");
  const loginEmail = guardian.profile?.user.email;
  const students = guardian.students.map(({ student }) => ({
    id: student.id,
    name: [student.profile.firstName, student.profile.lastName].filter(Boolean).join(" "),
    admissionNumber: student.admissionNumber,
  }));

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/50 p-4"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="guardian-details-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Guardian record</p>
            <h2 id="guardian-details-title" className="mt-1 text-lg font-bold">{fullName}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{guardian.guardianId}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close guardian details" className="rounded-lg p-2 text-muted-foreground hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <GuardianDetail label="Relationship" value={guardian.relationshipType} />
          <GuardianDetail label="Status" value={guardian.isActive ? "Active" : "Inactive"} />
          <GuardianDetail label="Phone" value={guardian.phone} />
          <GuardianDetail label="Alternate phone" value={guardian.alternatePhone} />
          <GuardianDetail label="Contact email" value={guardian.email} />
          <GuardianDetail label="Login email" value={loginEmail} />
          <GuardianDetail label="Gender" value={guardian.gender} />
          <GuardianDetail label="Occupation" value={guardian.occupation} />
          <GuardianDetail label="Employer" value={guardian.employer} />
          <GuardianDetail label="City" value={guardian.city} />
          <GuardianDetail label="Region" value={guardian.region} />
          <GuardianDetail label="Residential address" value={guardian.residentialAddress} />
        </div>

        <div className="mt-5 rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold">Linked students ({students.length})</h3>
          {students.length ? (
            <ul className="mt-2 divide-y divide-border">
              {students.map((student) => (
                <li key={student.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="font-medium">{student.name}</span>
                  <span className="text-xs text-muted-foreground">{student.admissionNumber || "No admission number"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No students are linked to this guardian.</p>
          )}
        </div>

        {!guardian.canLogin && (
          <p className="mt-4 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
            This guardian does not currently have a parent-portal login. Use Reset login in the directory to create one.
          </p>
        )}
        {(loginEmail?.endsWith("@login.schoolhub.invalid") ||
          /-g\d{4}@/i.test(loginEmail ?? "")) && (
          <p className="mt-2 text-xs text-muted-foreground">
            This is a generated sign-in email for the parent portal. The guardian should use it with their password to sign in; it may not be a separately monitored mailbox.
          </p>
        )}
        <div className="mt-5 flex justify-end">
          <button type="button" onClick={onClose} className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-xs font-semibold hover:bg-muted">
            Close
          </button>
        </div>
      </section>
    </div>
  );
}

function GuardianDetail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/40 px-3 py-2.5">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-medium">{value || "—"}</p>
    </div>
  );
}
