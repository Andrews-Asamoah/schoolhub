import { useEffect } from "react";
import type {
  AnnouncementCategory,
  AnnouncementStatus,
  AnnouncementTarget,
} from "@schoolhub/shared";

export interface AnnouncementItem {
  id: string;
  title: string;
  content: string;
  category: AnnouncementCategory;
  target: AnnouncementTarget | string;
  targetClassIds: string[];
  status: AnnouncementStatus | string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  author: { id: string; name: string };
}

export const ANNOUNCEMENT_CATEGORY_STYLES: Record<
  AnnouncementCategory,
  { background: string; foreground: string }
> = {
  ACADEMIC: { background: "bg-info/10", foreground: "text-info" },
  EVENT: { background: "bg-highlight/10", foreground: "text-highlight" },
  HOUSE: { background: "bg-warning/10", foreground: "text-warning" },
  GENERAL: { background: "bg-muted", foreground: "text-muted-foreground" },
};

export const ANNOUNCEMENT_TARGET_OPTIONS: {
  value: AnnouncementTarget;
  label: string;
}[] = [
  { value: "ALL_STUDENTS", label: "All Students" },
  { value: "SELECTED_CLASSES", label: "Students in Selected Classes" },
  { value: "SELECTED_CLASS_GUARDIANS", label: "Parents / Guardians of Selected Classes" },
  { value: "SCHOOL_HOUSES", label: "All School Houses" },
  { value: "SCHOOL_COMMUNITY", label: "Entire School Community" },
  { value: "PARENTS_GUARDIANS", label: "All Parents & Guardians" },
  { value: "TEACHERS", label: "All Teachers" },
  { value: "OUTSTANDING_FEE_GUARDIANS", label: "Parents / Guardians with Outstanding Fees" },
];

const targetLabels: Record<string, string> = {
  ALL: "Entire School Community",
  ALL_STUDENTS: "All Students",
  JHS_STUDENTS: "All JHS Students (legacy audience)",
  SELECTED_CLASSES: "Students in Selected Classes",
  SELECTED_CLASS_GUARDIANS: "Parents / Guardians of Selected Classes",
  SCHOOL_HOUSES: "All School Houses",
  SCHOOL_COMMUNITY: "Entire School Community",
  PARENTS_GUARDIANS: "All Parents & Guardians",
  TEACHERS: "All Teachers",
  OUTSTANDING_FEE_GUARDIANS: "Parents / Guardians with Outstanding Fees",
};

export function announcementTargetLabel(target: string) {
  const key = target.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  return targetLabels[key] ?? target;
}

export function announcementDate(date: string) {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

export function announcementCategoryLabel(category: AnnouncementCategory) {
  return category.charAt(0) + category.slice(1).toLowerCase();
}

/** Includes the active portal role so role-specific announcement results never share a cache. */
export function announcementQueryRoleKey() {
  if (typeof window === "undefined") return "server";
  return window.localStorage.getItem("schoolhub-active-role") ?? "default";
}

export type CategoryFilter = "ALL" | AnnouncementCategory;

/** The real categories, in display order. "All" is added by the view that shows it. */
export const ANNOUNCEMENT_CATEGORIES: { value: AnnouncementCategory; label: string }[] = [
  { value: "ACADEMIC", label: "Academic" },
  { value: "EVENT", label: "Events" },
  { value: "HOUSE", label: "House" },
  { value: "GENERAL", label: "General" },
];

export function announcementErrorText(error: unknown) {
  return error instanceof Error ? error.message : "The request failed. Please try again.";
}

/** Keeps announcements in the chosen category that match the search in title, content or author. */
export function filterAnnouncements(items: AnnouncementItem[], filter: CategoryFilter, search: string) {
  const needle = search.trim().toLowerCase();
  return items.filter((item) => {
    if (filter !== "ALL" && item.category !== filter) return false;
    return (
      !needle ||
      item.title.toLowerCase().includes(needle) ||
      item.content.toLowerCase().includes(needle) ||
      item.author.name.toLowerCase().includes(needle)
    );
  });
}

/**
 * A notification link carries ?announcementId=…; open that announcement once the
 * list has loaded, then drop the parameter so a refresh does not reopen it.
 */
export function useAnnouncementDeepLink(announcements: AnnouncementItem[], onFound: (item: AnnouncementItem) => void) {
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("announcementId");
    const match = id ? announcements.find((item) => item.id === id) : undefined;
    if (!match) return;
    onFound(match);
    const url = new URL(window.location.href);
    url.searchParams.delete("announcementId");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    // Runs when the list changes, as before; the callbacks passed in are stable state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announcements]);
}
