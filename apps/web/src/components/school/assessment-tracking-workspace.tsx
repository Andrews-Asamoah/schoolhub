import { toast } from "@/components/ui/toaster";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, LoaderCircle, Printer, ShieldAlert, Unlock } from "lucide-react";
import { useMemo, useState } from "react";
import { FormField, FormTextarea } from "@/components/forms/form-controls";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { FormModal } from "@/components/ui/form-modal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import {
  STATUS_LABEL,
  STATUS_VARIANT,
  formatDate,
  formatMark,
  type CorrectionRow,
  type CorrectionStatus,
  type TrackingOverview,
  type TrackingSheet,
  type TrackingStatus,
} from "@/lib/assessment-tracking";
import { cn } from "@/lib/utils";

const ALL = "__all__";
const field = "h-9 min-w-40 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground/80 outline-none focus:border-primary/50";
const label = "grid gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70";
const post = <T,>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
const APPROVER_ROLES = ["owner", "admin", "headteacher"];

type Tab = "sheets" | "teachers" | "corrections";

/**
 * Admin view of marks entry. For one assessment it shows how much of each
 * class and subject is done, who is behind, and lets managers extend a
 * deadline, reopen a signed-off sheet or send reminders. The Corrections tab is
 * where late changes to marks are reviewed; only the owner, an administrator or the headteacher decides.
 */
