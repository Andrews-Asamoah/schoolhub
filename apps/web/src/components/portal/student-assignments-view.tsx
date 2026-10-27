import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CalendarClock, CheckCircle2, ClipboardList, Clock, LoaderCircle, Send } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { PortalModal } from "./portal-modal";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { apiFetch } from "@/lib/api";

interface StudentAssignmentSubmission {
  id: string;
  responseText: string;
  status: "SUBMITTED" | "GRADED";
  score: number | null;
  feedback: string | null;
  submittedAt: string;
  gradedAt: string | null;
}
interface StudentAssignment {
  id: string;
  title: string;
  instructions: string;
  dueAt: string | null;
  maxScore: number;
  status: "PUBLISHED";
  createdAt: string;
  subject: { id: string; name: string; code: string };
  teacher: { id: string; name: string };
  submission: StudentAssignmentSubmission | null;
}
interface StudentAssignmentsResponse {
  class: { id: string; name: string; level: string } | null;
  academicYear: { id: string; name: string } | null;
  term: { id: string; name: string } | null;
  assignments: StudentAssignment[];
}
type Filter = "ALL" | "TODO" | "SUBMITTED" | "GRADED";

const dateTime = (value: string) =>
  new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

function isOverdue(assignment: StudentAssignment) {
  return !assignment.submission && !!assignment.dueAt && new Date(assignment.dueAt).getTime() < Date.now();
}

function statusLabel(assignment: StudentAssignment) {
  if (assignment.submission?.status === "GRADED") return "Graded";
  if (assignment.submission?.status === "SUBMITTED") return "Submitted";
  return isOverdue(assignment) ? "Overdue" : "To do";
}

