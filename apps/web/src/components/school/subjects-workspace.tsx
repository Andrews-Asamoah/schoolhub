import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CircleAlert, LoaderCircle, Plus, Search, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import {
  saveSubjectSchema,
  type SaveSubjectInput,
  type SetSubjectClassesInput,
} from "@schoolhub/shared";
import { FormField, FormInput, FormTextarea } from "@/components/forms/form-controls";
import { useSchoolRole } from "@/components/school/school-role-switcher";
import {
  WorkspaceDataTable,
  type WorkspaceColumn,
} from "@/components/school/workspace-ui";
import { apiFetch } from "@/lib/api";

interface SubjectRow {
  id: string;
  name: string;
  code: string;
  description: string | null;
  periodsPerWeek: number;
  isActive: boolean;
  classes: {
    classId: string;
    className: string;
    isCompulsory: boolean;
    teacherId: string | null;
    teacherName: string | null;
  }[];
  teachers: { id: string; name: string }[];
}
interface ClassOption { id: string; name: string; level: string }
interface TeacherOption { id: string; firstName: string; lastName: string; isActive: boolean }

type Panel =
  | { type: "form"; subject?: SubjectRow }
  | { type: "classes"; subject: SubjectRow }
  | { type: "teachers"; subject: SubjectRow }
  | null;

const linkButton =
  "rounded-md px-2 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50";
const primary =
  "inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60";
const outline =
  "inline-flex h-9 items-center gap-2 rounded-lg border border-border px-4 text-xs font-semibold text-foreground/80 hover:bg-muted/50";

