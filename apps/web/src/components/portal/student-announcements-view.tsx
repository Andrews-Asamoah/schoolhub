import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, LoaderCircle, Megaphone, Pin, RefreshCw, Search, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { PortalModal } from "./portal-modal";
import {
  ANNOUNCEMENT_CATEGORY_STYLES,
  announcementCategoryLabel,
  announcementDate,
  announcementQueryRoleKey,
  announcementTargetLabel,
  type AnnouncementItem,
} from "./announcement-utils";
import type { AnnouncementCategory } from "@schoolhub/shared";

type CategoryFilter = "ALL" | AnnouncementCategory;

const READ_STORAGE_KEY = "schoolhub-read-announcements";

const filterOptions: { value: CategoryFilter; label: string }[] = [
  { value: "ALL", label: "All Notices" },
  { value: "ACADEMIC", label: "Academic" },
  { value: "EVENT", label: "Events" },
  { value: "HOUSE", label: "House" },
  { value: "GENERAL", label: "General" },
];

function loadReadIds() {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(READ_STORAGE_KEY) ?? "[]");
    return new Set(
      Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [],
    );
  } catch {
    return new Set<string>();
  }
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "The request failed. Please try again.";
}

export function StudentAnnouncementsView() {
  const [filter, setFilter] = useState<CategoryFilter>("ALL");
  const [search, setSearch] = useState("");
  const [readIds, setReadIds] = useState<Set<string>>(loadReadIds);
  const [selected, setSelected] = useState<AnnouncementItem | null>(null);

  const announcementsQuery = useQuery({
    queryKey: ["announcements", announcementQueryRoleKey()],
    queryFn: () => apiFetch<AnnouncementItem[]>("/announcements"),
    retry: false,
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(READ_STORAGE_KEY, JSON.stringify([...readIds]));
    } catch {
      // Announcements remain usable when storage is unavailable or restricted.
    }
  }, [readIds]);

  const announcements = announcementsQuery.data ?? [];

  useEffect(() => {
    const announcementId = new URLSearchParams(window.location.search).get("announcementId");
    if (!announcementId) return;
    const matchingAnnouncement = announcements.find((item) => item.id === announcementId);
    if (!matchingAnnouncement) return;
    setSelected(matchingAnnouncement);
    setReadIds((current) => current.has(matchingAnnouncement.id)
      ? current
      : new Set([...current, matchingAnnouncement.id]));
    const url = new URL(window.location.href);
    url.searchParams.delete("announcementId");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [announcements]);

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = announcements.filter((item) => {
    const matchesCategory = filter === "ALL" || item.category === filter;
    const matchesSearch =
      !normalizedSearch ||
      item.title.toLowerCase().includes(normalizedSearch) ||
      item.content.toLowerCase().includes(normalizedSearch) ||
      item.author.name.toLowerCase().includes(normalizedSearch);
    return matchesCategory && matchesSearch;
  });

  const unreadCount = announcements.filter((item) => !readIds.has(item.id)).length;
  const pinnedCount = announcements.filter((item) => item.isPinned).length;

  function openAnnouncement(item: AnnouncementItem) {
    setSelected(item);
    setReadIds((current) => {
      if (current.has(item.id)) return current;
      return new Set([...current, item.id]);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-foreground">School Notices &amp; Announcements</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Official school bulletins, academic notices, and extracurricular updates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
              <Bell className="size-3.5" />
              {unreadCount} unread
            </span>
          )}
          <button
            type="button"
            onClick={() => void announcementsQuery.refetch()}
            disabled={announcementsQuery.isFetching}
            aria-label="Refresh announcements"
            className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn("size-4", announcementsQuery.isFetching && "animate-spin")} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: "Total Notices", value: announcements.length, color: "text-foreground" },
          { label: "Pinned", value: pinnedCount, color: "text-primary" },
          { label: "Unread", value: unreadCount, color: "text-destructive" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <p className={cn("text-2xl font-black tabular-nums", stat.color)}>{stat.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search notices by title, content, or author…"
          className="h-11 w-full rounded-xl border border-input bg-background pl-10 pr-10 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-1.5">
        {filterOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            aria-pressed={filter === option.value}
            className={cn(
              "shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition",
              filter === option.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {announcementsQuery.isPending ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-12 text-sm text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin" />
          Loading announcements…
        </div>
      ) : announcementsQuery.isError ? (
        <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6">
          <p className="font-semibold text-destructive">Announcements could not be loaded.</p>
          <p className="mt-1 text-sm text-muted-foreground">{errorText(announcementsQuery.error)}</p>
          <button
            type="button"
            onClick={() => void announcementsQuery.refetch()}
            className="mt-4 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
          >
            Try again
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-5 py-14 text-center">
          <Megaphone className="size-10 text-muted-foreground" />
          <h3 className="mt-4 text-sm font-bold text-foreground">
            {announcements.length === 0 ? "No announcements yet" : "No notices found"}
          </h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {search || filter !== "ALL"
              ? "Try a different search term or category."
              : "New school notices will appear here when they are published."}
          </p>
          {(search || filter !== "ALL") && (
            <button
              type="button"
              onClick={() => { setSearch(""); setFilter("ALL"); }}
              className="mt-4 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            const isRead = readIds.has(item.id);
            const colors = ANNOUNCEMENT_CATEGORY_STYLES[item.category];
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openAnnouncement(item)}
                className={cn(
                  "w-full rounded-2xl border bg-card p-5 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  item.isPinned ? "border-primary/40" : "border-border",
                  isRead && "opacity-75",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {!isRead && <span className="size-2 rounded-full bg-primary" aria-label="Unread" />}
                    {item.isPinned && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                        <Pin className="size-3" /> Pinned
                      </span>
                    )}
                    <span className={cn("rounded-md px-2 py-1 text-xs font-semibold", colors.background, colors.foreground)}>
                      {announcementCategoryLabel(item.category)}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">{announcementDate(item.createdAt)}</span>
                </div>
                <h3 className="mt-3 text-base font-bold text-foreground">{item.title}</h3>
                <p className="mt-1.5 line-clamp-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {item.content}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                  <span>Published by <strong className="font-semibold text-foreground">{item.author.name}</strong></span>
                  <span>{announcementTargetLabel(item.target)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <PortalModal
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.title ?? "Announcement"}
        description={selected ? `${announcementCategoryLabel(selected.category)} · ${announcementDate(selected.createdAt)} · Published by ${selected.author.name}` : undefined}
        maxWidth="lg"
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {selected.isPinned && (
                <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                  <Pin className="size-3" /> Pinned
                </span>
              )}
              <span className={cn("rounded-md px-2 py-1 text-xs font-semibold", ANNOUNCEMENT_CATEGORY_STYLES[selected.category].background, ANNOUNCEMENT_CATEGORY_STYLES[selected.category].foreground)}>
                {announcementCategoryLabel(selected.category)}
              </span>
              <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                {announcementTargetLabel(selected.target)}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">{selected.content}</p>
            <div className="flex justify-end border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </PortalModal>
    </div>
  );
}
