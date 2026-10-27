import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ClipboardList, LoaderCircle, Plus, Send } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { DatePicker } from "@/components/ui/date-picker";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PortalModal } from "@/components/portal/portal-modal";
import { useTeachingOverview } from "@/lib/teaching";
import { useSchoolRole } from "@/components/school/school-role-switcher";
import { apiFetch } from "@/lib/api";

interface Submission {
  id: string;
  responseText: string;
  status: "SUBMITTED" | "GRADED";
  score: number | null;
  feedback: string | null;
  submittedAt: string;
  gradedAt: string | null;
  student: {
    id: string;
    studentId: string;
    admissionNumber: string | null;
    profile: { firstName: string; lastName: string };
  };
  submittedBy: { id: string; name: string };
  gradedBy: { id: string; name: string } | null;
}
interface ManagedAssignment {
  id: string;
  title: string;
  instructions: string;
  dueAt: string | null;
  maxScore: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  createdAt: string;
  class: { id: string; name: string; level: string };
  subject: { id: string; name: string; code: string };
  createdBy: { id: string; name: string };
  submissions: Submission[];
  notifiedStudents?: number;
}
interface ManagedAssignmentsResponse {
  academicYear: { id: string; name: string };
  term: { id: string; name: string };
  assignments: ManagedAssignment[];
}

const dateTime = (value: string) =>
  new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
interface AssignmentClassOption {
  id: string;
  name: string;
  level: string;
  subjects: { id: string; name: string; code: string }[];
}
interface ManagerClass {
  id: string;
  name: string;
  level: string;
  isActive: boolean;
}
interface ManagerSubject {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  classes: { classId: string; className: string }[];
}

