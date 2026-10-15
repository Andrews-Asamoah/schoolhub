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
  OPEN: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200",
  IN_PROGRESS:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200",
  RESOLVED:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200",
  CLOSED:
    "border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-300",
};

const priorityStyles: Record<TicketPriority, string> = {
  LOW: "text-slate-500 dark:text-slate-400",
  MEDIUM: "text-blue-700 dark:text-blue-300",
  HIGH: "text-orange-700 dark:text-orange-300",
  URGENT: "text-rose-700 dark:text-rose-300",
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
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600 dark:text-indigo-300">
            {mode === "platform" ? "Platform operations" : "School administration"}
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            <LifeBuoy className="size-6 text-indigo-600 dark:text-indigo-300" />
            {mode === "platform" ? "Support desk" : "Support"}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
            {mode === "platform"
              ? "Respond to school requests, keep each case moving, and close the loop with an auditable timeline."
              : "Raise an issue with the SchoolHub team and follow every reply and status update in one place."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
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
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
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

      <section className="grid min-h-[560px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/70 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.6fr)]">
        <aside className="border-b border-slate-200 dark:border-white/10 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/10">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Request inbox</h2>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{tickets.length} conversations</p>
            </div>
            <button
              type="button"
              onClick={() => void refreshTickets()}
              aria-label="Refresh support requests"
              title="Refresh now"
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-indigo-700 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
            >
              <RefreshCw className={`size-4 ${ticketsQuery.isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
          {ticketsQuery.isPending ? (
            <div className="p-6 text-sm text-slate-500">Loading requests…</div>
          ) : ticketsQuery.error ? (
            <InlineError message={`Requests could not be loaded: ${getErrorMessage(ticketsQuery.error)}`} />
          ) : !tickets.length ? (
            <div className="px-5 py-12 text-center">
              <LifeBuoy className="mx-auto mb-3 size-8 text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">No requests yet</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
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
                  className={`mb-1 w-full rounded-xl border p-3 text-left transition ${
                    selectedId === item.id
                      ? "border-indigo-200 bg-indigo-50 shadow-sm dark:border-indigo-300/20 dark:bg-indigo-400/[0.08]"
                      : "border-transparent hover:border-slate-200 hover:bg-slate-50 dark:hover:border-white/10 dark:hover:bg-white/[0.03]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2 text-sm font-semibold text-slate-800 dark:text-slate-100">{item.subject}</span>
                    {item._count.replies > 0 && (
                      <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                        <MessageCircle className="size-3" /> {item._count.replies}
                      </span>
                    )}
                  </div>
                  {mode === "platform" && item.school && (
                    <span className="mt-1.5 flex items-center gap-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
                      <Building2 className="size-3" /> {item.school.name}
                    </span>
                  )}
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <StatusBadge status={item.status} />
                    <span className={`text-[10px] font-semibold ${priorityStyles[item.priority]}`}>{priorityLabels[item.priority]}</span>
                  </div>
                  <p className="mt-2 truncate text-[10px] text-slate-400">{formatDate(item.updatedAt)}</p>
                </button>
              ))}
            </div>
          )}
        </aside>

        <div className="min-w-0">
          {!selectedId ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center p-8 text-center">
              <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-300">
                <MessageCircle className="size-5" />
              </span>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Choose a conversation</h2>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500 dark:text-slate-400">Select a request from the inbox to review its history and continue the conversation.</p>
            </div>
          ) : detailQuery.isPending && !ticket ? (
            <div className="p-8 text-sm text-slate-500 dark:text-slate-400">Loading conversation…</div>
          ) : detailQuery.error && !ticket ? (
            <InlineError message={`Conversation could not be loaded: ${getErrorMessage(detailQuery.error)}`} />
          ) : ticket ? (
            <div className="flex h-full min-h-[560px] flex-col">
              <header className="border-b border-slate-100 p-4 sm:p-5 dark:border-white/10">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    {mode === "platform" && ticket.school && (
                      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-300">
                        <Building2 className="size-3.5" /> {ticket.school.name} · {ticket.school.code}
                      </p>
                    )}
                    <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">{ticket.subject}</h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
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
                      <p role="status" className="basis-full text-xs font-medium text-emerald-700 dark:text-emerald-300">
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
                  <p role="status" className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">Ticket updates saved. The activity timeline has been refreshed.</p>
                )}
              </header>

              <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/70 p-4 sm:p-5 dark:bg-slate-950/30">
                <article className="rounded-xl border border-indigo-100 bg-white p-4 shadow-sm dark:border-indigo-300/10 dark:bg-slate-900">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-100">
                    <span className="flex size-7 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-200">
                      {ticket.submittedBy.name.slice(0, 1).toUpperCase()}
                    </span>
                    Initial request
                    <span className={`ml-auto text-[10px] ${priorityStyles[ticket.priority]}`}>{priorityLabels[ticket.priority]} priority</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{ticket.description}</p>
                </article>
                {ticket.replies.map((item) => {
                  const isPlatformReply = item.author.role === "superAdmin";
                  const isActivity = /^(Status|Priority) changed /.test(item.message);
                  return (
                    <article
                      key={item.id}
                      className={`max-w-[92%] rounded-xl border p-3.5 shadow-sm ${
                        isActivity
                          ? "mx-auto border-slate-200 bg-slate-100/80 dark:border-white/10 dark:bg-white/[0.04]"
                          : isPlatformReply
                            ? "ml-auto border-indigo-100 bg-indigo-50/80 dark:border-indigo-300/10 dark:bg-indigo-400/[0.07]"
                            : "mr-auto border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900"
                      }`}
                    >
                      <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                        {isActivity ? <ShieldCheck className="size-3.5 text-slate-500" /> : <span>{item.author.name}</span>}
                        {isActivity && <span>Ticket activity · {item.author.name}</span>}
                        {!isActivity && isPlatformReply && <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-indigo-700 dark:bg-indigo-300/10 dark:text-indigo-200">Support</span>}
                        <time className="ml-auto flex items-center gap-1 text-[10px] font-normal text-slate-400">
                          <Clock3 className="size-3" /> {formatDate(item.createdAt)}
                        </time>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{item.message}</p>
                    </article>
                  );
                })}
                {ticket.status === "CLOSED" && (
                  <p className="mx-auto flex max-w-max items-center gap-1.5 rounded-full bg-slate-200/70 px-3 py-1.5 text-[11px] text-slate-500 dark:bg-white/[0.05] dark:text-slate-400">
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
                        <p role="status" className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
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
        <p className="flex items-center justify-end gap-1.5 text-[10px] text-slate-400" aria-live="polite">
          <RefreshCw className="size-3 animate-spin" /> Checking for updates
        </p>
      )}
      {detailQuery.isError && ticket && (
        <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
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
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900/70">
      <span className="flex size-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-200">
        <Icon className="size-4" />
      </span>
      <div>
        <p className="text-lg font-bold text-slate-900 dark:text-white">{value}</p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
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
    <div role="alert" className="flex items-start gap-2 p-5 text-xs text-rose-700 dark:text-rose-300">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function MutationError({ error }: { error: Error }) {
  return (
    <p role="alert" className="mt-2 flex items-center gap-1.5 text-xs text-rose-700 dark:text-rose-300">
      <AlertCircle className="size-3.5 shrink-0" />
      {getErrorMessage(error)}
    </p>
  );
}
