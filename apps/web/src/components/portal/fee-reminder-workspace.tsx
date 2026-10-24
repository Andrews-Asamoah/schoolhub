import { useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarClock, CircleAlert, ClipboardList, LoaderCircle, Pause, Play, Plus, Send, ShieldCheck, Users, WalletCards, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Installment {
  id: string;
  label: string;
  dueDate: string;
  sendDate: string;
  sent: boolean;
  sentAt?: string | null;
}
interface ReminderSchedule {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  sendSms: boolean;
  sendEmail: boolean;
  sendInApp: boolean;
  targetOutstandingOnly: boolean;
  minimumOutstanding: number | string;
  messageTemplate: string;
  createdAt: string;
  createdBy?: { name?: string | null } | null;
  academicYear?: { name: string } | null;
  term?: { name: string } | null;
  installments: Installment[];
  _count?: { logs: number };
}
interface ReminderPreview {
  studentCount: number;
  guardianCount: number;
  guardiansWithoutPortal: number;
  totalOutstanding: number;
  sampleStudents: { name: string; balance: number }[];
}
interface ReminderResult {
  studentCount: number;
  inAppSent: number;
  skippedNoLogin: number;
  failed: number;
  alreadySent: number;
}
interface ScheduleDraft {
  name: string;
  description: string;
  messageTemplate: string;
  minimumOutstanding: string;
  addInstallment: boolean;
  installmentLabel: string;
  dueDate: string;
  sendDate: string;
}
const money = (value: number | string) => new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
const dateLabel = (value?: string | null) => {
  if (!value) return "Not set";
  const date = new Date(value.length === 10 ? value + "T00:00:00.000Z" : value);
  return Number.isNaN(date.getTime()) ? "Not set" : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
};
const today = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};
const initialDraft = (): ScheduleDraft => ({
  name: "",
  description: "",
  messageTemplate: "Dear {{guardianName}}, our records show that {{studentName}} has an outstanding school fee balance of {{outstandingBalance}}. Please contact the school accounts office if you need a statement or have already paid. Thank you.",
  minimumOutstanding: "0",
  addInstallment: true,
  installmentLabel: "Fee reminder",
  dueDate: today(),
  sendDate: today(),
});
const fieldClass = "h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/30";
const primaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";