export function AssessmentTrackingWorkspace({ role }: { role?: string }) {
  const queryClient = useQueryClient();
  const canDecide = APPROVER_ROLES.includes(role ?? "");
  const [tab, setTab] = useState<Tab>("sheets");
  const [templateId, setTemplateId] = useState("");
  const [classId, setClassId] = useState(ALL);
  const [teacherId, setTeacherId] = useState(ALL);
  const [status, setStatus] = useState<string>(ALL);

  const [extending, setExtending] = useState<TrackingSheet | null>(null);
  const [reopening, setReopening] = useState<TrackingSheet | null>(null);

  const overview = useQuery({
    queryKey: ["assessments", "tracking", templateId, classId, teacherId, status],
    queryFn: () => {
      const params = new URLSearchParams();
      if (templateId) params.set("templateId", templateId);
      if (classId !== ALL) params.set("classId", classId);
      if (teacherId !== ALL) params.set("teacherId", teacherId);
      if (status !== ALL) params.set("status", status);
      return apiFetch<TrackingOverview>(`/assessments/tracking?${params}`);
    },
    placeholderData: (previous) => previous,
    retry: false,
  });
  const data = overview.data;
  const activeTemplateId = data?.template?.id ?? "";

  // Class and teacher choices come from the unfiltered sheet set, so a filter never empties its own dropdown.
  const options = useQuery({
    queryKey: ["assessments", "tracking", activeTemplateId, ALL, ALL, ALL],
    queryFn: () => apiFetch<TrackingOverview>(`/assessments/tracking?templateId=${activeTemplateId}`),
    enabled: !!activeTemplateId,
    retry: false,
  });
  const classChoices = useMemo(
    () => [...new Map((options.data?.sheets ?? []).map((sheet) => [sheet.classId, sheet.className])).entries()],
    [options.data],
  );
  const teacherChoices = options.data?.teachers.filter((row) => row.teacherId) ?? [];

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["assessments"] });
  const remind = useMutation({
    mutationFn: () => post<{ sent: number; skipped: number }>("/assessments/tracking/remind", { templateId: activeTemplateId }),
    onSuccess: (result) =>
      toast.success(result.sent ? `Reminded ${result.sent} teacher${result.sent === 1 ? "" : "s"}${result.skipped ? ` (${result.skipped} reminded recently)` : ""}.` : "No reminders sent. Everyone is either up to date or was reminded in the last 12 hours."),
  });

  const summary = data?.summary;
  return (
    <div className="space-y-5 print:space-y-3">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border/80 bg-card p-4 print:hidden">
        <label className={label}>
          Assessment
          <Select value={activeTemplateId || ALL} onValueChange={(value) => { setTemplateId(value === ALL ? "" : value); setClassId(ALL); setTeacherId(ALL); setStatus(ALL);  }}>
            <SelectTrigger aria-label="Assessment" className={cn(field, "min-w-52")}><SelectValue placeholder="No assessments" /></SelectTrigger>
            <SelectContent>{(data?.templates ?? []).map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
          </Select>
        </label>
        <label className={label}>
          Class
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger aria-label="Class" className={field}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All classes</SelectItem>{classChoices.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent>
          </Select>
        </label>
        <label className={label}>
          Teacher
          <Select value={teacherId} onValueChange={setTeacherId}>
            <SelectTrigger aria-label="Teacher" className={field}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All teachers</SelectItem>{teacherChoices.map((row) => <SelectItem key={row.teacherId!} value={row.teacherId!}>{row.name}</SelectItem>)}</SelectContent>
          </Select>
        </label>
        <label className={label}>
          Status
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger aria-label="Status" className={field}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {(["OVERDUE", "NOT_STARTED", "IN_PROGRESS", "COMPLETE", "SUBMITTED"] as TrackingStatus[]).map((value) => <SelectItem key={value} value={value}>{STATUS_LABEL[value]}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => remind.mutate()} disabled={!activeTemplateId || remind.isPending}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold hover:bg-muted disabled:opacity-50">
            {remind.isPending ? <LoaderCircle className="size-3.5 animate-spin" /> : <BellRing className="size-3.5" />} Remind teachers
          </button>
          <button type="button" onClick={() => window.print()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold hover:bg-muted">
            <Printer className="size-3.5" /> Print
          </button>
        </div>
      </div>


      {remind.error && <p role="alert" className="text-xs text-destructive">{remind.error.message}</p>}
      {overview.error && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">{overview.error.message}</p>}
      {overview.isPending && <p className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading…</p>}

      {data && !data.template && (
        <p className="rounded-xl border border-warning/20 bg-warning/10 px-4 py-3 text-xs text-warning">No assessment applies to the current term yet. Create one under Assessments → Assessment setup.</p>
      )}

      {summary && data?.template && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat title="Completion" value={`${summary.percent}%`} detail={`${summary.sheets} sheets · ${data.term.name}`} />
            <Stat title="Submitted" value={summary.submitted} tone="success" />
            <Stat title="Ready to submit" value={summary.complete} tone="warning" />
            <Stat title="In progress" value={summary.inProgress} />
            <Stat title="Not started" value={summary.notStarted} />
            <Stat title="Overdue" value={summary.overdue} tone={summary.overdue ? "destructive" : undefined} />
          </div>
          {summary.unassigned > 0 && (
            <p className="flex items-center gap-2 rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-xs text-warning">
              <ShieldAlert className="size-4" /> {summary.unassigned} class and subject pair{summary.unassigned === 1 ? " has" : "s have"} no teacher assigned, so nobody can enter those marks. Assign a teacher under Subjects.
            </p>
          )}
        </>
      )}

      {data?.template && (
        <>
          <div role="tablist" aria-label="Marks tracking" className="flex w-fit gap-1 rounded-2xl border border-border/80 bg-card p-1.5 print:hidden">
            {([["sheets", "Class sheets"], ["teachers", "By teacher"], ["corrections", "Corrections"]] as const).map(([id, text]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                className={cn("flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition", tab === id ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:bg-muted")}>
                {text}
                {id === "corrections" && data.pendingCorrections > 0 && <span className="rounded-full bg-destructive px-1.5 text-[10px] text-destructive-foreground">{data.pendingCorrections}</span>}
              </button>
            ))}
          </div>

          {tab === "sheets" && <SheetsTable sheets={data.sheets} onExtend={setExtending} onReopen={setReopening} />}
          {tab === "teachers" && (
            <section className="overflow-x-auto rounded-2xl border border-border/80 bg-card">
              <Table scroll={false} className="w-full text-left text-xs">
                <TableHeader className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                  <TableRow><TableHead>Teacher</TableHead><TableHead>Sheets</TableHead><TableHead>Submitted</TableHead><TableHead>Overdue</TableHead><TableHead className="min-w-48">Pupils done</TableHead></TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/60">
                  {data.teachers.map((row) => (
                    <TableRow key={row.teacherId ?? "none"} className={cn(!row.teacherId && "bg-warning/5")}>
                      <TableHead scope="row" className="text-left">
                        {row.teacherId ? <button type="button" className="hover:underline" onClick={() => { setTeacherId(row.teacherId!); setTab("sheets"); }}>{row.name}</button> : row.name}
                      </TableHead>
                      <TableCell className="tabular-nums">{row.sheets}</TableCell>
                      <TableCell className="tabular-nums">{row.submitted}</TableCell>
                      <TableCell className={cn("tabular-nums", row.overdue > 0 && "font-semibold text-destructive")}>{row.overdue}</TableCell>
                      <TableCell><Progress percent={row.percent} label={`${row.done}/${row.pupils}`} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          )}
          {tab === "corrections" && <Corrections canDecide={canDecide} onDecided={(text) => { toast.success(text); void refresh(); }} />}
        </>
      )}

      {extending && activeTemplateId && <ExtendModal sheet={extending} templateId={activeTemplateId} onClose={() => setExtending(null)} onDone={() => { setExtending(null); toast.success("Deadline extended."); void refresh(); }} />}
      {reopening && activeTemplateId && <ReopenModal sheet={reopening} templateId={activeTemplateId} onClose={() => setReopening(null)} onDone={() => { setReopening(null); toast.success("Sheet reopened for editing."); void refresh(); }} />}
    </div>
  );
}

function Stat({ title, value, detail, tone }: { title: string; value: string | number; detail?: string; tone?: "success" | "warning" | "destructive" }) {
  return (
    <div className="rounded-2xl border border-border/80 bg-card p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">{title}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", tone === "success" && "text-success", tone === "warning" && "text-warning", tone === "destructive" && "text-destructive")}>{value}</p>
      {detail && <p className="mt-0.5 text-[11px] text-muted-foreground">{detail}</p>}
    </div>
  );
}

function Progress({ percent, label }: { percent: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="h-2 w-28 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", percent === 100 ? "bg-success" : "bg-primary")} style={{ width: `${percent}%` }} />
      </div>
      <span className="tabular-nums text-muted-foreground">{percent}% · {label}</span>
    </div>
  );
}

function SheetsTable({ sheets, onExtend, onReopen }: { sheets: TrackingSheet[]; onExtend: (sheet: TrackingSheet) => void; onReopen: (sheet: TrackingSheet) => void }) {
  if (sheets.length === 0) return <p className="rounded-2xl border border-dashed border-input p-8 text-center text-xs text-muted-foreground">No class sheets match these filters.</p>;
  return (
    <section className="overflow-x-auto rounded-2xl border border-border/80 bg-card">
      <Table scroll={false} className="w-full text-left text-xs">
        <TableHeader className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground/70">
          <TableRow><TableHead>Class</TableHead><TableHead>Subject</TableHead><TableHead>Teacher</TableHead><TableHead className="min-w-48">Progress</TableHead><TableHead>Status</TableHead><TableHead>Deadline</TableHead><TableHead className="print:hidden"><span className="sr-only">Actions</span></TableHead></TableRow>
        </TableHeader>
        <TableBody className="divide-y divide-border/60">
          {sheets.map((sheet) => (
            <TableRow key={`${sheet.classId}|${sheet.subjectId}`}>
              <TableHead scope="row" className="text-left">{sheet.className}</TableHead>
              <TableCell>{sheet.subjectName}</TableCell>
              <TableCell>{sheet.teachers.length ? sheet.teachers.map((teacher) => teacher.name).join(", ") : <span className="text-warning">Not assigned</span>}</TableCell>
              <TableCell>
                {sheet.total === 0 ? <span className="text-muted-foreground">No pupils</span> : <Progress percent={sheet.percent} label={`${sheet.done}/${sheet.total}${sheet.excused ? ` · ${sheet.excused} excused` : ""}`} />}
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[sheet.status]}>{STATUS_LABEL[sheet.status]}</Badge>
                {sheet.hasPendingCorrection && <Badge variant="warning" className="ml-1">Correction pending</Badge>}
              </TableCell>
              <TableCell className="tabular-nums text-muted-foreground">{formatDate(sheet.deadline)}</TableCell>
              <TableCell className="print:hidden">
                <div className="flex justify-end gap-1.5">
                  {sheet.status === "SUBMITTED" ? (
                    <button type="button" onClick={() => onReopen(sheet)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 font-semibold hover:bg-muted"><Unlock className="size-3.5" /> Reopen</button>
                  ) : sheet.total > 0 && (
                    <button type="button" onClick={() => onExtend(sheet)} className="inline-flex h-8 items-center rounded-lg border border-border px-2.5 font-semibold hover:bg-muted">Extend</button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

function ExtendModal({ sheet, templateId, onClose, onDone }: { sheet: TrackingSheet; templateId: string; onClose: () => void; onDone: () => void }) {
  const [deadline, setDeadline] = useState("");
  const [teacherId, setTeacherId] = useState(ALL);
  const [reason, setReason] = useState("");
  const save = useMutation({
    mutationFn: () => post("/assessments/tracking/extend", { templateId, classId: sheet.classId, teacherId: teacherId === ALL ? null : teacherId, deadline, reason: reason || undefined }),
    onSuccess: onDone,
  });
  return (
    <FormModal title="Extend deadline" description={`${sheet.subjectName} · ${sheet.className}. The current deadline is ${formatDate(sheet.deadline)}.`} onClose={onClose}
      onSubmit={() => save.mutate()} submitLabel="Extend" submitting={save.isPending} submitDisabled={!deadline} error={save.error?.message ?? null} size="md">
      <div className="grid gap-4">
        <FormField label="New deadline" htmlFor="ext-date"><DatePicker buttonClassName="w-full" value={deadline} onChange={setDeadline} /></FormField>
        <label className={label}>
          Applies to
          <Select value={teacherId} onValueChange={setTeacherId}>
            <SelectTrigger aria-label="Applies to" className={cn(field, "w-full")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Everyone teaching {sheet.className}</SelectItem>
              {sheet.teachers.map((teacher) => <SelectItem key={teacher.id} value={teacher.id}>{teacher.name} only</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <FormField label="Reason (optional)" htmlFor="ext-reason"><FormTextarea id="ext-reason" rows={2} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></FormField>
      </div>
    </FormModal>
  );
}

function ReopenModal({ sheet, templateId, onClose, onDone }: { sheet: TrackingSheet; templateId: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const save = useMutation({
    mutationFn: () => post("/assessments/tracking/reopen", { templateId, classId: sheet.classId, subjectId: sheet.subjectId, reason }),
    onSuccess: onDone,
  });
  return (
    <FormModal title="Reopen submitted marks" description={`${sheet.subjectName} · ${sheet.className}. The teacher will be able to edit the marks again; set a new deadline if the old one has passed.`} onClose={onClose}
      onSubmit={() => save.mutate()} submitLabel="Reopen" submitting={save.isPending} submitDisabled={reason.trim().length < 10} error={save.error?.message ?? null} size="md">
      <FormField label="Reason" htmlFor="reopen-reason" hint="At least 10 characters. This is recorded in the audit trail."><FormTextarea id="reopen-reason" rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></FormField>
    </FormModal>
  );
}

const CORRECTION_FILTERS: { id: CorrectionStatus | "ALL"; label: string }[] = [
  { id: "PENDING", label: "Pending" }, { id: "APPROVED", label: "Approved" }, { id: "REJECTED", label: "Rejected" }, { id: "ALL", label: "All" },
];
const CORRECTION_VARIANT = { PENDING: "warning", APPROVED: "success", REJECTED: "destructive", CANCELLED: "secondary" } as const;

function Corrections({ canDecide, onDecided }: { canDecide: boolean; onDecided: (message: string) => void }) {
  const [filter, setFilter] = useState<CorrectionStatus | "ALL">("PENDING");
  const [rejecting, setRejecting] = useState<CorrectionRow | null>(null);
  const [approving, setApproving] = useState<CorrectionRow | null>(null);
  const list = useQuery({
    queryKey: ["assessments", "corrections", filter],
    queryFn: () => apiFetch<CorrectionRow[]>(`/assessments/corrections?status=${filter}`),
    retry: false,
  });
  const decide = useMutation({
    mutationFn: (args: { id: string; decision: "APPROVE" | "REJECT"; reason?: string }) =>
      post<{ status: string; publishedReports: { id: string; name: string }[] }>(`/assessments/corrections/${args.id}/review`, { decision: args.decision, reason: args.reason }),
    onSuccess: (result) => {
      setApproving(null);
      setRejecting(null);
      const stale = result.publishedReports.length ? ` Published reports (${result.publishedReports.map((report) => report.name).join(", ")}) still show the old marks; regenerate them.` : "";
      onDecided(result.status === "APPROVED" ? `Correction approved and marks updated.${stale}` : "Correction rejected.");
    },
  });
  return (
    <section className="space-y-3">
      <div className="flex gap-1.5 print:hidden">
        {CORRECTION_FILTERS.map((item) => (
          <button key={item.id} type="button" onClick={() => setFilter(item.id)} aria-pressed={filter === item.id}
            className={cn("rounded-lg border px-3 py-1.5 text-xs font-semibold", filter === item.id ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted")}>{item.label}</button>
        ))}
      </div>
      {list.isPending && <p className="text-xs text-muted-foreground">Loading…</p>}
      {list.error && <p role="alert" className="text-xs text-destructive">{list.error.message}</p>}
      {list.data?.length === 0 && <p className="rounded-2xl border border-dashed border-input p-8 text-center text-xs text-muted-foreground">No corrections to show.</p>}
      {decide.error && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">{decide.error.message}</p>}
      {list.data?.map((row) => (
        <article key={row.id} className="rounded-2xl border border-border/80 bg-card">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 p-4">
            <div>
              <h3 className="text-sm font-bold">{row.subjectName} · {row.className}</h3>
              <p className="text-xs text-muted-foreground">{row.templateName} · requested by {row.requester.name} on {formatDate(row.requestedAt)}</p>
            </div>
            <Badge variant={CORRECTION_VARIANT[row.status]}>{row.status.charAt(0) + row.status.slice(1).toLowerCase()}</Badge>
          </header>
          <p className="px-4 pt-3 text-xs"><span className="font-semibold">Reason: </span>{row.reason}</p>
          <div className="overflow-x-auto p-4">
            <Table scroll={false} className="w-full text-left text-xs">
              <TableHeader className="text-[10px] uppercase tracking-wide text-muted-foreground/70"><TableRow><TableHead>Pupil</TableHead><TableHead>Component</TableHead><TableHead>Was</TableHead><TableHead>Now</TableHead></TableRow></TableHeader>
              <TableBody className="divide-y divide-border/50">
                {row.items.map((item, index) => (
                  <TableRow key={index}>
                    <TableHead scope="row" className="text-left">{item.studentName}</TableHead>
                    <TableCell>{item.componentName}{item.occurrenceIndex > 0 ? ` ${item.occurrenceIndex + 1}` : ""}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{formatMark(item.previousMarks)}</TableCell>
                    <TableCell className="font-semibold tabular-nums">{formatMark(item.requestedMarks)}{item.maxMarks !== null && <span className="font-normal text-muted-foreground"> / {item.maxMarks}</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {row.status !== "PENDING" && row.reviewedBy && <p className="border-t border-border/60 px-4 py-2.5 text-xs text-muted-foreground">Decided by {row.reviewedBy} on {formatDate(row.reviewedAt)}{row.reviewReason ? `: ${row.reviewReason}` : ""}</p>}
          {row.status === "PENDING" && (
            <footer className="flex items-center justify-end gap-2 border-t border-border/60 p-3 print:hidden">
              {canDecide ? (
                <>
                  <button type="button" onClick={() => setRejecting(row)} className="h-9 rounded-lg border border-border px-4 text-xs font-semibold hover:bg-muted">Reject</button>
                  <button type="button" onClick={() => setApproving(row)} className="h-9 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90">Approve</button>
                </>
              ) : <p className="text-xs text-muted-foreground">Only the owner, an administrator or the headteacher can decide this request.</p>}
            </footer>
          )}
        </article>
      ))}
      <ConfirmDialog open={!!approving} title="Approve this correction?" loading={decide.isPending} confirmLabel="Approve and apply"
        description={`This updates ${approving?.items.length ?? 0} mark${approving?.items.length === 1 ? "" : "s"} for ${approving?.subjectName ?? ""} in ${approving?.className ?? ""} and recalculates totals, grades and positions. The change is recorded in the audit trail.`}
        onConfirm={() => approving && decide.mutate({ id: approving.id, decision: "APPROVE" })} onCancel={() => setApproving(null)} />
      {rejecting && <RejectModal row={rejecting} submitting={decide.isPending} onClose={() => setRejecting(null)} onReject={(reason) => decide.mutate({ id: rejecting.id, decision: "REJECT", reason })} />}
    </section>
  );
}

function RejectModal({ row, submitting, onClose, onReject }: { row: CorrectionRow; submitting: boolean; onClose: () => void; onReject: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <FormModal title="Reject correction" description={`${row.subjectName} · ${row.className}. ${row.requester.name} will see your reason.`} onClose={onClose}
      onSubmit={() => onReject(reason)} submitLabel="Reject" submitting={submitting} submitDisabled={reason.trim().length < 10} size="md">
      <FormField label="Reason" htmlFor="reject-reason" hint="At least 10 characters."><FormTextarea id="reject-reason" rows={3} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} /></FormField>
    </FormModal>
  );
}
