import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import {
  ArrowUpRight,
  BookOpenCheck,
  Building2,
  Check,
  CalendarClock,
  CircleAlert,
  GraduationCap,
  Pencil,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  createClassSchema,
  createClassTeacherAssignmentSchema,
  createDepartmentSchema,
  type CreateClassInput,
  type CreateClassTeacherAssignmentInput,
  type CreateDepartmentInput,
  type UpdateClassInput,
} from "@schoolhub/shared";
import {
  FormField,
  FormInput,
  FormSelect,
  FormSubmitButton,
} from "@/components/forms/form-controls";
import { useSchoolRole } from "@/components/school/school-role-switcher";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { canExportTables } from "@/lib/table-export-policy";
import { apiFetch } from "@/lib/api";

interface DepartmentOption {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  _count: { classes: number };
}

interface TeacherOption {
  id: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
}

interface ClassRecord {
  id: string;
  name: string;
  level: string;
  capacity?: number | null;
  isActive: boolean;
  isGraduatingClass: boolean;
  academicYearId?: string | null;
  classTeacherId?: string | null;
  department?: { id: string; name: string; code: string } | null;
  classTeacher?: {
    firstName?: string | null;
    lastName?: string | null;
    profile?: { firstName: string; lastName: string } | null;
  } | null;
  _count: { students: number };
}

interface ClassTeacherAssignment {
  id: string;
  teacherId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  teacher: {
    firstName?: string | null;
    lastName?: string | null;
    profile?: { firstName: string; lastName: string } | null;
  };
}

interface ClassesWorkspaceProps {
  classesQuery: UseQueryResult<ClassRecord[], Error>;
  departmentsQuery: UseQueryResult<DepartmentOption[], Error>;
  teachersQuery: UseQueryResult<TeacherOption[], Error>;
}

const controlClasses =
  "h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20";