export function TeacherAssignmentsWorkspace() {
  const queryClient = useQueryClient();
  const { activeRole } = useSchoolRole();
  const teacherMode = activeRole === "teacher";
  const managerMode = ["owner", "admin", "headteacher"].includes(activeRole ?? "");
  const canPublish = teacherMode || managerMode;
  const teaching = useTeachingOverview(teacherMode);
  const managerClassesQuery = useQuery({
    queryKey: ["academics", "classes", "assignments"],
    queryFn: () => apiFetch<ManagerClass[]>("/academics/classes"),
    enabled: managerMode,
    retry: false,
  });
  const managerSubjectsQuery = useQuery({
    queryKey: ["subjects", "assignments"],
    queryFn: () => apiFetch<ManagerSubject[]>("/subjects?includeInactive=true"),
    enabled: managerMode,
    retry: false,
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [maxScore, setMaxScore] = useState("100");
  const [createError, setCreateError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [gradeTarget, setGradeTarget] = useState<{ assignment: ManagedAssignment; submission: Submission } | null>(null);
  const [score, setScore] = useState("");
  const [feedback, setFeedback] = useState("");
  const [gradeError, setGradeError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["assignments", "manage"],
    queryFn: () => apiFetch<ManagedAssignmentsResponse>("/assignments/manage"),
    retry: false,
  });

  const classes = useMemo<AssignmentClassOption[]>(() => {
    if (teacherMode) {
      return (teaching.data?.classes ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        level: item.level,
        subjects: item.subjects,
      }));
    }
    if (managerMode) {
      const subjects = (managerSubjectsQuery.data ?? []).filter((subject) => subject.isActive);
      return (managerClassesQuery.data ?? [])
        .filter((schoolClass) => schoolClass.isActive)
        .map((schoolClass) => ({
          id: schoolClass.id,
          name: schoolClass.name,
          level: schoolClass.level,
          subjects: subjects
            .filter((subject) => subject.classes.some((row) => row.classId === schoolClass.id))
            .map(({ id, name, code }) => ({ id, name, code })),
        }));
    }
    return [];
  }, [teacherMode, managerMode, teaching.data, managerClassesQuery.data, managerSubjectsQuery.data]);
  const selectedClass = classes.find((item) => item.id === classId) ?? null;
  const subjects = selectedClass?.subjects ?? [];
  const referenceLoading = teacherMode
    ? teaching.isPending
    : managerMode && (managerClassesQuery.isPending || managerSubjectsQuery.isPending);
  const referenceError = teacherMode
    ? teaching.error
    : managerMode
      ? managerClassesQuery.error ?? managerSubjectsQuery.error
      : null;

  const createMutation = useMutation({
    mutationFn: () => {
      if (!classId || !subjectId) throw new Error("Choose a class and subject.");
      if (!title.trim() || !instructions.trim()) throw new Error("Enter the assignment title and instructions.");
      const numericMax = Number(maxScore);
      if (!Number.isFinite(numericMax) || numericMax <= 0 || numericMax > 100_000) {
        throw new Error("Maximum score must be greater than zero.");
      }
      const dueAt = dueDate ? new Date(`${dueDate}T23:59:00`).toISOString() : null;
      return apiFetch<ManagedAssignment>("/assignments", {
        method: "POST",
        body: JSON.stringify({
          classId,
          subjectId,
          title: title.trim(),
          instructions: instructions.trim(),
          dueAt,
          maxScore: numericMax,
        }),
      });
    },
    onSuccess: async (created) => {
      setCreateOpen(false);
      setTitle("");
      setInstructions("");
      setDueDate("");
      setMaxScore("100");
      setSubjectId("");
      setCreateError(null);
      setNotice({ ok: true, text: `“${created.title}” was published. ${created.notifiedStudents ?? 0} student notification(s) created.` });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["assignments"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
    },
    onError: (error: Error) => setCreateError(error.message),
  });

  const gradeMutation = useMutation({
    mutationFn: () => {
      if (!gradeTarget) throw new Error("Choose a submission to grade.");
      const numericScore = Number(score);
      if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > gradeTarget.assignment.maxScore) {
        throw new Error(`Score must be between 0 and ${gradeTarget.assignment.maxScore}.`);
      }
      return apiFetch<{ id: string; score: number; status: "GRADED" }>(
        `/assignments/${gradeTarget.assignment.id}/submissions/${gradeTarget.submission.id}/grade`,
        { method: "PATCH", body: JSON.stringify({ score: numericScore, feedback: feedback.trim() || null }) },
      );
    },
    onSuccess: async () => {
      setGradeTarget(null);
      setScore("");
      setFeedback("");
      setGradeError(null);
      setNotice({ ok: true, text: "Grade saved and student notified." });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["assignments"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
    },
    onError: (error: Error) => setGradeError(error.message),
  });

  const pendingSubmissions = useMemo(
    () => (query.data?.assignments ?? []).reduce((total, assignment) =>
      total + assignment.submissions.filter((submission) => submission.status === "SUBMITTED").length, 0),
    [query.data],
  );

  function openGrade(assignment: ManagedAssignment, submission: Submission) {
    setGradeTarget({ assignment, submission });
    setScore(submission.score === null ? "" : String(submission.score));
    setFeedback(submission.feedback ?? "");
    setGradeError(null);
  }

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    createMutation.mutate();
  }

  function submitGrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGradeError(null);
    gradeMutation.mutate();
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Teacher workspace"
        title="Assignments & submissions"
        description="Publish coursework for your assigned subjects, review student responses, and record marks with feedback."
        icon={ClipboardList}
        actions={<button type="button" onClick={() => { setCreateError(null); setCreateOpen(true); }} disabled={!canPublish || referenceLoading || classes.length === 0} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"><Plus className="size-4" />Publish assignment</button>}
      />

      {notice && <div role={notice.ok ? "status" : "alert"} className={`rounded-xl border px-4 py-3 text-sm ${notice.ok ? "border-success/20 bg-success/10 text-success" : "border-destructive/20 bg-destructive/10 text-destructive"}`}>{notice.text}</div>}

      {referenceLoading ? (
        <div role="status" className="flex min-h-40 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading your teaching assignments…</div>
      ) : referenceError ? (
        <ErrorState
          message={`Class and subject assignments could not be loaded: ${referenceError.message}`}
          onRetry={() => {
            if (teacherMode) void teaching.refetch();
            else {
              void managerClassesQuery.refetch();
              void managerSubjectsQuery.refetch();
            }
          }}
        />
      ) : classes.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No assigned classes or subjects" description="Ask a school administrator to assign you to a class and subject before publishing coursework." />
      ) : query.isPending ? (
        <div role="status" className="flex min-h-40 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading assignments and submissions…</div>
      ) : query.isError ? (
        <ErrorState message={`Assignments could not be loaded: ${query.error.message}`} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <Summary label="Published this term" value={(query.data?.assignments ?? []).filter((assignment) => assignment.status === "PUBLISHED").length} />
            <Summary label="Student submissions" value={(query.data?.assignments ?? []).reduce((total, assignment) => total + assignment.submissions.length, 0)} />
            <Summary label="Awaiting grading" value={pendingSubmissions} />
          </section>

          <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
            <div className="min-w-0"><p className="text-xs font-semibold text-foreground">{query.data?.academicYear.name} · {query.data?.term.name}</p><p className="mt-1 text-[11px] text-muted-foreground">Only records from the active school and academic term are shown.</p></div>
            <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"><LoaderCircle className={`size-3.5 ${query.isFetching ? "animate-spin" : "hidden"}`} />Refresh</button>
          </section>

          {(query.data?.assignments ?? []).length === 0 ? (
            <EmptyState icon={ClipboardList} title="No assignments published this term" description="Create the first assignment for one of your assigned class subjects using Publish assignment." />
          ) : (
            <section className="space-y-3" aria-label="Assignments">
              {query.data.assignments.map((assignment) => (
                <article key={assignment.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                  <header className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">{assignment.subject.code}</span><span className="text-[11px] text-muted-foreground">{assignment.class.name}</span></div>
                      <h2 className="mt-2 break-words text-base font-bold text-foreground">{assignment.title}</h2>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{assignment.instructions}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-end"><span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold text-foreground">{assignment.status}</span><span className="text-xs font-semibold tabular-nums text-foreground">Max {assignment.maxScore} marks</span><span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><CalendarClock className="size-3.5" />{assignment.dueAt ? dateTime(assignment.dueAt) : "No due date"}</span></div>
                  </header>
                  <div className="p-4 sm:p-5">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-foreground">Student submissions</h3><span className="text-xs text-muted-foreground">{assignment.submissions.length} received</span></div>
                    {assignment.submissions.length === 0 ? <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">No students have submitted a response yet.</p> : (
                      <div className="space-y-3">
                        {assignment.submissions.map((submission) => {
                          const studentName = `${submission.student.profile.firstName} ${submission.student.profile.lastName}`.trim();
                          return (
                            <article key={submission.id} className="rounded-xl border border-border bg-background p-3 sm:p-4">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0"><p className="break-words text-sm font-semibold text-foreground">{studentName || submission.submittedBy.name}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{submission.student.admissionNumber || submission.student.studentId} · Submitted {dateTime(submission.submittedAt)}</p></div>
                                <div className="flex shrink-0 items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${submission.status === "GRADED" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>{submission.status === "GRADED" ? "Graded" : "Awaiting grading"}</span>{submission.status === "GRADED" && <span className="text-xs font-bold tabular-nums text-foreground">{submission.score ?? "—"} / {assignment.maxScore}</span>}</div>
                              </div>
                              <div className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-muted/30 p-3 text-sm leading-6 text-foreground">{submission.responseText}</div>
                              {submission.feedback && <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground"><span className="font-semibold text-foreground">Feedback: </span>{submission.feedback}</p>}
                              <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] text-muted-foreground">{submission.gradedBy ? `Graded by ${submission.gradedBy.name}` : "Not graded yet"}</p><button type="button" onClick={() => openGrade(assignment, submission)} className="inline-flex h-8 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{submission.status === "GRADED" ? "Update grade" : "Grade response"}</button></div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </section>
          )}
        </>
      )}

      <PortalModal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Publish assignment" description="New work is published to active students enrolled in the selected class for the current term." maxWidth="2xl" footer={<><button type="button" onClick={() => setCreateOpen(false)} disabled={createMutation.isPending} className="h-10 rounded-lg border border-border px-4 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50">Cancel</button><button type="submit" form="teacher-create-assignment" disabled={createMutation.isPending || !classId || !subjectId} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{createMutation.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}{createMutation.isPending ? "Publishing…" : "Publish assignment"}</button></>}>
        <form id="teacher-create-assignment" onSubmit={submitCreate} className="space-y-4">
          {createError && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">{createError}</p>}
          <label className="grid gap-1.5 text-xs font-semibold text-foreground">Class
            <Select value={classId || "__none__"} onValueChange={(value) => { setClassId(value === "__none__" ? "" : value); setSubjectId(""); }}>
              <SelectTrigger aria-label="Assignment class" className="h-10"><SelectValue placeholder="Choose a class" /></SelectTrigger>
              <SelectContent>{classes.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
            </Select>
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-foreground">Subject
            <Select value={subjectId || "__none__"} onValueChange={setSubjectId} disabled={!selectedClass || subjects.length === 0}>
              <SelectTrigger aria-label="Assignment subject" className="h-10"><SelectValue placeholder={selectedClass ? "Choose a subject" : "Choose a class first"} /></SelectTrigger>
              <SelectContent>{subjects.map((item) => <SelectItem key={item.id} value={item.id}>{item.name} ({item.code})</SelectItem>)}</SelectContent>
            </Select>
          </label>
          {selectedClass && subjects.length === 0 && <p className="text-xs text-warning">No subjects are assigned to this class in your teaching overview.</p>}
          <label className="grid gap-1.5 text-xs font-semibold text-foreground">Assignment title<input value={title} onChange={(event) => setTitle(event.target.value)} required minLength={3} maxLength={160} placeholder="e.g. Algebra practice exercise" className="h-10 rounded-lg border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
          <label className="grid gap-1.5 text-xs font-semibold text-foreground">Instructions<textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} required maxLength={10_000} rows={5} placeholder="Explain what students need to complete…" className="min-h-28 resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-sm font-normal leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring" /><span className="text-right text-[10px] font-normal text-muted-foreground">{instructions.length.toLocaleString()} / 10,000 characters</span></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-semibold text-foreground">Due date <span className="font-normal text-muted-foreground">(optional)</span><DatePicker value={dueDate} onChange={setDueDate} clearable placeholder="Choose due date" ariaLabel="Assignment due date" /></label>
            <label className="grid gap-1.5 text-xs font-semibold text-foreground">Maximum score<input value={maxScore} onChange={(event) => setMaxScore(event.target.value)} type="number" required min="0.01" max="100000" step="0.01" className="h-10 rounded-lg border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
          </div>
          <p className="text-[11px] leading-5 text-muted-foreground">Students receive an in-app notification when the assignment is published. Responses are currently text-only because private file submissions have not been enabled.</p>
        </form>
      </PortalModal>

      <PortalModal isOpen={!!gradeTarget} onClose={() => { setGradeTarget(null); setGradeError(null); }} title={gradeTarget ? `Grade: ${gradeTarget.assignment.title}` : "Grade response"} description={gradeTarget ? `${gradeTarget.submission.student.profile.firstName} ${gradeTarget.submission.student.profile.lastName} · Maximum ${gradeTarget.assignment.maxScore} marks` : undefined} maxWidth="lg" footer={<><button type="button" onClick={() => setGradeTarget(null)} disabled={gradeMutation.isPending} className="h-10 rounded-lg border border-border px-4 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50">Cancel</button><button type="submit" form="teacher-grade-assignment" disabled={gradeMutation.isPending || !score.trim()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{gradeMutation.isPending && <LoaderCircle className="size-4 animate-spin" />}Save grade</button></>}>
        <form id="teacher-grade-assignment" onSubmit={submitGrade} className="space-y-4">
          {gradeError && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">{gradeError}</p>}
          <div className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/30 p-3 text-sm leading-6 text-foreground">{gradeTarget?.submission.responseText}</div>
          <label className="grid gap-1.5 text-xs font-semibold text-foreground">Score<input type="number" value={score} onChange={(event) => setScore(event.target.value)} required min="0" max={gradeTarget?.assignment.maxScore ?? 100000} step="0.01" className="h-10 rounded-lg border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
          <label className="grid gap-1.5 text-xs font-semibold text-foreground">Feedback <span className="font-normal text-muted-foreground">(optional)</span><textarea rows={4} maxLength={2000} value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Explain the result or suggest improvements…" className="min-h-24 resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
          <p className="text-[11px] leading-5 text-muted-foreground">Saving this grade notifies the student. A graded submission cannot be edited by the student.</p>
        </form>
      </PortalModal>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-border bg-card p-4 shadow-sm"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{value}</p></div>;
}