export function FeeReminderWorkspace() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ScheduleDraft>(initialDraft);
  const [createOpen, setCreateOpen] = useState(false);
  const [installmentTarget, setInstallmentTarget] = useState<ReminderSchedule | null>(null);
  const [installmentDraft, setInstallmentDraft] = useState({ label: "Follow-up reminder", dueDate: today(), sendDate: today() });
  const [previewTarget, setPreviewTarget] = useState<ReminderSchedule | null>(null);
  const [preview, setPreview] = useState<ReminderPreview | null>(null);
  const [sendResult, setSendResult] = useState<ReminderResult | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const schedulesQuery = useQuery({
    queryKey: ["finance", "fee-reminders"],
    queryFn: () => apiFetch<ReminderSchedule[]>("/finance/fee-reminders"),
    retry: false,
  });
  const schedules = schedulesQuery.data ?? [];

  const createSchedule = useMutation({
    mutationFn: (payload: {
      name: string;
      description?: string;
      messageTemplate: string;
      minimumOutstanding: number;
      installment?: { label: string; dueDate: string; sendDate: string };
    }) => apiFetch<ReminderSchedule>("/finance/fee-reminders", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: async (schedule) => {
      setFeedback({ kind: "success", text: `Reminder schedule “${schedule.name}” created. It is configured for in-app notices only.` });
      setCreateOpen(false);
      setDraft(initialDraft());
      await queryClient.invalidateQueries({ queryKey: ["finance", "fee-reminders"] });
    },
    onError: (error: Error) => setFeedback({ kind: "error", text: error.message }),
  });
  const addInstallment = useMutation({
    mutationFn: ({ scheduleId, input }: { scheduleId: string; input: { label: string; dueDate: string; sendDate: string } }) =>
      apiFetch<Installment>(`/finance/fee-reminders/${encodeURIComponent(scheduleId)}/installments`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async (installment) => {
      setFeedback({ kind: "success", text: `Reminder date “${installment.label}” added to the schedule.` });
      setInstallmentTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["finance", "fee-reminders"] });
    },
    onError: (error: Error) => setFeedback({ kind: "error", text: error.message }),
  });
  const changeActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => apiFetch<ReminderSchedule>(`/finance/fee-reminders/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive }),
    }),
    onSuccess: async (schedule) => {
      setFeedback({ kind: "success", text: schedule.isActive ? "Reminder schedule activated." : "Reminder schedule paused." });
      await queryClient.invalidateQueries({ queryKey: ["finance", "fee-reminders"] });
    },
    onError: (error: Error) => setFeedback({ kind: "error", text: error.message }),
  });
  const previewQuery = useMutation({
    mutationFn: (scheduleId: string) => apiFetch<ReminderPreview>(`/finance/fee-reminders/${encodeURIComponent(scheduleId)}/preview`),
    onSuccess: (data) => setPreview(data),
    onError: (error: Error) => setFeedback({ kind: "error", text: error.message }),
  });
  const sendReminder = useMutation({
    mutationFn: (scheduleId: string) => apiFetch<ReminderResult>(`/finance/fee-reminders/${encodeURIComponent(scheduleId)}/send`, { method: "POST" }),
    onSuccess: async (result) => {
      setSendResult(result);
      setFeedback({ kind: result.failed ? "error" : "success", text: `In-app delivery finished: ${result.inAppSent} sent, ${result.skippedNoLogin} skipped without portal logins, ${result.failed} failed.` });
      await queryClient.invalidateQueries({ queryKey: ["finance", "fee-reminders"] });
    },
    onError: (error: Error) => setFeedback({ kind: "error", text: error.message }),
  });

  function updateDraft<K extends keyof ScheduleDraft>(key: K, value: ScheduleDraft[K]) {
    setDraft(current => ({ ...current, [key]: value }));
  }
  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    if (!Number.isFinite(Number(draft.minimumOutstanding)) || Number(draft.minimumOutstanding) < 0) {
      setFeedback({ kind: "error", text: "Enter a valid non-negative minimum balance." });
      return;
    }
    if (draft.addInstallment && draft.sendDate > draft.dueDate) {
      setFeedback({ kind: "error", text: "The reminder send date must be on or before the due date." });
      return;
    }
    createSchedule.mutate({
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      messageTemplate: draft.messageTemplate.trim(),
      minimumOutstanding: Number(draft.minimumOutstanding),
      ...(draft.addInstallment ? { installment: { label: draft.installmentLabel.trim(), dueDate: draft.dueDate, sendDate: draft.sendDate } } : {}),
    });
  }

  async function openPreview(schedule: ReminderSchedule) {
    setFeedback(null);
    setPreview(null);
    setSendResult(null);
    setPreviewTarget(schedule);
    previewQuery.mutate(schedule.id);
  }

  return <div className="mx-auto w-full min-w-0 max-w-screen-2xl space-y-6">
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between sm:p-6">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Finance & bursary</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">Fee reminders</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Prepare targeted fee reminders, preview eligible families and send controlled in-app notices from verified outstanding balances.</p></div>
      <button type="button" className={primaryButton} onClick={() => { setFeedback(null); setDraft(initialDraft()); setCreateOpen(true); }}><Plus className="size-4" /> New schedule</button>
    </section>
    {feedback && <div role={feedback.kind === "error" ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-xl border p-3 text-sm", feedback.kind === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-success/30 bg-success/5 text-foreground")}><span className="min-w-0 flex-1">{feedback.text}</span><button type="button" aria-label="Dismiss" onClick={() => setFeedback(null)}><X className="size-4" /></button></div>}
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" /><div><p className="text-sm font-semibold text-foreground">Delivery is in-app only</p><p className="mt-1 text-sm leading-5 text-muted-foreground">SMS and email reminders are not connected in this SchoolHub implementation. Preview and confirm before sending; reminders are sent only to linked guardian portal accounts, and recipients without a login are reported as skipped.</p></div></div></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><Metric label="Schedules" value={schedulesQuery.isPending ? "—" : String(schedules.length)} detail="Saved reminder plans" icon={ClipboardList} /><Metric label="Active schedules" value={schedulesQuery.isPending ? "—" : String(schedules.filter(item => item.isActive).length)} detail="Available for manual preview and send" icon={Bell} /><Metric label="Delivery attempts" value={schedulesQuery.isPending ? "—" : String(schedules.reduce((sum, item) => sum + (item._count?.logs ?? 0), 0))} detail="Sent, skipped and failed log entries" icon={Send} /></div>
    {schedulesQuery.isPending ? <LoadingState /> : schedulesQuery.error ? <ErrorState message={schedulesQuery.error.message} /> : schedules.length ? <div className="grid min-w-0 gap-4 xl:grid-cols-2">{schedules.map(schedule => <article key={schedule.id} className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm"><div className={cn("h-1", schedule.isActive ? "bg-primary" : "bg-muted-foreground/30")} /><div className="p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-semibold text-foreground">{schedule.name}</h2><p className="mt-1 text-xs text-muted-foreground">{[schedule.academicYear?.name, schedule.term?.name].filter(Boolean).join(" · ") || "No current academic period assigned"}</p></div><span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold uppercase", schedule.isActive ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>{schedule.isActive ? "Active" : "Paused"}</span></div>
      {schedule.description && <p className="mt-3 text-sm leading-5 text-muted-foreground">{schedule.description}</p>}
      <div className="mt-4 grid grid-cols-2 gap-3"><Summary label="Minimum balance" value={money(schedule.minimumOutstanding)} /><Summary label="Logged attempts" value={String(schedule._count?.logs ?? 0)} /></div>
      {schedule.installments?.length ? <div className="mt-4 space-y-2"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reminder dates</p>{schedule.installments.map(installment => <div key={installment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/30 p-3"><div className="flex items-center gap-2"><CalendarClock className="size-4 text-muted-foreground" /><div><p className="text-sm font-medium text-foreground">{installment.label}</p><p className="text-xs text-muted-foreground">Send {dateLabel(installment.sendDate)} · Due {dateLabel(installment.dueDate)}</p></div></div><span className={cn("text-[10px] font-bold uppercase", installment.sent ? "text-success" : "text-muted-foreground")}>{installment.sent ? "Sent" : "Not sent"}</span></div>)}</div> : <p className="mt-4 text-xs text-muted-foreground">No installment date configured. Manual sends still require a live preview and confirmation.</p>}
      <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4"><button type="button" className={primaryButton} disabled={!schedule.isActive || previewQuery.isPending || sendReminder.isPending} onClick={() => void openPreview(schedule)}><Users className="size-4" /> Preview & send</button><button type="button" className={secondaryButton} onClick={() => { setInstallmentTarget(schedule); setInstallmentDraft({ label: "Follow-up reminder", dueDate: today(), sendDate: today() }); }}><CalendarClock className="size-4" /> Add reminder date</button><button type="button" className={secondaryButton} disabled={changeActive.isPending} onClick={() => changeActive.mutate({ id: schedule.id, isActive: !schedule.isActive })}>{changeActive.isPending ? <LoaderCircle className="size-4 animate-spin" /> : schedule.isActive ? <Pause className="size-4" /> : <Play className="size-4" />}{schedule.isActive ? "Pause" : "Activate"}</button></div>
    </div></article>)}</div> : <EmptyState title="No reminder schedules" description="Create a reminder plan, set a minimum outstanding balance and optionally add a due date. You will preview the eligible families before sending anything." onCreate={() => { setDraft(initialDraft()); setCreateOpen(true); }} />}

    {createOpen && <Modal title="Create fee reminder schedule" description="Schedules are saved for the current academic period when one is configured. Delivery is in-app only." onClose={() => !createSchedule.isPending && setCreateOpen(false)}>
      <form className="space-y-4" onSubmit={submitCreate}>
        <Field label="Schedule name"><input required minLength={2} maxLength={120} className={fieldClass} value={draft.name} onChange={event => updateDraft("name", event.target.value)} placeholder="e.g. Term 1 outstanding fees" /></Field>
        <Field label="Description (optional)"><input maxLength={500} className={fieldClass} value={draft.description} onChange={event => updateDraft("description", event.target.value)} placeholder="Purpose of this reminder schedule" /></Field>
        <Field label="Minimum outstanding balance (GHS)"><input type="number" required min="0" step="0.01" className={fieldClass} value={draft.minimumOutstanding} onChange={event => updateDraft("minimumOutstanding", event.target.value)} /></Field>
        <Field label="Message template"><textarea required minLength={12} maxLength={1500} className={cn(fieldClass, "h-36 py-2")} value={draft.messageTemplate} onChange={event => updateDraft("messageTemplate", event.target.value)} /></Field>
        <div className="rounded-xl border border-border bg-muted/30 p-3"><p className="text-xs font-semibold text-foreground">Available message variables</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Use {"{{studentName}}"}, {"{{guardianName}}"}, {"{{outstandingBalance}}"}, {"{{dueDate}}"} and {"{{installmentLabel}}"} in your message.</p></div>
        <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm"><input type="checkbox" className="mt-1 size-4 accent-primary" checked={draft.addInstallment} onChange={event => updateDraft("addInstallment", event.target.checked)} /><span><span className="font-semibold text-foreground">Add a reminder date</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">Records a due date and send date for reporting. The schedule is not sent automatically in the background.</span></span></label>
        {draft.addInstallment && <div className="grid gap-3 sm:grid-cols-3"><Field label="Installment label"><input className={fieldClass} required minLength={1} maxLength={100} value={draft.installmentLabel} onChange={event => updateDraft("installmentLabel", event.target.value)} /></Field><Field label="Send date"><input type="date" className={fieldClass} required value={draft.sendDate} max={draft.dueDate} onChange={event => updateDraft("sendDate", event.target.value)} /></Field><Field label="Due date"><input type="date" className={fieldClass} required value={draft.dueDate} min={draft.sendDate} onChange={event => updateDraft("dueDate", event.target.value)} /></Field></div>}
        {createSchedule.error && <ErrorState message={createSchedule.error.message} />}
        <div className="flex justify-end gap-2 border-t border-border pt-4"><button type="button" className={secondaryButton} onClick={() => setCreateOpen(false)} disabled={createSchedule.isPending}>Cancel</button><button type="submit" className={primaryButton} disabled={createSchedule.isPending}>{createSchedule.isPending && <LoaderCircle className="size-4 animate-spin" />} Save schedule</button></div>
      </form>
    </Modal>}

    {installmentTarget && <Modal title="Add reminder date" description={installmentTarget.name} onClose={() => !addInstallment.isPending && setInstallmentTarget(null)}>
      <form className="space-y-4" onSubmit={(event) => {
        event.preventDefault();
        if (installmentDraft.sendDate > installmentDraft.dueDate) {
          setFeedback({ kind: "error", text: "The send date must be on or before the due date." });
          return;
        }
        addInstallment.mutate({ scheduleId: installmentTarget.id, input: installmentDraft });
      }}>
        <Field label="Installment label"><input className={fieldClass} required minLength={1} maxLength={100} value={installmentDraft.label} onChange={event => setInstallmentDraft(current => ({ ...current, label: event.target.value }))} /></Field>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Send date"><input type="date" className={fieldClass} required max={installmentDraft.dueDate} value={installmentDraft.sendDate} onChange={event => setInstallmentDraft(current => ({ ...current, sendDate: event.target.value }))} /></Field><Field label="Due date"><input type="date" className={fieldClass} required min={installmentDraft.sendDate} value={installmentDraft.dueDate} onChange={event => setInstallmentDraft(current => ({ ...current, dueDate: event.target.value }))} /></Field></div>
        {addInstallment.error && <ErrorState message={addInstallment.error.message} />}
        <p className="rounded-xl bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">Adding a date does not send a message automatically. The new date becomes the next reminder available for preview and manual in-app delivery.</p>
        <div className="flex justify-end gap-2 border-t border-border pt-4"><button type="button" className={secondaryButton} onClick={() => setInstallmentTarget(null)} disabled={addInstallment.isPending}>Cancel</button><button type="submit" className={primaryButton} disabled={addInstallment.isPending}>{addInstallment.isPending && <LoaderCircle className="size-4 animate-spin" />} Add date</button></div>
      </form>
    </Modal>}

    {previewTarget && <Modal title="Preview fee reminder" description={previewTarget.name} onClose={() => { if (!sendReminder.isPending) { setPreviewTarget(null); setPreview(null); } }}>
      {previewQuery.isPending ? <LoadingState /> : previewQuery.error ? <ErrorState message={previewQuery.error.message} /> : preview ? <div className="space-y-4">
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-3"><p className="text-sm font-semibold text-foreground">Confirm before sending</p><p className="mt-1 text-xs leading-5 text-muted-foreground">The preview is calculated from current unpaid bills and linked guardian records. Balances may change before delivery. This operation will create in-app notifications and delivery logs only.</p></div>
        <div className="grid gap-3 sm:grid-cols-2"><Summary label="Students with outstanding fees" value={String(preview.studentCount)} /><Summary label="Guardian portal recipients" value={String(preview.guardianCount)} /><Summary label="Guardians without a login" value={String(preview.guardiansWithoutPortal)} /><Summary label="Outstanding in this preview" value={money(preview.totalOutstanding)} /></div>
        {preview.sampleStudents.length > 0 && <div className="rounded-xl border border-border p-3"><h3 className="text-sm font-semibold text-foreground">Sample of eligible students</h3><div className="mt-2 divide-y divide-border">{preview.sampleStudents.map((student,index) => <div key={student.name+index} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="text-foreground">{student.name}</span><span className="font-semibold tabular-nums text-foreground">{money(student.balance)}</span></div>)}</div></div>}
        {sendResult && <div className="rounded-xl border border-success/30 bg-success/5 p-3 text-sm text-foreground">Last run: {sendResult.inAppSent} sent, {sendResult.skippedNoLogin} skipped, {sendResult.failed} failed, {sendResult.alreadySent} already sent.</div>}
        {sendReminder.error && <ErrorState message={sendReminder.error.message} />}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4"><button type="button" className={secondaryButton} onClick={() => setPreviewTarget(null)} disabled={sendReminder.isPending}>Close</button><button type="button" className={primaryButton} disabled={sendReminder.isPending || !preview.guardianCount || !previewTarget.isActive} onClick={() => sendReminder.mutate(previewTarget.id)}>{sendReminder.isPending && <LoaderCircle className="size-4 animate-spin" />}<Send className="size-4" /> Send in-app reminders</button></div>
      </div> : <p className="text-sm text-muted-foreground">Preview is not available yet.</p>}
    </Modal>}
  </div>;
}

function Metric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof WalletCards }) { return <div className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-muted-foreground">{label}</p><Icon className="size-4 text-primary" /></div><p className="mt-3 text-2xl font-bold tracking-tight text-foreground">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>; }
function Summary({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-words font-semibold text-foreground">{value}</p></div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid min-w-0 gap-1.5 text-sm font-medium text-foreground"><span>{label}</span>{children}</label>; }
function Modal({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: ReactNode }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/70 p-3 sm:p-6" role="presentation" onMouseDown={event => { if(event.target===event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-label={title} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl sm:p-6"><div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div><button type="button" aria-label="Close dialog" className="rounded-lg p-2 text-muted-foreground hover:bg-muted" onClick={onClose}><X className="size-4" /></button></div>{children}</section></div>; }
function ErrorState({ message }: { message: string }) { return <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><CircleAlert className="mr-2 inline size-4" />{message}</div>; }
function LoadingState() { return <div className="flex min-h-36 items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading fee reminder data…</div>; }
function EmptyState({ title, description, onCreate }: { title: string; description: string; onCreate: () => void }) { return <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-12 text-center"><ClipboardList className="mx-auto size-8 text-muted-foreground" /><h3 className="mt-3 font-semibold text-foreground">{title}</h3><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{description}</p><button type="button" className={cn(primaryButton,"mt-4")} onClick={onCreate}><Plus className="size-4" /> Create schedule</button></div>; }
