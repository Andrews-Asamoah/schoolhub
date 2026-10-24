import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, LoaderCircle, RefreshCw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { announcementQueryRoleKey } from "@/components/portal/announcement-utils";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  link: string | null;
  createdAt: string;
}

interface NotificationResponse {
  items: NotificationItem[];
  unreadCount: number;
}

function formatNotificationDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

/** A live, user-scoped notification inbox. Server-side ownership checks protect reads and updates. */
export function DashboardNotificationsMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["notifications", announcementQueryRoleKey()],
    queryFn: () => apiFetch<NotificationResponse>("/notifications"),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const markRead = useMutation({
    mutationFn: (id: string) => apiFetch("/notifications/" + id + "/read", { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markAllRead = useMutation({
    mutationFn: () => apiFetch("/notifications/read-all", { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const unreadCount = query.data?.unreadCount ?? 0;
  const items = query.data?.items ?? [];

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        aria-label={unreadCount ? "Notifications, " + unreadCount + " unread" : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          void query.refetch();
        }}
        className="relative inline-flex size-9 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bell className="size-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-4 text-destructive-foreground ring-2 ring-background">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <section
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-xl"
        >
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-bold">Notifications</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {unreadCount === 0 ? "You’re all caught up" : unreadCount + " unread notification" + (unreadCount === 1 ? "" : "s")}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                title="Refresh notifications"
                aria-label="Refresh notifications"
                onClick={() => void query.refetch()}
                disabled={query.isFetching}
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                <RefreshCw className={cn("size-4", query.isFetching && "animate-spin")} />
              </button>
              <button
                type="button"
                title="Mark all as read"
                aria-label="Mark all as read"
                onClick={() => markAllRead.mutate()}
                disabled={unreadCount === 0 || markAllRead.isPending}
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
              >
                {markAllRead.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCheck className="size-4" />}
              </button>
            </div>
          </header>

          <div className="max-h-[min(28rem,70vh)] overflow-y-auto">
            {query.isPending ? (
              <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" /> Loading notifications…
              </div>
            ) : query.isError ? (
              <div className="space-y-3 px-4 py-6">
                <p role="alert" className="text-sm text-destructive">Notifications couldn’t be loaded.</p>
                <button type="button" onClick={() => void query.refetch()} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
                  Try again
                </button>
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell className="mx-auto size-7 text-muted-foreground" />
                <p className="mt-3 text-sm font-semibold">No notifications yet</p>
                <p className="mt-1 text-xs text-muted-foreground">New school updates will appear here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        void (async () => {
                          if (!item.isRead) {
                            try {
                              await markRead.mutateAsync(item.id);
                            } catch {
                              // Navigation should still work if the read-state request fails.
                            }
                          }
                          setOpen(false);
                          if (item.link?.startsWith("/") && !item.link.startsWith("//")) {
                            window.location.assign(item.link);
                          }
                        })();
                      }}
                      className={cn(
                        "flex w-full gap-3 px-4 py-3 text-left transition hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                        !item.isRead && "bg-primary/5",
                      )}
                    >
                      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", item.isRead ? "bg-muted-foreground/30" : "bg-primary")} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm", item.isRead ? "font-medium" : "font-bold")}>{item.title}</span>
                        <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">{item.message}</span>
                        <time dateTime={item.createdAt} className="mt-1.5 block text-[10px] text-muted-foreground">{formatNotificationDate(item.createdAt)}</time>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <footer className="border-t border-border bg-muted/30 px-4 py-2">
            <p className="text-[10px] text-muted-foreground">Updates automatically refresh every 30 seconds.</p>
          </footer>
        </section>
      )}
    </div>
  );
}