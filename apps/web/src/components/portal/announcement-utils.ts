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
  { value: "JHS_STUDENTS", label: "All JHS Students" },
  { value: "SCHOOL_HOUSES", label: "All School Houses" },
  { value: "SCHOOL_COMMUNITY", label: "Entire School Community" },
  { value: "PARENTS_GUARDIANS", label: "All Parents & Guardians" },
  { value: "TEACHERS", label: "All Teachers" },
];

const targetLabels: Record<string, string> = {
  ALL: "Entire School Community",
  ALL_STUDENTS: "All Students",
  JHS_STUDENTS: "All JHS Students",
  SCHOOL_HOUSES: "All School Houses",
  SCHOOL_COMMUNITY: "Entire School Community",
  PARENTS_GUARDIANS: "All Parents & Guardians",
  TEACHERS: "All Teachers",
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