export function SubjectsWorkspace() {
  const queryClient = useQueryClient();
  const { activeRole } = useSchoolRole();
  const canManage = ["owner", "admin", "headteacher"].includes(activeRole ?? "");
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);

  const subjectsQuery = useQuery({
    queryKey: ["subjects", "manage"],
    queryFn: () => apiFetch<SubjectRow[]>("/subjects?includeInactive=true"),
  });
  const classesQuery = useQuery({
    queryKey: ["academics", "classes"],
    queryFn: () => apiFetch<ClassOption[]>("/academics/classes"),
    enabled: canManage && panel?.type === "classes",
  });
  const teachersQuery = useQuery({
    queryKey: ["academics", "teachers"],
    queryFn: () => apiFetch<TeacherOption[]>("/academics/teachers"),
    enabled: canManage && (panel?.type === "classes" || panel?.type === "teachers"),
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["subjects"] }),
      queryClient.invalidateQueries({ queryKey: ["academics", "subjects"] }),
      queryClient.invalidateQueries({ queryKey: ["timetable"] }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: ({ id, input }: { id?: string; input: SaveSubjectInput }) =>
      apiFetch(id ? `/subjects/${id}` : "/subjects", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      setPanel(null);
      await refresh();
    },
  });
  const statusMutation = useMutation({
    mutationFn: (subject: SubjectRow) =>
      apiFetch(`/subjects/${subject.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: subject.name,
          code: subject.code,
          description: subject.description ?? undefined,
          periodsPerWeek: subject.periodsPerWeek,
          isActive: !subject.isActive,
        } satisfies SaveSubjectInput),
      }),
    onSuccess: refresh,
  });
  const deleteMutation = useMutation({
    mutationFn: (subject: SubjectRow) => apiFetch(`/subjects/${subject.id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  const classesMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: SetSubjectClassesInput }) =>
      apiFetch(`/subjects/${id}/classes`, { method: "PUT", body: JSON.stringify(input) }),
    onSuccess: async () => {
      setPanel(null);
      await refresh();
    },
  });
  const teachersMutation = useMutation({
    mutationFn: ({ id, teacherIds }: { id: string; teacherIds: string[] }) =>
      apiFetch(`/subjects/${id}/teachers`, { method: "PUT", body: JSON.stringify({ teacherIds }) }),
    onSuccess: async () => {
      setPanel(null);
      await refresh();
    },
  });

  const subjects = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (subjectsQuery.data ?? []).filter(
      (subject) =>
        (showInactive || subject.isActive) &&
        (!term || `${subject.name} ${subject.code}`.toLowerCase().includes(term)),
    );
  }, [subjectsQuery.data, search, showInactive]);

  if (subjectsQuery.isPending) return <Notice>Loading subjects…</Notice>;
  if (subjectsQuery.error) return <Notice tone="error">{subjectsQuery.error.message}</Notice>;

  const actionError =
    statusMutation.error ?? deleteMutation.error ?? classesMutation.error ?? teachersMutation.error;

  const columns: WorkspaceColumn<SubjectRow>[] = [
    {
      id: "subject",
      header: "Subject",
      cell: (subject) => (
        <span>
          <span className="block font-semibold text-foreground">{subject.name}</span>
          <span className="text-[11px] text-muted-foreground">{subject.code}</span>
        </span>
      ),
    },
    { id: "periods", header: "Periods / week", cell: (subject) => subject.periodsPerWeek },
    {
      id: "classes",
      header: "Classes",
      cell: (subject) =>
        subject.classes.length ? (
          <span className="flex max-w-[260px] flex-wrap gap-1">
            {subject.classes.map((row) => (
              <span
                key={row.classId}
                title={row.teacherName ? `Taught by ${row.teacherName}` : "No teacher assigned"}
                className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
              >
                {row.className}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-muted-foreground/70">Not assigned</span>
        ),
    },
    {
      id: "teachers",
      header: "Qualified teachers",
      cell: (subject) =>
        subject.teachers.length ? subject.teachers.map((teacher) => teacher.name).join(", ") : "—",
    },
    {
      id: "status",
      header: "Status",
      cell: (subject) => (
        <span
          className={
            subject.isActive
              ? "rounded-full bg-success/10 px-2 py-1 text-[10px] font-semibold text-success"
              : "rounded-full bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground"
          }
        >
          {subject.isActive ? "Active" : "Inactive"}
        </span>
      ),
    },
    ...(canManage
      ? [
          {
            id: "actions",
            header: "",
            className: "text-right",
            cell: (subject: SubjectRow) => (
              <span className="inline-flex flex-wrap justify-end gap-0.5">
                <button type="button" className={linkButton} onClick={() => setPanel({ type: "form", subject })}>Edit</button>
                <button type="button" className={linkButton} onClick={() => setPanel({ type: "classes", subject })}>Classes</button>
                <button type="button" className={linkButton} onClick={() => setPanel({ type: "teachers", subject })}>Teachers</button>
                <button type="button" className={linkButton} disabled={statusMutation.isPending} onClick={() => statusMutation.mutate(subject)}>
                  {subject.isActive ? "Deactivate" : "Activate"}
                </button>
                <button
                  type="button"
                  className="rounded-md px-2 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (window.confirm(`Delete ${subject.name}? This cannot be undone.`)) {
                      deleteMutation.mutate(subject);
                    }
                  }}
                >
                  Delete
                </button>
              </span>
            ),
          } satisfies WorkspaceColumn<SubjectRow>,
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <label className="relative min-w-[220px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or code"
              aria-label="Search subjects"
              className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="size-4 accent-primary" />
            Show inactive
          </label>
        </div>
        {canManage && (
          <button type="button" className={primary} onClick={() => { saveMutation.reset(); setPanel({ type: "form" }); }}>
            <Plus className="size-4" /> Add subject
          </button>
        )}
      </section>

      {actionError && <Notice tone="error">{actionError.message}</Notice>}

      {canManage && panel?.type === "form" && (
        <SubjectForm
          subject={panel.subject}
          pending={saveMutation.isPending}
          error={saveMutation.error?.message}
          onCancel={() => setPanel(null)}
          onSave={(input) => saveMutation.mutate({ id: panel.subject?.id, input })}
        />
      )}
      {canManage && panel?.type === "classes" && (
        <ClassAssignmentPanel
          subject={panel.subject}
          classes={classesQuery.data ?? []}
          teachers={(teachersQuery.data ?? []).filter((teacher) => teacher.isActive)}
          loading={classesQuery.isPending || teachersQuery.isPending}
          pending={classesMutation.isPending}
          onManageTeachers={() => setPanel({ type: "teachers", subject: panel.subject })}
          onCancel={() => setPanel(null)}
          onSave={(input) => classesMutation.mutate({ id: panel.subject.id, input })}
        />
      )}
      {canManage && panel?.type === "teachers" && (
        <TeacherPanel
          subject={panel.subject}
          teachers={(teachersQuery.data ?? []).filter((teacher) => teacher.isActive)}
          loading={teachersQuery.isPending}
          pending={teachersMutation.isPending}
          onCancel={() => setPanel(null)}
          onSave={(teacherIds) => teachersMutation.mutate({ id: panel.subject.id, teacherIds })}
        />
      )}

      <WorkspaceDataTable
        rows={subjects}
        columns={columns}
        getRowId={(subject) => subject.id}
        exportTitle="Subjects"
        emptyTitle={search ? "No matching subjects" : "No subjects in the catalogue"}
        emptyDescription={
          canManage
            ? "Add subjects, then assign them to classes and teachers."
            : "Subjects added by your school will appear here."
        }
      />
    </div>
  );
}

function Notice({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "error" }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={
        tone === "error"
          ? "flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-xs text-destructive"
          : "rounded-xl border border-border bg-card px-4 py-6 text-center text-xs text-muted-foreground"
      }
    >
      {tone === "error" && <CircleAlert className="mt-0.5 size-4 shrink-0" />}
      {children}
    </p>
  );
}

