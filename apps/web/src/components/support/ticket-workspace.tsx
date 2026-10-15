import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Building2,
  Check,
  CircleDashed,
  Clock3,
  LifeBuoy,
  MessageCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Ticket,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  CloseTicketForm,
  CreateTicketForm,
  PlatformTicketUpdateForm,
  ReplyForm,
} from "@/components/support/ticket-forms";
import { apiFetch } from "@/lib/api";

type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

interface TicketSummary {
  id: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string | null;
  createdAt: string;
  updatedAt: string;
  submittedBy: { id: string; name: string; email: string };
  school?: { id: string; name: string; code: string } | null;
  _count: { replies: number };
}

interface TicketDetail extends TicketSummary {
  replies: {
    id: string;
    message: string;
    createdAt: string;
    author: { id: string; name: string; role: string };
  }[];
}

interface TicketWorkspaceProps {
  mode: "school" | "platform";
}

const statusLabels: Record<TicketStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

const priorityLabels: Record<TicketPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

const statusStyles: Record<TicketStatus, string> = {
  OPEN: "support-status-open border-sky-200 bg-sky-50 dark:border-sky-400/20 dark:bg-sky-400/10",
  IN_PROGRESS:
    "support-status-progress border-amber-200 bg-amber-50 dark:border-amber-400/20 dark:bg-amber-400/10",
  RESOLVED:
    "support-status-resolved border-emerald-200 bg-emerald-50 dark:border-emerald-400/20 dark:bg-emerald-400/10",
  CLOSED:
    "support-status-closed border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-white/[0.06]",
};