export function StudentAssignmentsView() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [activeAssignment, setActiveAssignment] = useState<StudentAssignment | null>(null);
  const [responseText, setResponseText] = useState("");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const query = useQuery({
    queryKey: ["assignments", "student"],
    queryFn: () => apiFetch<StudentAssignmentsResponse>("/assignments"),
    retry: false,
  });

  const submitMutation = useMutation({
    mutationFn: (input: { assignmentId: string; responseText: string }) =>
      apiFetch<StudentAssignmentSubmission>(`/assignments/${input.assignmentId}/submission`, {
        method: "POST",
        body: JSON.stringify({ responseText: input.responseText }),
      }),
    onSuccess: async () => {
      setActiveAssignment(null);
      setResponseText("");
      setNotice({ ok: true, text: "Your response has been saved and the teacher has been notified." });
      await queryClient.invalidateQueries({ queryKey: ["assignments"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error: Error) => setNotice({ ok: false, text: error.message }),
  });

  const assignments = query.data?.assignments ?? [];
  const counts = useMemo(() => ({
    todo: assignments.filter((assignment) => !assignment.submission).length,
    submitted: assignments.filter((assignment) => assignment.submission?.status === "SUBMITTED").length,
    graded: assignments.filter((assignment) => assignment.submission?.status === "GRADED").length,
  }), [assignments]);
  const filtered = assignments.filter((assignment) => {
    if (filter === "TODO") return !assignment.submission;
    if (filter === "SUBMITTED") return assignment.submission?.status === "SUBMITTED";
    if (filter === "GRADED") return assignment.submission?.status === "GRADED";
    return true;
  });

  function openSubmission(assignment: StudentAssignment) {
    setActiveAssignment(assignment);
    setResponseText(assignment.submission?.responseText ?? "");
    setNotice(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeAssignment) return;
    setNotice(null);
    submitMutation.mutate({
      assignmentId: activeAssignment.id,
      responseText: responseText.trim(),
    });
  }

  if (query.isPending) {
    return <div role="status" className="flex min-h-48 items-center justify-center gap-2 rounded-2xl border border-border bg-card text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin text-primary" />Loading published assignments…</div>;
  }

  if (query.isError) {
    return <ErrorState message={`Assignments could not be loaded: ${query.error.message}`} onRetry={() => void query.refetch()} />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Student portal"
        title="Assignments & coursework"
        description="Review published work, submit your written responses, and check grades or teacher feedback."
        icon={ClipboardList}
      />

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><BookOpen className="size-5" /></span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{query.data?.class?.name ?? "Current class not assigned"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{[query.data?.academicYear?.name, query.data?.term?.name].filter(Boolean).join(" · ") || "Current academic term"}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:min-w-80">
          <Summary label="To do" value={counts.todo} />
          <Summary label="Submitted" value={counts.submitted} />
          <Summary label="Graded" value={counts.graded} />
        </div>
      </section>

      {notice && <p role={notice.ok ? "status" : "alert"} className={`rounded-xl border px-4 py-3 text-sm ${notice.ok ? "border-success/20 bg-success/10 text-success" : "border-destructive/20 bg-destructive/10 text-destructive"}`}>{notice.text}</p>}

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter assignments">
        {([
          ["ALL", "All assignments", assignments.length],
          ["TODO", "To do", counts.todo],
          ["SUBMITTED", "Submitted", counts.submitted],
          ["GRADED", "Graded", counts.graded],
        ] as const).map(([value, label, count]) => (
          <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${filter === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
            {label}<span className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${filter === value ? "bg-primary-foreground/15" : "bg-muted"}`}>{count}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={assignments.length === 0 ? "No published assignments" : "No assignments in this filter"}
          description={assignments.length === 0
            ? query.data?.class
              ? "Your teachers' published assignments for the current term will appear here. New work will also create a notification."
              : "Ask the school office to confirm your current class enrollment if this looks incorrect."
            : "Choose another filter to see your current assignments."}
        />
      ) : (
        <section aria-label="Published assignments" className="grid min-w-0 gap-3 xl:grid-cols-2">
          {filtered.map((assignment) => {
            const status = statusLabel(assignment);
            const statusClass = assignment.submission?.status === "GRADED"
              ? "bg-success/10 text-success"
              : assignment.submission?.status === "SUBMITTED"
                ? "bg-primary/10 text-primary"
                : isOverdue(assignment)
                  ? "bg-destructive/10 text-destructive"
                  : "bg-warning/10 text-warning";
            return (
              <article key={assignment.id} className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">{assignment.subject.code} · {assignment.subject.name}</p>
                    <h2 className="mt-1.5 break-words text-base font-bold text-foreground">{assignment.title}</h2>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${statusClass}`}>{status}</span>
                </div>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{assignment.instructions}</p>
                <div className="mt-4 grid gap-2 rounded-xl bg-muted/30 p-3 text-xs sm:grid-cols-2">
                  <div className="flex min-w-0 items-start gap-2 text-muted-foreground"><CalendarClock className="mt-0.5 size-4 shrink-0" /><span>{assignment.dueAt ? `Due ${dateTime(assignment.dueAt)}` : "No due date specified"}</span></div>
                  <div className="flex min-w-0 items-start gap-2 text-muted-foreground"><Clock className="mt-0.5 size-4 shrink-0" /><span>Maximum score: {assignment.maxScore}</span></div>
                </div>
                {assignment.submission?.status === "GRADED" && (
                  <section className="mt-3 rounded-xl border border-success/20 bg-success/5 p-3">
                    <div className="flex items-start justify-between gap-3"><p className="text-xs font-semibold text-foreground">Teacher feedback</p><p className="shrink-0 text-sm font-bold tabular-nums text-success">{assignment.submission.score ?? "—"} / {assignment.maxScore}</p></div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{assignment.submission.feedback || "No written feedback was added."}</p>
                  </section>
                )}
                {assignment.submission?.status === "SUBMITTED" && <p className="mt-3 text-xs text-muted-foreground">Submitted {dateTime(assignment.submission.submittedAt)} · Awaiting teacher review.</p>}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                  <p className="text-[11px] text-muted-foreground">Set by {assignment.teacher.name}</p>
                  {assignment.submission?.status === "GRADED" ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success"><CheckCircle2 className="size-4" />Graded</span>
                  ) : (
                    <button type="button" onClick={() => openSubmission(assignment)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <Send className="size-3.5" />{assignment.submission ? "Edit response" : "Submit response"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}

      <PortalModal
        isOpen={!!activeAssignment}
        onClose={() => { setActiveAssignment(null); setNotice(null); }}
        title={activeAssignment ? `Submit: ${activeAssignment.title}` : "Submit assignment"}
        description={activeAssignment ? `${activeAssignment.subject.name} · ${activeAssignment.maxScore} marks maximum` : undefined}
        maxWidth="2xl"
        footer={<><button type="button" onClick={() => setActiveAssignment(null)} disabled={submitMutation.isPending} className="h-10 rounded-lg border border-border px-4 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50">Cancel</button><button type="submit" form="student-assignment-response" disabled={submitMutation.isPending || !responseText.trim()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{submitMutation.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}{submitMutation.isPending ? "Saving…" : "Save response"}</button></>}
      >
        <form id="student-assignment-response" onSubmit={submit} className="space-y-4">
          {notice && !notice.ok && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">{notice.text}</p>}
          <div className="rounded-xl border border-border bg-muted/30 p-3"><h3 className="text-xs font-semibold text-foreground">Instructions</h3><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{activeAssignment?.instructions}</p></div>
          <label className="grid gap-1.5 text-xs font-semibold text-foreground">Your response<textarea value={responseText} onChange={(event) => setResponseText(event.target.value)} required maxLength={20_000} rows={8} placeholder="Write your answer here…" className="min-h-44 resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-sm font-normal leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring" /><span className="text-right text-[10px] font-normal text-muted-foreground">{responseText.length.toLocaleString()} / 20,000 characters · Text responses only</span></label>
          <p className="text-[11px] leading-5 text-muted-foreground">Your saved response is visible to your subject teacher. After it has been graded, it can no longer be edited.</p>
        </form>
      </PortalModal>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-border bg-background px-3 py-2"><p className="text-[10px] text-muted-foreground">{label}</p><p className="mt-1 text-lg font-bold tabular-nums text-foreground">{value}</p></div>;
}