function PanelShell({
  title,
  description,
  onCancel,
  children,
}: {
  title: string;
  description?: string;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-primary/20 bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary"><BookOpen className="size-4" /></span>
          <div>
            <h3 className="text-sm font-bold text-foreground">{title}</h3>
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
        <button type="button" onClick={onCancel} aria-label="Close" className="rounded-lg p-1.5 text-muted-foreground/70 hover:bg-muted"><X className="size-4" /></button>
      </div>
      {children}
    </section>
  );
}

function SubjectForm({
  subject,
  pending,
  error,
  onSave,
  onCancel,
}: {
  subject?: SubjectRow;
  pending: boolean;
  error?: string;
  onSave: (input: SaveSubjectInput) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(subject?.name ?? "");
  const [code, setCode] = useState(subject?.code ?? "");
  const [description, setDescription] = useState(subject?.description ?? "");
  const [periods, setPeriods] = useState(String(subject?.periodsPerWeek ?? 4));
  const [problem, setProblem] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = saveSubjectSchema.safeParse({
      name,
      code,
      description: description || undefined,
      periodsPerWeek: Number(periods),
      isActive: subject?.isActive,
    });
    if (!parsed.success) {
      setProblem(parsed.error.issues[0]?.message ?? "Check the subject details.");
      return;
    }
    setProblem(null);
    onSave(parsed.data);
  }

  return (
    <PanelShell title={subject ? `Edit ${subject.name}` : "Add subject"} onCancel={onCancel}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Subject name" htmlFor="subject-name">
            <FormInput id="subject-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mathematics" />
          </FormField>
          <FormField label="Code" htmlFor="subject-code" hint="Letters and numbers, e.g. MATH">
            <FormInput id="subject-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="MATH" />
          </FormField>
          <FormField label="Periods per week" htmlFor="subject-periods">
            <FormInput id="subject-periods" type="number" min={1} max={20} value={periods} onChange={(e) => setPeriods(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Description (optional)" htmlFor="subject-description">
          <FormTextarea id="subject-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </FormField>
        {(problem || error) && <Notice tone="error">{problem ?? error}</Notice>}
        <div className="flex justify-end gap-2">
          <button type="button" className={outline} onClick={onCancel}>Cancel</button>
          <button type="submit" className={primary} disabled={pending}>
            {pending && <LoaderCircle className="size-3.5 animate-spin" />}
            {subject ? "Save changes" : "Add subject"}
          </button>
        </div>
      </form>
    </PanelShell>
  );
}

function ClassAssignmentPanel({
  subject,
  classes,
  teachers,
  loading,
  pending,
  onSave,
  onManageTeachers,
  onCancel,
}: {
  subject: SubjectRow;
  classes: ClassOption[];
  teachers: TeacherOption[];
  loading: boolean;
  pending: boolean;
  onSave: (input: SetSubjectClassesInput) => void;
  onManageTeachers: () => void;
  onCancel: () => void;
}) {
  // Only teachers assigned to this subject can be put in charge of it.
  const assignedIds = new Set(subject.teachers.map((teacher) => teacher.id));
  const subjectTeachers = teachers.filter((teacher) => assignedIds.has(teacher.id));
  const [selected, setSelected] = useState(
    () =>
      new Map(
        subject.classes.map((row) => [
          row.classId,
          { teacherId: row.teacherId ?? "", isCompulsory: row.isCompulsory },
        ]),
      ),
  );

  function toggle(classId: string, checked: boolean) {
    setSelected((current) => {
      const next = new Map(current);
      if (checked) next.set(classId, { teacherId: "", isCompulsory: true });
      else next.delete(classId);
      return next;
    });
  }
  function patch(classId: string, value: Partial<{ teacherId: string; isCompulsory: boolean }>) {
    setSelected((current) => {
      const existing = current.get(classId);
      if (!existing) return current;
      return new Map(current).set(classId, { ...existing, ...value });
    });
  }

  return (
    <PanelShell
      title={`Classes studying ${subject.name}`}
      description="Tick the classes that take this subject and optionally choose who teaches it in each. Only teachers assigned to this subject are listed."
      onCancel={onCancel}
    >
      {!loading && subjectTeachers.length === 0 && (
        <p className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-xs text-warning">
          No teachers are assigned to {subject.name} yet.
          <button type="button" className="font-semibold underline" onClick={onManageTeachers}>
            Assign teachers to this subject
          </button>
        </p>
      )}
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading classes and teachers…</p>
      ) : classes.length === 0 ? (
        <p className="text-xs text-muted-foreground">Create classes first, then assign subjects to them.</p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-xl border border-border">
          {classes.map((schoolClass) => {
            const row = selected.get(schoolClass.id);
            return (
              <li key={schoolClass.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-xs">
                <label className="flex min-w-[160px] items-center gap-2 font-medium text-foreground">
                  <input type="checkbox" className="size-4 accent-primary" checked={Boolean(row)} onChange={(e) => toggle(schoolClass.id, e.target.checked)} />
                  {schoolClass.name}
                </label>
                {row && (
                  <>
                    <select
                      aria-label={`Teacher for ${schoolClass.name}`}
                      value={row.teacherId}
                      onChange={(e) => patch(schoolClass.id, { teacherId: e.target.value })}
                      className="h-8 rounded-lg border border-border bg-card px-2 text-xs"
                    >
                      <option value="">No teacher yet</option>
                      {subjectTeachers.map((teacher) => (
                        <option key={teacher.id} value={teacher.id}>{teacher.firstName} {teacher.lastName}</option>
                      ))}
                      {/* Keep an older assignment visible so it is not silently dropped. */}
                      {row.teacherId && !assignedIds.has(row.teacherId) && (
                        <option value={row.teacherId}>
                          {subject.classes.find((item) => item.classId === schoolClass.id)?.teacherName ?? "Current teacher"} (not assigned to this subject)
                        </option>
                      )}
                    </select>
                    <label className="flex items-center gap-1.5 text-muted-foreground">
                      <input type="checkbox" className="size-3.5 accent-primary" checked={row.isCompulsory} onChange={(e) => patch(schoolClass.id, { isCompulsory: e.target.checked })} />
                      Compulsory
                    </label>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={outline} onClick={onCancel}>Cancel</button>
        <button
          type="button"
          className={primary}
          disabled={pending || loading}
          onClick={() =>
            onSave({
              assignments: [...selected].map(([classId, row]) => ({
                classId,
                teacherId: row.teacherId || null,
                isCompulsory: row.isCompulsory,
              })),
            })
          }
        >
          {pending && <LoaderCircle className="size-3.5 animate-spin" />}
          Save assignments
        </button>
      </div>
    </PanelShell>
  );
}

function TeacherPanel({
  subject,
  teachers,
  loading,
  pending,
  onSave,
  onCancel,
}: {
  subject: SubjectRow;
  teachers: TeacherOption[];
  loading: boolean;
  pending: boolean;
  onSave: (teacherIds: string[]) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState(() => new Set(subject.teachers.map((teacher) => teacher.id)));
  return (
    <PanelShell
      title={`Teachers qualified for ${subject.name}`}
      description="These teachers can be suggested when this subject is placed on the timetable."
      onCancel={onCancel}
    >
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading teachers…</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {teachers.map((teacher) => (
            <li key={teacher.id}>
              <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={selected.has(teacher.id)}
                  onChange={(e) =>
                    setSelected((current) => {
                      const next = new Set(current);
                      if (e.target.checked) next.add(teacher.id);
                      else next.delete(teacher.id);
                      return next;
                    })
                  }
                />
                {teacher.firstName} {teacher.lastName}
              </label>
            </li>
          ))}
          {teachers.length === 0 && <li className="text-xs text-muted-foreground">No active teachers yet.</li>}
        </ul>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={outline} onClick={onCancel}>Cancel</button>
        <button type="button" className={primary} disabled={pending || loading} onClick={() => onSave([...selected])}>
          {pending && <LoaderCircle className="size-3.5 animate-spin" />}
          Save teachers
        </button>
      </div>
    </PanelShell>
  );
}
