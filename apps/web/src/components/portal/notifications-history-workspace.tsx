import { NotificationDeliveryWorkspace } from "./notification-delivery-workspace";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CheckCheck,
  CircleCheck,
  ExternalLink,
  LoaderCircle,
  Search,
  X,
} from "lucide-react";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { apiFetch } from "@/lib/api";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  link: string | null;
  createdAt: string;
}
interface NotificationHistoryResponse {
  items: NotificationItem[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
  totalPages: number;
}
type Filter = "ALL" | "UNREAD" | "READ";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function NotificationsHistoryWorkspace() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({
    search,
    status: filter,
    page: String(page),
    limit: "25",
  });
  const historyQuery = useQuery({
    queryKey: ["notifications", "history", search, filter, page],
    queryFn: () =>
      apiFetch<NotificationHistoryResponse>(
        `/notifications/history?${params.toString()}`,
      ),
    retry: false,
  });
  const markRead = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/notifications/${id}/read`, {
        method: "PATCH",
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markAllRead = useMutation({
    mutationFn: () =>
      apiFetch<{ success: boolean; updatedCount: number }>(
        "/notifications/read-all",
        { method: "PATCH" },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  async function openNotification(item: NotificationItem) {
    if (!item.isRead) {
      try {
        await markRead.mutateAsync(item.id);
      } catch {
        // Navigation should still work if the read-state update fails.
      }
    }
    if (item.link && item.link.startsWith("/") && !item.link.startsWith("//")) {
      window.location.assign(item.link);
    }
  }

  const data = historyQuery.data;

  return (
    <div className="space-y-4">
      <NotificationDeliveryWorkspace />
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Bell className="size-5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Notification history
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
              Review your in-app alerts, find older updates and mark
              notifications as read. This history is private to your account in
              the active school.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => markAllRead.mutate()}
          disabled={!data?.unreadCount || markAllRead.isPending}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
        >
          <CheckCheck className="size-4" />
          {markAllRead.isPending ? "Updating…" : "Mark all as read"}
        </button>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border p-3 sm:flex-row sm:items-center sm:p-4">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search notifications…"
              aria-label="Search notifications"
              className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setPage(1);
                }}
                aria-label="Clear notification search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="size-3.5" />
              </button>
            )}
          </label>
          <Select
            value={filter}
            onValueChange={(value) => {
              setFilter(value as Filter);
              setPage(1);
            }}
          >
            <SelectTrigger
              aria-label="Filter notifications by read status"
              className="w-full sm:w-44"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All notifications</SelectItem>
              <SelectItem value="UNREAD">Unread only</SelectItem>
              <SelectItem value="READ">Read only</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            {data ? `${data.total} result${data.total === 1 ? "" : "s"}` : " "}
          </span>
        </div>
        {historyQuery.isPending ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Loading notification history…
          </div>
        ) : historyQuery.isError ? (
          <div className="p-4">
            <ErrorState
              message={historyQuery.error.message}
              onRetry={() => void historyQuery.refetch()}
            />
          </div>
        ) : !data?.items.length ? (
          <EmptyState
            icon={Bell}
            title={
              search || filter !== "ALL"
                ? "No matching notifications"
                : "No notifications yet"
            }
            description={
              search || filter !== "ALL"
                ? "Try changing your search or read-status filter."
                : "Updates from your school will appear here when they are created."
            }
            className="m-4"
          />
        ) : (
          <ul className="divide-y divide-border">
            {data.items.map((item) => (
              <li key={item.id}>
                <div
                  className={`flex items-start gap-3 p-4 sm:px-5 ${item.isRead ? "" : "bg-primary/[0.035]"}`}
                >
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${item.isRead ? "bg-muted-foreground/30" : "bg-primary"}`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p
                        className={`text-sm ${item.isRead ? "font-medium" : "font-bold"} text-foreground`}
                      >
                        {item.title}
                      </p>
                      <time className="shrink-0 text-[10px] text-muted-foreground">
                        {formatDate(item.createdAt)}
                      </time>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
                      {item.message}
                    </p>
                    <p className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {item.type.replaceAll("_", " ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      disabled={markRead.isPending || item.isRead}
                      onClick={() => markRead.mutate(item.id)}
                      aria-label={
                        item.isRead
                          ? "Already read"
                          : `Mark ${item.title} as read`
                      }
                      title="Mark as read"
                      className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                    >
                      <CircleCheck className="size-4" />
                    </button>
                    {item.link && (
                      <button
                        type="button"
                        onClick={() => void openNotification(item)}
                        aria-label={`Open ${item.title}`}
                        title="Open notification"
                        className="inline-flex size-8 items-center justify-center rounded-lg text-primary hover:bg-primary/10"
                      >
                        <ExternalLink className="size-4" />
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {data && data.totalPages > 1 && (
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
            <span className="text-xs text-muted-foreground">
              Page {data.page} of {data.totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
                className="h-8 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= data.totalPages}
                onClick={() => setPage((current) => current + 1)}
                className="h-8 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </footer>
        )}
      </section>
    </div>
  );
}