export function ClassesWorkspace({
  classesQuery,
  departmentsQuery,
  teachersQuery,
}: ClassesWorkspaceProps) {
  const queryClient = useQueryClient();
  const { activeRole } = useSchoolRole();
  const canManage = activeRole === "owner" || activeRole === "admin";
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [showClassForm, setShowClassForm] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassRecord | null>(null);
  const [managingTeacherClass, setManagingTeacherClass] = useState<ClassRecord | null>(null);
  const [showDepartmentForm, setShowDepartmentForm] = useState(false);

  const classMutation = useMutation({
    mutationFn: (input: CreateClassInput) =>
      apiFetch<ClassRecord>("/academics/classes", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["academics", "classes"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setShowClassForm(false);
    },
  });
  const updateClassMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateClassInput }) =>
      apiFetch<ClassRecord>(`/academics/classes/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["academics", "classes"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setEditingClass(null);
    },
  });
  const departmentMutation = useMutation({
    mutationFn: (input: CreateDepartmentInput) =>
      apiFetch<DepartmentOption>("/academics/departments", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["academics", "departments"] });
      setShowDepartmentForm(false);
    },
  });

  const availableDepartments = departmentsQuery.data ?? [];

  const departmentForm = useForm({
    defaultValues: { name: "", code: "", description: "" } as CreateDepartmentInput,
    validators: { onSubmit: createDepartmentSchema },
    onSubmit: async ({ value }) => {
      departmentMutation.reset();
      await departmentMutation.mutateAsync(createDepartmentSchema.parse(value));
      departmentForm.reset();
    },
  });

  const allClasses = classesQuery.data ?? [];
  const filteredClasses = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return allClasses.filter((schoolClass) => {
      const matchesSearch =
        !normalizedSearch ||
        [
          schoolClass.name,
          schoolClass.level,
          schoolClass.department?.name ?? "",
          schoolClass.classTeacher?.profile
            ? `${schoolClass.classTeacher.profile.firstName} ${schoolClass.classTeacher.profile.lastName}`
            : `${schoolClass.classTeacher?.firstName ?? ""} ${schoolClass.classTeacher?.lastName ?? ""}`,
        ].some((value) => value.toLocaleLowerCase().includes(normalizedSearch));
      const matchesDepartment =
        departmentFilter === "all" ||
        schoolClass.department?.id === departmentFilter;
      return matchesSearch && matchesDepartment;
    });
  }, [allClasses, departmentFilter, search]);

  const enrolledStudents = allClasses.reduce(
    (total, schoolClass) => total + schoolClass._count.students,
    0,
  );
  const availablePlaces = allClasses.reduce(
    (total, schoolClass) =>
      total + Math.max((schoolClass.capacity ?? 0) - schoolClass._count.students, 0),
    0,
  );

  function openClassForm() {
    classMutation.reset();
    setEditingClass(null);
    setShowClassForm(true);
  }

  const classColumns: DataTableColumn<ClassRecord>[] = [
    {
      id: "class",
      header: "Class",
      value: (schoolClass) => `${schoolClass.name} (${schoolClass.level})`,
      cell: (schoolClass) => (
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <GraduationCap className="size-[18px]" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">{schoolClass.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{schoolClass.level}</p>
          </div>
        </div>
      ),
    },
    {
      id: "department",
      header: "Department",
      value: (schoolClass) => schoolClass.department?.name ?? "Not assigned",
      cell: (schoolClass) =>
        schoolClass.department ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/8 px-2.5 py-1 text-xs font-medium text-primary">
            <Building2 className="size-3.5" /> {schoolClass.department.name}
          </span>
        ) : (
          <span className="text-xs font-medium text-destructive">Not assigned</span>
        ),
    },
    {
      id: "learners",
      header: "Learners",
      value: (schoolClass) => schoolClass._count.students,
      cell: (schoolClass) => {
        const occupancy =
          schoolClass.capacity && schoolClass.capacity > 0
            ? Math.min((schoolClass._count.students / schoolClass.capacity) * 100, 100)
            : null;
        return (
          <div className="min-w-24">
            <p className="text-xs font-semibold text-foreground">
              {schoolClass._count.students}
              {schoolClass.capacity ? <span className="font-normal text-muted-foreground"> / {schoolClass.capacity}</span> : null}
            </p>
            {occupancy !== null && (
              <div
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label={`${schoolClass.name} capacity`}
                aria-valuenow={Math.round(occupancy)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span className={`block h-full rounded-full ${occupancy >= 90 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${occupancy}%` }} />
              </div>
            )}
          </div>
        );
      },
    },
    {
      id: "teacher",
      header: "Class teacher",
      cell: (schoolClass) => {
        const teacher = schoolClass.classTeacher?.profile ?? schoolClass.classTeacher;
        return teacher ? `${teacher.firstName} ${teacher.lastName}` : "Not assigned";
      },
    },
    {
      id: "status",
      header: "Status",
      value: (schoolClass) => (schoolClass.isActive ? "Active" : "Inactive"),
      cell: (schoolClass) => (
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${schoolClass.isActive ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
          <span className={`size-1.5 rounded-full ${schoolClass.isActive ? "bg-emerald-500" : "bg-muted-foreground"}`} />
          {schoolClass.isActive ? "Active" : "Inactive"}
        </span>
      ),
    },
    ...(canManage
      ? [
          {
            id: "actions",
            header: "",
            className: "text-right",
            cell: (schoolClass: ClassRecord) => (
              <div className="inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    classMutation.reset();
                    updateClassMutation.reset();
                    setShowClassForm(false);
                    setEditingClass(schoolClass);
                  }}
                  aria-label={`Edit ${schoolClass.name}`}
                  className="inline-flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setManagingTeacherClass(schoolClass)}
                  aria-label={`Manage class teacher for ${schoolClass.name}`}
                  className="inline-flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <CalendarClock className="size-4" />
                </button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-7">
      <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <div className="relative isolate overflow-hidden border-b border-border bg-gradient-to-br from-primary/10 via-card to-sky-500/5 px-5 py-6 sm:px-7 sm:py-8">
          <div className="pointer-events-none absolute -right-10 -top-16 -z-10 size-64 rounded-full bg-primary/10 blur-3xl" />
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                Academic structure
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Build classes around your departments
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Create your school’s permanent class groups once and reuse them
                across years. This page manages class structure; year-specific
                student placement and promotion are not yet managed here.
              </p>
            </div>
            {canManage && (
              <button
                type="button"
                onClick={openClassForm}
                disabled={!availableDepartments.length}
                title={!availableDepartments.length ? "Create a department first" : undefined}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="size-4" />
                Create class
              </button>
            )}
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={GraduationCap} label="Classes" value={allClasses.length} detail="in this school" />
            <MetricCard icon={Users} label="Learners" value={enrolledStudents} detail="across all classes" />
            <MetricCard icon={Building2} label="Departments" value={availableDepartments.length} detail="active departments" />
            <MetricCard icon={BookOpenCheck} label="Open places" value={availablePlaces} detail="based on class capacity" />
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Building2 className="size-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-foreground">Departments</h2>
              <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">
                Create the school’s academic departments first, then assign each
                class to the department responsible for it.
              </p>
            </div>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => {
                departmentMutation.reset();
                departmentForm.reset();
                setShowDepartmentForm((isOpen) => !isOpen);
              }}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3.5 text-sm font-semibold text-foreground transition hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {showDepartmentForm ? <X className="size-4" /> : <Plus className="size-4" />}
              {showDepartmentForm ? "Close form" : "Add department"}
            </button>
          )}
        </div>

        {showDepartmentForm && canManage && (
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void departmentForm.handleSubmit();
            }}
            className="mt-5 rounded-2xl border border-primary/20 bg-primary/[0.035] p-4 sm:p-5"
          >
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-foreground">New department</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Use a clear name and a short unique code, such as SCI for Science.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <departmentForm.Field name="name">
                {(field) => (
                  <FormField label="Department name" htmlFor={field.name} error={field.state.meta.errors}>
                    <FormInput
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      placeholder="e.g. Science"
                      autoComplete="off"
                      required
                    />
                  </FormField>
                )}
              </departmentForm.Field>
              <departmentForm.Field name="code">
                {(field) => (
                  <FormField label="Department code" htmlFor={field.name} hint="2–20 letters, numbers, or hyphens" error={field.state.meta.errors}>
                    <FormInput
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value.toUpperCase())}
                      placeholder="e.g. SCI"
                      autoComplete="off"
                      maxLength={20}
                      required
                    />
                  </FormField>
                )}
              </departmentForm.Field>
              <departmentForm.Field name="description">
                {(field) => (
                  <FormField label="Description (optional)" htmlFor={field.name} error={field.state.meta.errors}>
                    <FormInput
                      id={field.name}
                      name={field.name}
                      value={field.state.value ?? ""}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      placeholder="Subjects or area covered"
                      maxLength={500}
                    />
                  </FormField>
                )}
              </departmentForm.Field>
            </div>
            {departmentMutation.error && <MutationError error={departmentMutation.error} />}
            <div className="mt-4 flex justify-end">
              <FormSubmitButton isSubmitting={departmentMutation.isPending}>
                <Check className="size-4" />
                Save department
              </FormSubmitButton>
            </div>
          </form>
        )}

        {departmentsQuery.isPending ? (
          <InlineLoading label="Loading departments" />
        ) : departmentsQuery.error ? (
          <InlineError message={`Departments could not be loaded: ${departmentsQuery.error.message}`} />
        ) : availableDepartments.length ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {availableDepartments.map((department) => (
              <article
                key={department.id}
                className="group rounded-2xl border border-border bg-background/70 p-4 transition hover:border-primary/30 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
                      {department.code.slice(0, 2)}
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-foreground">{department.name}</h3>
                      <p className="mt-0.5 text-xs font-medium tracking-wide text-muted-foreground">{department.code}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                    {department._count.classes} {department._count.classes === 1 ? "class" : "classes"}
                  </span>
                </div>
                {department.description && (
                  <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {department.description}
                  </p>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-border bg-muted/40 px-5 py-8 text-center">
            <Building2 className="mx-auto size-7 text-muted-foreground" />
            <h3 className="mt-3 text-sm font-semibold text-foreground">Set up your first department</h3>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
              Departments give classes a clear academic home. Add one before creating classes.
            </p>
          </div>
        )}
      </section>

      {(showClassForm || editingClass) && canManage && (
        <ClassEditorForm
          key={editingClass?.id ?? "new-class"}
          initialValues={editingClass ? {
            name: editingClass.name,
            level: editingClass.level,
            departmentId: editingClass.department?.id ?? "",
            capacity: editingClass.capacity ?? undefined,
            isGraduatingClass: editingClass.isGraduatingClass,
            isActive: editingClass.isActive,
          } : {
            name: "",
            level: "",
            departmentId: departmentFilter === "all" ? "" : departmentFilter,
            capacity: undefined,
            isGraduatingClass: false,
            isActive: true,
          }}
          departments={availableDepartments}
          isEditing={!!editingClass}
          isSubmitting={classMutation.isPending || updateClassMutation.isPending}
          error={editingClass ? updateClassMutation.error : classMutation.error}
          onCancel={() => {
            setShowClassForm(false);
            setEditingClass(null);
          }}
          onSubmit={async (input) => {
            if (editingClass) {
              await updateClassMutation.mutateAsync({
                id: editingClass.id,
                input: {
                  ...input,
                  capacity: input.capacity ?? null,
                },
              });
            } else {
              await classMutation.mutateAsync({
                ...input,
              });
            }
          }}
        />
      )}

      {managingTeacherClass && canManage && (
        <ClassTeacherAssignmentsPanel
          key={managingTeacherClass.id}
          schoolClass={managingTeacherClass}
          teachers={teachersQuery.data ?? []}
          teachersError={teachersQuery.error}
          teachersLoading={teachersQuery.isPending}
          onClose={() => setManagingTeacherClass(null)}
        />
      )}

      <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-5 sm:px-6">
          <div>
            <h2 className="text-base font-bold text-foreground">Class directory</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {filteredClasses.length} of {allClasses.length} {allClasses.length === 1 ? "class" : "classes"}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <label className="relative min-w-0 flex-1 sm:w-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search classes"
                aria-label="Search classes"
                className={`${controlClasses} w-full pl-9`}
              />
            </label>
            <select
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
              aria-label="Filter by department"
              className={`${controlClasses} min-w-40`}
            >
              <option value="all">All departments</option>
              {availableDepartments.map((department) => (
                <option key={department.id} value={department.id}>{department.name}</option>
              ))}
            </select>
          </div>
        </div>

        {classesQuery.isPending ? (
          <InlineLoading label="Loading classes" />
        ) : classesQuery.error ? (
          <InlineError message={`Classes could not be loaded: ${classesQuery.error.message}`} />
        ) : filteredClasses.length ? (
          <DataTable
            embedded
            searchable={false}
            rows={filteredClasses}
            columns={classColumns}
            getRowId={(schoolClass) => schoolClass.id}
            exportTitle="Classes"
            canExport={canExportTables(activeRole)}
            emptyTitle="No classes"
            emptyDescription="No classes to show."
          />
        ) : (
          <div className="px-5 py-12 text-center">
            <GraduationCap className="mx-auto size-8 text-muted-foreground" />
            <h3 className="mt-3 text-sm font-semibold text-foreground">
              {allClasses.length ? "No classes match these filters" : "No classes yet"}
            </h3>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
              {allClasses.length
                ? "Try a different search term or clear one of the filters."
                : "Create a department, then add your permanent class groups. You can reuse them for every academic year."}
            </p>
            {allClasses.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setDepartmentFilter("all");
                }}
                className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                Clear filters <ArrowUpRight className="size-3.5" />
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof GraduationCap;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <article className="rounded-2xl border border-border/80 bg-card/85 p-4 shadow-sm backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-foreground">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{detail}</p>
    </article>
  );
}

function ClassEditorForm({
  initialValues,
  departments,
  isEditing,
  isSubmitting,
  error,
  onCancel,
  onSubmit,
}: {
  initialValues: CreateClassInput;
  departments: DepartmentOption[];
  isEditing: boolean;
  isSubmitting: boolean;
  error: Error | null;
  onCancel: () => void;
  onSubmit: (input: CreateClassInput) => Promise<unknown>;
}) {
  const form = useForm({
    defaultValues: initialValues,
    validators: {
      onSubmit: ({ value }) => {
        const result = createClassSchema.safeParse(value);
        return result.success ? undefined : result.error;
      },
    },
    onSubmit: async ({ value }) => {
      const result = createClassSchema.safeParse(value);
      if (result.success) await onSubmit(result.data).catch(() => undefined);
    },
  });

  return (
    <section className="rounded-3xl border border-primary/20 bg-card p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Permanent class group</p>
          <h2 className="mt-1 text-lg font-bold text-foreground">
            {isEditing ? "Edit class details" : "Create a class"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Student placements change by academic year; the class itself remains available for future years.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close class form"
          className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit().catch(() => undefined);
        }}
        className="space-y-5"
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <form.Field name="name">
            {(field) => (
              <FormField label="Class name" htmlFor={field.name} error={field.state.meta.errors}>
                <FormInput id={field.name} name={field.name} value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} placeholder="e.g. JHS 1A" maxLength={100} required />
              </FormField>
            )}
          </form.Field>
          <form.Field name="level">
            {(field) => (
              <FormField label="Level / grade" htmlFor={field.name} error={field.state.meta.errors}>
                <FormInput id={field.name} name={field.name} value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} placeholder="e.g. JHS 1" maxLength={60} required />
              </FormField>
            )}
          </form.Field>
          <form.Field name="departmentId">
            {(field) => (
              <FormField label="Department" htmlFor={field.name} error={field.state.meta.errors}>
                <FormSelect id={field.name} name={field.name} value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} required>
                  <option value="">Select department</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>{department.name} ({department.code})</option>
                  ))}
                </FormSelect>
              </FormField>
            )}
          </form.Field>
          <form.Field name="capacity">
            {(field) => (
              <FormField label="Class capacity (optional)" htmlFor={field.name} error={field.state.meta.errors}>
                <FormInput id={field.name} name={field.name} type="number" min={1} step={1} value={field.state.value ?? ""} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value ? Number(event.target.value) : undefined)} placeholder="e.g. 40" />
              </FormField>
            )}
          </form.Field>
          <form.Field name="isGraduatingClass">
            {(field) => (
              <label className="flex items-center gap-3 self-end rounded-xl border border-border bg-background px-3 py-3 text-sm text-secondary-foreground">
                <input type="checkbox" checked={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.checked)} className="size-4 accent-primary" />
                Mark as graduating class
              </label>
            )}
          </form.Field>
          <form.Field name="isActive">
            {(field) => (
              <label className="flex items-center gap-3 self-end rounded-xl border border-border bg-background px-3 py-3 text-sm text-secondary-foreground">
                <input type="checkbox" checked={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.checked)} className="size-4 accent-primary" />
                Class is active
              </label>
            )}
          </form.Field>
        </div>
        {error && <MutationError error={error} />}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="h-10 rounded-xl border border-border px-4 text-sm font-semibold text-secondary-foreground transition hover:bg-muted">
            Cancel
          </button>
          <FormSubmitButton isSubmitting={isSubmitting}>
            <Check className="size-4" />
            {isEditing ? "Save changes" : "Create class"}
          </FormSubmitButton>
        </div>
      </form>
    </section>
  );
}

function ClassTeacherAssignmentsPanel({
  schoolClass,
  teachers,
  teachersError,
  teachersLoading,
  onClose,
}: {
  schoolClass: ClassRecord;
  teachers: TeacherOption[];
  teachersError: Error | null;
  teachersLoading: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const assignmentsQuery = useQuery({
    queryKey: ["academics", "classes", schoolClass.id, "teacher-assignments"],
    queryFn: () =>
      apiFetch<ClassTeacherAssignment[]>(
        `/academics/classes/${schoolClass.id}/teacher-assignments`,
      ),
  });
  const mutation = useMutation({
    mutationFn: (input: CreateClassTeacherAssignmentInput) =>
      apiFetch<ClassTeacherAssignment>(
        `/academics/classes/${schoolClass.id}/teacher-assignments`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["academics", "classes"] }),
        queryClient.invalidateQueries({
          queryKey: ["academics", "classes", schoolClass.id, "teacher-assignments"],
        }),
      ]);
      form.reset({
        teacherId: "",
        effectiveFrom: new Date().toISOString().slice(0, 10),
      });
    },
  });
  const form = useForm({
    defaultValues: {
      teacherId: "",
      effectiveFrom: new Date().toISOString().slice(0, 10),
    } as CreateClassTeacherAssignmentInput,
    validators: {
      onSubmit: createClassTeacherAssignmentSchema,
    },
    onSubmit: async ({ value }) => {
      mutation.reset();
      await mutation.mutateAsync(
        createClassTeacherAssignmentSchema.parse(value),
      );
    },
  });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            Dated assignment history
          </p>
          <h2 className="mt-1 text-lg font-bold text-foreground">
            Class teacher · {schoolClass.name}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Changes take effect on the selected date. The previous assignment
            is retained with its end date, including changes between terms.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close class teacher history"
          className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit().catch(() => undefined);
        }}
        className="grid gap-4 rounded-2xl border border-border bg-muted/30 p-4 sm:grid-cols-[1fr_200px_auto] sm:items-end"
      >
        <form.Field name="teacherId">
          {(field) => (
            <FormField label="Assign teacher" htmlFor={field.name} error={field.state.meta.errors}>
              <FormSelect
                id={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                required
              >
                <option value="">Select a teacher</option>
                {teachers.map((teacher) => (
                  <option
                    key={teacher.id}
                    value={teacher.id}
                    disabled={!teacher.isActive}
                  >
                    {teacher.firstName} {teacher.lastName}
                    {teacher.isActive ? "" : " (inactive)"}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          )}
        </form.Field>
        <form.Field name="effectiveFrom">
          {(field) => (
            <FormField label="Effective from" htmlFor={field.name} error={field.state.meta.errors}>
              <FormInput
                id={field.name}
                type="date"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                required
              />
            </FormField>
          )}
        </form.Field>
        <FormSubmitButton isSubmitting={mutation.isPending}>
          <Check className="size-4" />
          Save assignment
        </FormSubmitButton>
      </form>
      {teachersLoading && (
        <p className="mt-3 text-xs text-muted-foreground">Loading teachers…</p>
      )}
      {teachersError && (
        <div className="mt-3">
          <InlineError message={`Teachers could not be loaded: ${teachersError.message}`} />
        </div>
      )}
      {mutation.error && (
        <div className="mt-3">
          <MutationError error={mutation.error} />
        </div>
      )}

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-foreground">Assignment history</h3>
        {assignmentsQuery.isPending ? (
          <InlineLoading label="Loading assignment history" />
        ) : assignmentsQuery.error ? (
          <InlineError message={`Assignment history could not be loaded: ${assignmentsQuery.error.message}`} />
        ) : assignmentsQuery.data?.length ? (
          <ol className="mt-3 divide-y divide-border rounded-2xl border border-border">
            {assignmentsQuery.data.map((assignment) => {
              const teacherName = assignment.teacher.profile
                ? `${assignment.teacher.profile.firstName} ${assignment.teacher.profile.lastName}`
                : `${assignment.teacher.firstName ?? ""} ${assignment.teacher.lastName ?? ""}`.trim();
              const startsAt = assignment.effectiveFrom.slice(0, 10);
              const endsAt = assignment.effectiveTo?.slice(0, 10);
              const assignmentStatus =
                startsAt > today
                  ? "Scheduled"
                  : endsAt && endsAt <= today
                    ? "Past"
                    : "Current";
              return (
                <li
                  key={assignment.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <GraduationCap className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {teacherName || "Teacher"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {startsAt}
                        {endsAt ? ` – ${endsAt} (exclusive end)` : " – Present"}
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                    {assignmentStatus}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="mt-3 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No teacher assignments have been recorded for this class yet.
          </p>
        )}
      </div>
    </section>
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
    <div role="alert" className="m-5 flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function MutationError({ error }: { error: Error }) {
  return <InlineError message={error.message} />;
}
