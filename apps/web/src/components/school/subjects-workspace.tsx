import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import {
  saveSubjectSchema,
  type SaveSubjectInput,
  type SetSubjectClassesInput,
  type SetSubjectStrandsInput,
} from "@schoolhub/shared";
import { FormModal } from "@/components/ui/form-modal";
import { BulkImportButton } from "@/components/bulk-import/bulk-import-button";
import { FormField, FormInput, FormTextarea } from "@/components/forms/form-controls";
import { AcademicStructureBulkImport } from "@/components/school/academic-structure-bulk-import";
import { useSchoolRole } from "@/components/school/school-role-switcher";
import {
  WorkspaceDataTable,
  type WorkspaceColumn,
} from "@/components/school/workspace-ui";
import { apiFetch } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  strands: {
    id: string;
    name: string;
    code: string | null;
    description: string | null;
    sortOrder: number;
    examWeightPercent: number | string;
    isActive: boolean;
    assignments: { classId: string; className: string; teacherId: string; teacherName: string }[];
  }[];
}
interface ClassOption { id: string; name: string; level: string }
interface TeacherOption { id: string; firstName: string; lastName: string; isActive: boolean }

type Panel =
  | { type: "form"; subject?: SubjectRow }
  | { type: "classes"; subject: SubjectRow }
  | { type: "teachers"; subject: SubjectRow }
  | { type: "strands"; subject: SubjectRow }
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
  // The server only lets owners and administrators create subjects in bulk.
  const canBulkImport = ["owner", "admin"].includes(activeRole ?? "");
  const [showImport, setShowImport] = useState(false);
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
    enabled: canManage && (panel?.type === "classes" || panel?.type === "strands"),
  });
  const teachersQuery = useQuery({
    queryKey: ["academics", "teachers"],
    queryFn: () => apiFetch<TeacherOption[]>("/academics/teachers"),
    enabled: canManage && (panel?.type === "classes" || panel?.type === "teachers" || panel?.type === "strands"),
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
  const strandsMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: SetSubjectStrandsInput }) =>
      apiFetch(`/subjects/${id}/strands`, { method: "PUT", body: JSON.stringify(input) }),
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

  // Opening a panel starts clean: a failure from an earlier attempt must not greet the next one.
  function openPanel(next: Panel) {
    saveMutation.reset();
    classesMutation.reset();
    strandsMutation.reset();
    teachersMutation.reset();
    setPanel(next);
  }

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
    statusMutation.error ?? deleteMutation.error;

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
                <button type="button" className={linkButton} onClick={() => openPanel({ type: "form", subject })}>Edit</button>
                <button type="button" className={linkButton} onClick={() => openPanel({ type: "classes", subject })}>Classes</button>
                <button type="button" className={linkButton} onClick={() => openPanel({ type: "teachers", subject })}>Teachers</button>
                <button type="button" className={linkButton} onClick={() => openPanel({ type: "strands", subject })}>Teaching areas{subject.strands.length ? ` (${subject.strands.filter((strand) => strand.isActive).length})` : ""}</button>
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
          <div className="flex flex-wrap gap-2">
            {canBulkImport && <BulkImportButton onClick={() => setShowImport(true)} />}
            <button type="button" className={primary} onClick={() => openPanel({ type: "form" })}>
              <Plus className="size-4" /> Add subject
            </button>
          </div>
        )}
      </section>

      {canBulkImport && showImport && (
        <AcademicStructureBulkImport
          kind="subjects"
          onClose={() => setShowImport(false)}
          onComplete={() => void refresh()}
        />
      )}

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
          error={classesMutation.error?.message}
          onManageTeachers={() => openPanel({ type: "teachers", subject: panel.subject })}
          onCancel={() => setPanel(null)}
          onSave={(input) => classesMutation.mutate({ id: panel.subject.id, input })}
        />
      )}
      {canManage && panel?.type === "strands" && (
        <StrandsPanel
          key={panel.subject.id}
          subject={panel.subject}
          classes={classesQuery.data ?? []}
          teachers={(teachersQuery.data ?? []).filter((teacher) => teacher.isActive)}
          loading={classesQuery.isPending || teachersQuery.isPending}
          pending={strandsMutation.isPending}
          error={strandsMutation.error?.message}
          onCancel={() => setPanel(null)}
          onSave={(input) => strandsMutation.mutate({ id: panel.subject.id, input })}
        />
      )}
      {canManage && panel?.type === "teachers" && (
        <TeacherPanel
          subject={panel.subject}
          teachers={(teachersQuery.data ?? []).filter((teacher) => teacher.isActive)}
          loading={teachersQuery.isPending}
          pending={teachersMutation.isPending}
          error={teachersMutation.error?.message}
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

  function submit() {
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
    <FormModal
      title={subject ? `Edit ${subject.name}` : "Add subject"}
      onClose={onCancel}
      onSubmit={submit}
      submitLabel={subject ? "Save changes" : "Add subject"}
      submitting={pending}
      error={problem ?? error}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="Subject name" htmlFor="subject-name">
          <FormInput id="subject-name" data-autofocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Mathematics" />
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
    </FormModal>
  );
}

function ClassAssignmentPanel({
  subject,
  classes,
  teachers,
  loading,
  pending,
  error,
  onSave,
  onManageTeachers,
  onCancel,
}: {
  subject: SubjectRow;
  classes: ClassOption[];
  teachers: TeacherOption[];
  loading: boolean;
  pending: boolean;
  error?: string;
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

  function save() {
    onSave({
      assignments: [...selected].map(([classId, row]) => ({
        classId,
        teacherId: row.teacherId || null,
        isCompulsory: row.isCompulsory,
      })),
    });
  }

  return (
    <FormModal
      title={`Classes studying ${subject.name}`}
      description="Tick the classes that take this subject and optionally choose who teaches it in each. Only teachers assigned to this subject are listed."
      size="3xl"
      onClose={onCancel}
      onSubmit={save}
      submitLabel="Save assignments"
      submitting={pending}
      submitDisabled={loading}
      error={error}
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
                    <Select value={row.teacherId || "__none__"} onValueChange={(value) => patch(schoolClass.id, { teacherId: value === "__none__" ? "" : value })}>
                      <SelectTrigger aria-label={`Teacher for ${schoolClass.name}`} className="h-8 min-w-40 rounded-lg border border-border bg-card px-2 text-xs"><SelectValue placeholder="No teacher yet" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No teacher yet</SelectItem>
                        {subjectTeachers.map((teacher) => <SelectItem key={teacher.id} value={teacher.id}>{teacher.firstName} {teacher.lastName}</SelectItem>)}
                        {/* Keep an older assignment visible so it is not silently dropped. */}
                        {row.teacherId && !assignedIds.has(row.teacherId) && (
                          <SelectItem value={row.teacherId}>
                            {subject.classes.find((item) => item.classId === schoolClass.id)?.teacherName ?? "Current teacher"} (not assigned to this subject)
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
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
    </FormModal>
  );
}


interface StrandDraft {
  key: string;
  id?: string;
  name: string;
  code: string;
  description: string;
  examWeightPercent: string;
  isActive: boolean;
  assignments: Record<string, string>;
}

function StrandsPanel({
  subject,
  classes,
  teachers,
  loading,
  pending,
  error,
  onSave,
  onCancel,
}: {
  subject: SubjectRow;
  classes: ClassOption[];
  teachers: TeacherOption[];
  loading: boolean;
  pending: boolean;
  error?: string;
  onSave: (input: SetSubjectStrandsInput) => void;
  onCancel: () => void;
}) {
  const qualifiedIds = new Set(subject.teachers.map((teacher) => teacher.id));
  const qualifiedTeachers = teachers.filter((teacher) => qualifiedIds.has(teacher.id));
  const offeredClassIds = new Set(subject.classes.map((row) => row.classId));
  const offeredClasses = classes.filter((row) => offeredClassIds.has(row.id));
  const [strands, setStrands] = useState<StrandDraft[]>(() => subject.strands.map((strand) => ({
    key: strand.id,
    id: strand.id,
    name: strand.name,
    code: strand.code ?? "",
    description: strand.description ?? "",
    examWeightPercent: String(strand.examWeightPercent ?? 0),
    isActive: strand.isActive,
    assignments: Object.fromEntries(strand.assignments.map((assignment) => [assignment.classId, assignment.teacherId])),
  })));
  const [problem, setProblem] = useState<string | null>(null);

  function update(key: string, change: Partial<StrandDraft>) {
    setStrands((current) => current.map((strand) => strand.key === key ? { ...strand, ...change } : strand));
  }

  function submit() {
    const active = strands.filter((strand) => strand.isActive);
    if (!active.length && strands.length) {
      setProblem("Keep at least one teaching area active, or deactivate the subject itself.");
      return;
    }
    for (const strand of active) {
      if (strand.name.trim().length < 2) {
        setProblem("Every active teaching area needs a name.");
        return;
      }
      if (!offeredClasses.length) {
        setProblem("Assign this subject to at least one class before assigning teaching areas.");
        return;
      }
      const assigned = Object.values(strand.assignments).filter(Boolean);
      if (assigned.length !== offeredClasses.length) {
        setProblem(`Assign a qualified teacher for ${strand.name} in every class that takes ${subject.code}.`);
        return;
      }
    }
    const weights = active.map((strand) => Number(strand.examWeightPercent) || 0);
    if (weights.some((weight) => weight > 0) && Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 100) > 0.01) {
      setProblem("When examination contributions are configured, teaching-area weights must add up to 100%.");
      return;
    }
    setProblem(null);
    onSave({
      strands: strands.map((strand, sortOrder) => ({
        ...(strand.id ? { id: strand.id } : {}),
        name: strand.name.trim(),
        code: strand.code.trim() || undefined,
        description: strand.description.trim() || undefined,
        sortOrder,
        examWeightPercent: Number(strand.examWeightPercent) || 0,
        isActive: strand.isActive,
        assignments: strand.isActive ? offeredClasses.map((schoolClass) => ({
          classId: schoolClass.id,
          teacherId: strand.assignments[schoolClass.id] ?? "",
        })).filter((assignment) => assignment.teacherId) : [],
      })),
    });
  }

  return (
    <FormModal
      title={`Teaching areas for ${subject.name}`}
      description={`Keep ${subject.code} as one reportable subject. Each teaching area has a class-specific teacher allocation and can own its assessment components.`}
      size="4xl"
      onClose={onCancel}
      onSubmit={submit}
      submitLabel="Save teaching areas"
      submitting={pending}
      submitDisabled={loading || !qualifiedTeachers.length || !offeredClasses.length}
      error={problem ?? error}
    >
      {!qualifiedTeachers.length && (
        <p className="mb-3 rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-xs text-warning">
          First use the Teachers action to add qualified teachers to {subject.name}. Only qualified teachers can be assigned to a teaching area.
        </p>
      )}
      {!offeredClasses.length && (
        <p className="mb-3 rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-xs text-warning">
          Assign {subject.name} to classes first. Teaching-area responsibilities are set per class.
        </p>
      )}
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading classes and teachers…</p>
      ) : (
        <div className="space-y-3">
          {strands.map((strand, index) => (
            <section key={strand.key} className="space-y-3 rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="h-9 min-w-[180px] flex-1 rounded-lg border border-border bg-card px-3 text-xs"
                  aria-label={`Teaching area ${index + 1} name`}
                  value={strand.name}
                  onChange={(event) => update(strand.key, { name: event.target.value })}
                  placeholder="e.g. Visual Arts"
                  disabled={!strand.isActive}
                />
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={strand.isActive} onChange={(event) => update(strand.key, { isActive: event.target.checked })} />
                  Active
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <FormField label="Code (optional)" htmlFor={`strand-code-${strand.key}`}>
                  <FormInput id={`strand-code-${strand.key}`} value={strand.code} onChange={(event) => update(strand.key, { code: event.target.value.toUpperCase() })} disabled={!strand.isActive} placeholder="ART" />
                </FormField>
                <FormField label="Exam contribution (%)" htmlFor={`strand-weight-${strand.key}`} hint="Optional; active areas must total 100% when used.">
                  <FormInput id={`strand-weight-${strand.key}`} type="number" min={0} max={100} step="0.01" value={strand.examWeightPercent} onChange={(event) => update(strand.key, { examWeightPercent: event.target.value })} disabled={!strand.isActive} />
                </FormField>
                <FormField label="Description (optional)" htmlFor={`strand-description-${strand.key}`}>
                  <FormInput id={`strand-description-${strand.key}`} value={strand.description} onChange={(event) => update(strand.key, { description: event.target.value })} disabled={!strand.isActive} />
                </FormField>
              </div>
              {strand.isActive && offeredClasses.map((schoolClass) => (
                <div key={schoolClass.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
                  <span className="text-xs font-semibold">{schoolClass.name}</span>
                  <Select
                    value={strand.assignments[schoolClass.id] || "__none__"}
                    onValueChange={(teacherId) => update(strand.key, { assignments: { ...strand.assignments, [schoolClass.id]: teacherId === "__none__" ? "" : teacherId } })}
                  >
                    <SelectTrigger aria-label={`${strand.name} teacher for ${schoolClass.name}`} className="h-9 min-w-48 rounded-lg border border-border bg-card px-3 text-xs">
                      <SelectValue placeholder="Choose teacher" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Choose teacher</SelectItem>
                      {qualifiedTeachers.map((teacher) => (
                        <SelectItem key={teacher.id} value={teacher.id}>{teacher.firstName} {teacher.lastName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </section>
          ))}
          {!strands.length && <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">No teaching areas configured. Add one only when the subject is genuinely delivered by different specialists.</p>}
          {strands.length < 50 && (
            <button type="button" className={outline} onClick={() => setStrands((current) => [...current, {
              key: `new-${Date.now()}-${current.length}`,
              name: "",
              code: "",
              description: "",
              examWeightPercent: "0",
              isActive: true,
              assignments: {},
            }])}>
              <Plus className="size-4" /> Add teaching area
            </button>
          )}
        </div>
      )}
    </FormModal>
  );
}

function TeacherPanel({
  subject,
  teachers,
  loading,
  pending,
  error,
  onSave,
  onCancel,
}: {
  subject: SubjectRow;
  teachers: TeacherOption[];
  loading: boolean;
  pending: boolean;
  error?: string;
  onSave: (teacherIds: string[]) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState(() => new Set(subject.teachers.map((teacher) => teacher.id)));
  return (
    <FormModal
      title={`Teachers qualified for ${subject.name}`}
      description="These teachers can be suggested when this subject is placed on the timetable."
      size="3xl"
      onClose={onCancel}
      onSubmit={() => onSave([...selected])}
      submitLabel="Save teachers"
      submitting={pending}
      submitDisabled={loading}
      error={error}
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
    </FormModal>
  );
}
