import { useState, type ReactNode } from "react";
import { LoaderCircle, Megaphone, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ANNOUNCEMENT_CATEGORIES,
  announcementErrorText,
  filterAnnouncements,
  type AnnouncementItem,
  type CategoryFilter,
} from "./announcement-utils";

interface AnnouncementBrowserProps {
  query: { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown };
  announcements: AnnouncementItem[];
  /** Label of the "everything" tab, which differs between the admin and student views. */
  allLabel: string;
  copy: {
    searchPlaceholder: string;
    /** Title when a search or category matched nothing. */
    noMatchTitle: string;
    noMatchHint: string;
    /** Shown when there are no announcements at all. */
    emptyHint: string;
  };
  /** Draws the matching announcements; the view decides how an item looks. */
  children: (filtered: AnnouncementItem[]) => ReactNode;
}

/** Search box, category tabs and the loading / error / empty states shared by every announcement view. */
export function AnnouncementBrowser({ query, announcements, allLabel, copy, children }: AnnouncementBrowserProps) {
  const [filter, setFilter] = useState<CategoryFilter>("ALL");
  const [search, setSearch] = useState("");
  const filtered = filterAnnouncements(announcements, filter, search);
  const isFiltering = Boolean(search) || filter !== "ALL";
  const tabs = [{ value: "ALL" as const, label: allLabel }, ...ANNOUNCEMENT_CATEGORIES];

  return (
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={copy.searchPlaceholder}
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
        {tabs.map((option) => (
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

      {query.isPending ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-12 text-sm text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin" />
          Loading announcements…
        </div>
      ) : query.isError ? (
        <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6">
          <p className="font-semibold text-destructive">Announcements could not be loaded.</p>
          <p className="mt-1 text-sm text-muted-foreground">{announcementErrorText(query.error)}</p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="mt-4 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
          >
            Try again
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-5 py-14 text-center">
          <Megaphone className="size-10 text-muted-foreground" />
          <h3 className="mt-4 text-sm font-bold text-foreground">
            {announcements.length === 0 ? "No announcements yet" : copy.noMatchTitle}
          </h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {isFiltering ? copy.noMatchHint : copy.emptyHint}
          </p>
          {isFiltering && (
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
        children(filtered)
      )}
    </>
  );
}