const priorityStyles: Record<TicketPriority, string> = {
  LOW: "support-priority-low",
  MEDIUM: "support-priority-medium",
  HIGH: "support-priority-high",
  URGENT: "support-priority-urgent",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getErrorMessage(error: Error | null) {
  return error?.message ?? "Something went wrong. Please try again.";
}

export function TicketWorkspace({ mode }: TicketWorkspaceProps) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const basePath =
    mode === "platform" ? "/support/platform/tickets" : "/support/tickets";
  const listKey = ["support", mode, "tickets"] as const;
  const detailKey = ["support", mode, "ticket", selectedId] as const;

  const ticketsQuery = useQuery({
    queryKey: listKey,
    queryFn: () => apiFetch<TicketSummary[]>(basePath),
    refetchInterval: 3_000,
    retry: false,
  });
  const tickets = ticketsQuery.data ?? [];

  useEffect(() => {
    if (!selectedId && tickets.length) setSelectedId(tickets[0]!.id);
    if (selectedId && !tickets.length) setSelectedId(null);
    if (selectedId && tickets.length && !tickets.some((ticket) => ticket.id === selectedId)) {
      setSelectedId(tickets[0]!.id);
    }
  }, [selectedId, tickets]);

  const detailQuery = useQuery({
    queryKey: detailKey,
    queryFn: () => apiFetch<TicketDetail>(`${basePath}/${selectedId}`),
    enabled: !!selectedId,
    refetchInterval: selectedId ? 3_000 : false,
    retry: false,
  });
  const ticket = detailQuery.data;

  const refreshTickets = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: listKey }),
      queryClient.invalidateQueries({ queryKey: detailKey }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: (input: {
      subject: string;
      description: string;
      category: string;
      priority: TicketPriority;
    }) =>
      apiFetch<TicketSummary>(basePath, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async (created) => {
      setSelectedId(created.id);
      setShowComposer(false);
      await queryClient.invalidateQueries({ queryKey: listKey });
    },
  });

  const replyMutation = useMutation({
    mutationFn: (message: string) =>
      apiFetch<TicketDetail>(`${basePath}/${selectedId}/replies`, {
        method: "POST",
        body: JSON.stringify({ message }),
      }),
    onSuccess: async () => {
      await refreshTickets();
    },
  });

  const statusMutation = useMutation({
    mutationFn: (input: {
      status: TicketStatus;
      priority?: TicketPriority;
    }) =>
      apiFetch<TicketDetail>(`${basePath}/${selectedId}/status`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: refreshTickets,
  });

  const openCount = tickets.filter(
    ({ status }) => status === "OPEN" || status === "IN_PROGRESS",
  ).length;

  return (
    <div className="support-workspace space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="support-text-accent text-xs font-semibold uppercase tracking-[0.14em]">
            {mode === "platform" ? "Platform operations" : "School administration"}
          </p>
          <h1 className="support-text-primary mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight">
            <LifeBuoy className="support-text-accent size-6" />
            {mode === "platform" ? "Support desk" : "Support"}
          </h1>
          <p className="support-text-muted mt-1 max-w-2xl text-sm">
            {mode === "platform"
              ? "Respond to school requests, keep each case moving, and close the loop with an auditable timeline."
              : "Raise an issue with the SchoolHub team and follow every reply and status update in one place."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="support-text-success inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold dark:border-emerald-400/20 dark:bg-emerald-400/10">
            <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
            Auto-refresh · 3 sec
          </span>
          {mode === "school" && (
            <button
              type="button"
              onClick={() => setShowComposer((shown) => !shown)}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
            >
              <Plus className="size-4" />
              New request
            </button>
          )}
        </div>
      </header>

      {createMutation.isSuccess && (
        <p role="status" className="support-text-success rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium dark:border-emerald-400/20 dark:bg-emerald-400/10">
          Your support request was submitted. Replies and status changes will appear in its timeline.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="All requests" value={tickets.length} icon={Ticket} />
        <SummaryCard label="Needs attention" value={openCount} icon={CircleDashed} />
        <SummaryCard
          label="Resolved"
          value={tickets.filter(({ status }) => status === "RESOLVED" || status === "CLOSED").length}
          icon={Check}
        />
      </div>

      {showComposer && mode === "school" && (
        <CreateTicketForm
          isSubmitting={createMutation.isPending}
          error={createMutation.error && <MutationError error={createMutation.error} />}
          onSubmit={(values) => createMutation.mutateAsync(values)}
          onCancel={() => setShowComposer(false)}
        />
      )}

      <section className="support-inbox-shell grid min-h-[560px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/70 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.6fr)]">
        <aside className="support-inbox border-b border-slate-200 dark:border-white/10 lg:border-b-0 lg:border-r">
          <div className="support-inbox-header flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/10">
            <div>
              <h2 className="support-text-primary text-sm font-semibold">Request inbox</h2>
              <p className="support-text-muted mt-0.5 text-[11px]">{tickets.length} conversations</p>
            </div>
            <button
              type="button"
              onClick={() => void refreshTickets()}
              aria-label="Refresh support requests"
              title="Refresh now"
              className="support-refresh-button support-text-muted rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
            >
              <RefreshCw className={`size-4 ${ticketsQuery.isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
          {ticketsQuery.isPending ? (
            <div className="support-text-muted p-6 text-sm">Loading requests…</div>
          ) : ticketsQuery.error ? (
            <InlineError message={`Requests could not be loaded: ${getErrorMessage(ticketsQuery.error)}`} />
          ) : !tickets.length ? (
            <div className="px-5 py-12 text-center">
              <LifeBuoy className="support-text-soft mx-auto mb-3 size-8" />
              <p className="support-text-primary text-sm font-semibold">No requests yet</p>
              <p className="support-text-muted mt-1 text-xs">
                {mode === "school" ? "Create a request and the support team will respond here." : "School requests will appear here."}
              </p>
            </div>
          ) : (
            <div className="max-h-[650px] overflow-y-auto p-2">
              {tickets.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  aria-current={selectedId === item.id ? "true" : undefined}
                  className={`support-ticket-row mb-1 w-full rounded-xl border p-3 text-left transition ${
                    selectedId === item.id
                    ? "support-ticket-selected border-indigo-200 bg-indigo-50 shadow-sm dark:border-indigo-300/20 dark:bg-indigo-400/[0.08]"
                      : "border-transparent hover:border-slate-200 hover:bg-slate-50 dark:hover:border-white/10 dark:hover:bg-white/[0.03]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="support-text-primary line-clamp-2 text-sm font-semibold">{item.subject}</span>
                    {item._count.replies > 0 && (
                      <span className="support-text-muted inline-flex shrink-0 items-center gap-1 text-[10px] font-medium">
                        <MessageCircle className="size-3" /> {item._count.replies}
                      </span>
                    )}
                  </div>
                  {mode === "platform" && item.school && (
                    <span className="support-text-muted mt-1.5 flex items-center gap-1 truncate text-[11px]">
                      <Building2 className="size-3" /> {item.school.name}
                    </span>
                  )}
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <StatusBadge status={item.status} />
                    <span className={`text-[10px] font-semibold ${priorityStyles[item.priority]}`}>{priorityLabels[item.priority]}</span>
                  </div>
                  <p className="support-text-muted mt-2 truncate text-[10px]">{formatDate(item.updatedAt)}</p>
                </button>
              ))}
            </div>
          )}
        </aside>

        <div className="support-conversation min-w-0">
          {!selectedId ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center p-8 text-center">
              <span className="support-text-accent mb-3 flex size-12 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-400/10">
                <MessageCircle className="size-5" />
              </span>
              <h2 className="support-text-primary text-sm font-semibold">Choose a conversation</h2>
              <p className="support-text-muted mt-1 max-w-sm text-xs leading-relaxed">Select a request from the inbox to review its history and continue the conversation.</p>
            </div>
          ) : detailQuery.isPending && !ticket ? (
            <div className="support-text-muted p-8 text-sm">Loading conversation…</div>
          ) : detailQuery.error && !ticket ? (
            <InlineError message={`Conversation could not be loaded: ${getErrorMessage(detailQuery.error)}`} />
          ) : ticket ? (
            <div className="flex h-full min-h-[560px] flex-col">
              <header className="support-conversation-header border-b border-slate-100 p-4 sm:p-5 dark:border-white/10">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    {mode === "platform" && ticket.school && (
                      <p className="support-text-accent mb-1 flex items-center gap-1.5 text-[11px] font-medium">
                        <Building2 className="size-3.5" /> {ticket.school.name} · {ticket.school.code}
                      </p>
                    )}
                    <h2 className="support-text-primary text-lg font-bold tracking-tight">{ticket.subject}</h2>
                    <p className="support-text-muted mt-1 text-xs">
                      {ticket.category ?? "General"} · Opened by {ticket.submittedBy.name} · {formatDate(ticket.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={ticket.status} />
                </div>
                {mode === "platform" && (
                  <PlatformTicketUpdateForm
                    key={ticket.id}
                    status={ticket.status}
                    priority={ticket.priority}
                    isSubmitting={statusMutation.isPending}
                    error={statusMutation.error && <MutationError error={statusMutation.error} />}
                    successMessage={statusMutation.isSuccess && (
                      <p role="status" className="support-text-success basis-full text-xs font-medium">
                        Ticket updates saved. The activity timeline has been refreshed.
                      </p>
                    )}
                    onSubmit={(values) => statusMutation.mutateAsync(values)}
                  />
                )}
                {mode === "school" && ticket.status === "RESOLVED" && (
                  <CloseTicketForm
                    isSubmitting={statusMutation.isPending}
                    onSubmit={() => statusMutation.mutateAsync({ status: "CLOSED" })}
                  />
                )}
                {mode === "school" && statusMutation.error && <MutationError error={statusMutation.error} />}
                {mode === "school" && statusMutation.isSuccess && (
                  <p role="status" className="support-text-success mt-2 text-xs font-medium">Ticket updates saved. The activity timeline has been refreshed.</p>
                )}
              </header>

              <div className="support-timeline flex-1 space-y-4 overflow-y-auto bg-slate-50/70 p-4 sm:p-5 dark:bg-slate-950/30">
                <article className="support-request-card rounded-xl border border-indigo-100 bg-white p-4 shadow-sm dark:border-indigo-300/10 dark:bg-slate-900">
                  <div className="support-text-primary mb-2 flex items-center gap-2 text-xs font-semibold">
                    <span className="support-text-accent flex size-7 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-400/15">
                      {ticket.submittedBy.name.slice(0, 1).toUpperCase()}
                    </span>
                    Initial request
                    <span className={`ml-auto text-[10px] ${priorityStyles[ticket.priority]}`}>{priorityLabels[ticket.priority]} priority</span>
                  </div>
                  <p className="support-text-body whitespace-pre-wrap text-sm leading-6">{ticket.description}</p>
                </article>
                {ticket.replies.map((item) => {
                  const isPlatformReply = item.author.role === "superAdmin";
                  const isActivity = /^(Status|Priority) changed /.test(item.message);
                  return (
                    <article
                      key={item.id}
                      className={`support-message max-w-[92%] rounded-xl border p-3.5 shadow-sm ${
                        isActivity
                          ? "support-message-activity mx-auto border-slate-200 bg-slate-100/80 dark:border-white/10 dark:bg-white/[0.04]"
                          : isPlatformReply
                            ? "support-message-platform ml-auto border-indigo-100 bg-indigo-50/80 dark:border-indigo-300/10 dark:bg-indigo-400/[0.07]"
                            : "support-message-school mr-auto border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900"
                      }`}
                    >
                      <div className="support-text-secondary mb-1.5 flex items-center gap-2 text-[11px] font-semibold">
                        {isActivity ? <ShieldCheck className="support-text-muted size-3.5" /> : <span>{item.author.name}</span>}
                        {isActivity && <span>Ticket activity · {item.author.name}</span>}
                        {!isActivity && isPlatformReply && <span className="support-text-accent rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px] uppercase tracking-wide dark:bg-indigo-300/10">Support</span>}
                        <time className="support-text-muted ml-auto flex items-center gap-1 text-[10px] font-normal">
                          <Clock3 className="size-3" /> {formatDate(item.createdAt)}
                        </time>
                      </div>
                      <p className="support-text-body whitespace-pre-wrap text-sm leading-6">{item.message}</p>
                    </article>
                  );
                })}
                {ticket.status === "CLOSED" && (
                  <p className="support-closed-notice support-text-muted mx-auto flex max-w-max items-center gap-1.5 rounded-full bg-slate-200/70 px-3 py-1.5 text-[11px] dark:bg-white/[0.05]">
                    <Check className="size-3.5" /> This conversation is closed
                  </p>
                )}
              </div>

              {ticket.status !== "CLOSED" ? (
                <ReplyForm
                  isSubmitting={replyMutation.isPending}
                  error={
                    <>
                      {replyMutation.error && <MutationError error={replyMutation.error} />}
                      {replyMutation.isSuccess && (
                        <p role="status" className="support-text-success mt-2 text-xs font-medium">
                          Reply sent. It is now part of this request’s timeline.
                        </p>
                      )}
                    </>
                  }
                  onSubmit={(message) => replyMutation.mutateAsync(message)}
                  placeholder={mode === "platform" ? "Reply to the school…" : "Add a message or share an update…"}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {ticketsQuery.isFetching && !ticketsQuery.isPending && (
        <p className="support-text-muted flex items-center justify-end gap-1.5 text-[10px]" aria-live="polite">
          <RefreshCw className="size-3 animate-spin" /> Checking for updates
        </p>
      )}
      {detailQuery.isError && ticket && (
        <p role="status" className="support-text-warning text-xs">
          Could not refresh this conversation; showing the most recently loaded details.
        </p>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
}) {
  return (
    <div className="support-summary-card flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900/70">
      <span className="support-text-accent flex size-9 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-400/10">
        <Icon className="size-4" />
      </span>
      <div>
        <p className="support-text-primary text-lg font-bold">{value}</p>
        <p className="support-text-muted text-[11px]">{label}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`inline-flex max-w-max items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${statusStyles[status]}`}>
      {status === "RESOLVED" || status === "CLOSED" ? <Check className="size-3" /> : <CircleDashed className="size-3" />}
      {statusLabels[status]}
    </span>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <div role="alert" className="support-text-danger flex items-start gap-2 p-5 text-xs">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function MutationError({ error }: { error: Error }) {
  return (
    <p role="alert" className="support-text-danger mt-2 flex items-center gap-1.5 text-xs">
      <AlertCircle className="size-3.5 shrink-0" />
      {getErrorMessage(error)}
    </p>
  );
}
