import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, LoaderCircle, Megaphone, Pin, Plus, RefreshCw, Search, Send, Trash2, X } from "lucide-react";
import type {
  AnnouncementCategory,
  AnnouncementStatus,
  CreateAnnouncementInput,
} from "@schoolhub/shared";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PortalModal } from "./portal-modal";
import {
  ANNOUNCEMENT_CATEGORY_STYLES,
  ANNOUNCEMENT_TARGET_OPTIONS,
  announcementCategoryLabel,
  announcementDate,
  announcementQueryRoleKey,
  announcementTargetLabel,
  type AnnouncementItem,
} from "./announcement-utils";

type CategoryFilter = "ALL" | AnnouncementCategory;
type Notice = { kind: "success" | "error"; message: string };
type AnnouncementWorkspaceMode = "admin" | "teacher" | "accountant" | "viewer";
type AnnouncementClassOption = { id: string; name: string; level: string };

const filterOptions: { value: CategoryFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "ACADEMIC", label: "Academic" },
  { value: "EVENT", label: "Events" },
  { value: "HOUSE", label: "House" },
  { value: "GENERAL", label: "General" },
];

const emptyForm = (mode: AnnouncementWorkspaceMode = "admin"): CreateAnnouncementInput => ({
  title: "",
  content: "",
  category: "GENERAL",
  target: mode === "teacher" ? "SELECTED_CLASSES" : mode === "accountant" ? "OUTSTANDING_FEE_GUARDIANS" : "SCHOOL_COMMUNITY",
  classIds: [],
  isPinned: false,
  status: "PUBLISHED",
});

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "The request failed. Please try again.";
}

export function AdminAnnouncementsWorkspace({ mode = "admin" }: { mode?: AnnouncementWorkspaceMode }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<CategoryFilter>("ALL");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AnnouncementItem | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AnnouncementItem | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [form, setForm] = useState<CreateAnnouncementInput>(() => emptyForm(mode));

  const announcementsQuery = useQuery({
    queryKey: ["announcements", announcementQueryRoleKey()],
    queryFn: () => apiFetch<AnnouncementItem[]>("/announcements"),
    retry: false,
  });

  const classOptionsQuery = useQuery({
    queryKey: ["announcement-classes", announcementQueryRoleKey()],
    queryFn: () => apiFetch<AnnouncementClassOption[]>("/announcements/classes"),
    enabled: mode !== "accountant" && mode !== "viewer",
    retry: false,
  });
  const classOptions = classOptionsQuery.data ?? [];
  const availableTargets = mode === "teacher"
    ? ANNOUNCEMENT_TARGET_OPTIONS.filter((option) => option.value === "SELECTED_CLASSES" || option.value === "SELECTED_CLASS_GUARDIANS")
    : mode === "accountant"
      ? ANNOUNCEMENT_TARGET_OPTIONS.filter((option) => option.value === "OUTSTANDING_FEE_GUARDIANS")
      : mode === "viewer"
        ? []
        : ANNOUNCEMENT_TARGET_OPTIONS;
  const requiresClassTargets = form.target === "SELECTED_CLASSES" || form.target === "SELECTED_CLASS_GUARDIANS";
  const selectedClasses = classOptions.filter((option) => form.classIds.includes(option.id));

  const refreshAnnouncements = () =>
    queryClient.invalidateQueries({ queryKey: ["announcements"] });

  const createMutation = useMutation({
    mutationFn: (input: CreateAnnouncementInput) =>
      apiFetch<AnnouncementItem>("/announcements", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async (_, input) => {
      await refreshAnnouncements();
      setIsCreateOpen(false);
      setForm(emptyForm(mode));
      setNotice({
        kind: "success",
        message: input.status === "DRAFT" ? "Draft saved." : "Announcement published.",
      });
    },
    onError: (error) => setNotice({ kind: "error", message: errorText(error) }),
  });

  const pinMutation = useMutation({
    mutationFn: ({ id, isPinned }: { id: string; isPinned: boolean }) =>
      apiFetch<AnnouncementItem>(`/announcements/${id}/pin`, {
        method: "PATCH",
        body: JSON.stringify({ isPinned }),
      }),
    onSuccess: async (_, variables) => {
      await refreshAnnouncements();
      setNotice({
        kind: "success",
        message: variables.isPinned ? "Announcement pinned." : "Announcement unpinned.",
      });
    },
    onError: (error) => setNotice({ kind: "error", message: errorText(error) }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AnnouncementStatus }) =>
      apiFetch<AnnouncementItem>(`/announcements/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: async (_, variables) => {
      await refreshAnnouncements();
      setNotice({
        kind: "success",
        message: variables.status === "PUBLISHED" ? "Announcement published." : "Announcement moved to drafts.",
      });
    },
    onError: (error) => setNotice({ kind: "error", message: errorText(error) }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/announcements/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await refreshAnnouncements();
      setDeleteTarget(null);
      setSelected(null);
      setNotice({ kind: "success", message: "Announcement deleted." });
    },
    onError: (error) => setNotice({ kind: "error", message: errorText(error) }),
  });

  const announcements = announcementsQuery.data ?? [];

  useEffect(() => {
    const announcementId = new URLSearchParams(window.location.search).get("announcementId");
    if (!announcementId) return;
    const matchingAnnouncement = announcements.find((item) => item.id === announcementId);
    if (matchingAnnouncement) setSelected(matchingAnnouncement);
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

  const publishedCount = announcements.filter((item) => item.status === "PUBLISHED").length;
  const pinnedCount = announcements.filter((item) => item.isPinned).length;
  const draftCount = announcements.filter((item) => item.status === "DRAFT").length;
  const isSaving =
    createMutation.isPending ||
    pinMutation.isPending ||
    statusMutation.isPending ||
    deleteMutation.isPending;

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    createMutation.mutate({
      ...form,
      title: form.title.trim(),
      content: form.content.trim(),
      status: mode === "admin" ? form.status : "PUBLISHED",
      isPinned: mode === "admin" ? form.isPinned : false,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-foreground">{mode === "teacher" ? "Class Announcements" : mode === "accountant" ? "Fee Announcements" : mode === "viewer" ? "Announcements" : "School Announcements"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "teacher" ? "Share notices with students and guardians in the classes you teach." : mode === "accountant" ? "Send announcements to guardians of students with outstanding school fees." : mode === "viewer" ? "Read updates and notices shared with you by your school." : "Create and manage school notices, event updates, and academic bulletins."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void announcementsQuery.refetch()}
            disabled={announcementsQuery.isFetching}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={cn("size-4", announcementsQuery.isFetching && "animate-spin")} />
            Refresh
          </button>
{mode !== "viewer" && (
          <button
            type="button"
            onClick={() => { setForm(emptyForm(mode)); setNotice(null); setIsCreateOpen(true); }}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:opacity-90"
          >
            <Plus className="size-4" />
            {mode === "accountant" ? "New fee announcement" : mode === "teacher" ? "New class announcement" : "New announcement"}
          </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: "Published", value: publishedCount, color: "text-success" },
          { label: "Pinned", value: pinnedCount, color: "text-primary" },
          { label: "Drafts", value: draftCount, color: "text-warning" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <p className={cn("text-2xl font-black tabular-nums", stat.color)}>{stat.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      {notice && (
        <div
          role={notice.kind === "error" ? "alert" : "status"}
          className={cn(
            "flex items-start gap-2 rounded-xl border px-4 py-3 text-sm",
            notice.kind === "error"
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-success/30 bg-success/10 text-success",
          )}
        >
          <Bell className="mt-0.5 size-4 shrink-0" />
          <span className="flex-1">{notice.message}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notice">
            <X className="size-4" />
          </button>
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by title, content, or author…"
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
            {announcements.length === 0 ? "No announcements yet" : "No announcements found"}
          </h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {search || filter !== "ALL"
              ? "Try a different search or category filter."
              : "Create your first announcement to share an official notice with your school community."}
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
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((item) => {
            const colors = ANNOUNCEMENT_CATEGORY_STYLES[item.category];
            return (
              <article
                key={item.id}
                className={cn(
                  "rounded-2xl border bg-card p-5 shadow-sm",
                  item.isPinned ? "border-primary/40" : "border-border",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {item.isPinned && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                      <Pin className="size-3" /> Pinned
                    </span>
                  )}
                  <span className={cn("rounded-md px-2 py-1 text-xs font-semibold", colors.background, colors.foreground)}>
                    {announcementCategoryLabel(item.category)}
                  </span>
                  <span className={cn(
                    "rounded-md px-2 py-1 text-xs font-semibold",
                    item.status === "PUBLISHED" ? "bg-success/10 text-success" : "bg-warning/10 text-warning",
                  )}>
                    {item.status === "PUBLISHED" ? "Published" : "Draft"}
                  </span>
                </div>
                <h3 className="mt-3 text-base font-bold text-foreground">{item.title}</h3>
                <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{item.content}</p>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                  <span>{announcementDate(item.createdAt)}</span>
                  <span>{item.author.name}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Audience: {announcementTargetLabel(item.target)}</p>
                {item.targetClassIds.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Classes: {classOptions.filter((klass) => item.targetClassIds.includes(klass.id)).map((klass) => klass.name).join(", ") || item.targetClassIds.length + " selected"}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex gap-1">
                    {mode === "admin" && (
                      <button
                        type="button"
                        onClick={() => pinMutation.mutate({ id: item.id, isPinned: !item.isPinned })}
                        disabled={isSaving}
                        title={item.isPinned ? "Unpin announcement" : "Pin announcement"}
                        aria-label={item.isPinned ? "Unpin announcement" : "Pin announcement"}
                        className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-primary disabled:opacity-50"
                      >
                        <Pin className="size-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelected(item)}
                      className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
                    >
                      View
                    </button>
                    {mode === "admin" && (
                      item.status === "DRAFT" ? (
                        <button
                          type="button"
                          onClick={() => statusMutation.mutate({ id: item.id, status: "PUBLISHED" })}
                          disabled={isSaving}
                          className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                        >
                          Publish
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => statusMutation.mutate({ id: item.id, status: "DRAFT" })}
                          disabled={isSaving}
                          className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                        >
                          Move to draft
                        </button>
                      )
                    )}
                  </div>
                  {mode === "admin" && (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(item)}
                      disabled={isSaving}
                      aria-label={"Delete " + item.title}
                      className="rounded-lg p-2 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <PortalModal
        isOpen={isCreateOpen}
        onClose={() => !createMutation.isPending && setIsCreateOpen(false)}
        title={mode === "accountant" ? "New fee announcement" : mode === "teacher" ? "New class announcement" : "New announcement"}
        description={mode === "teacher" ? "Send a message to students or guardians in your assigned classes." : mode === "accountant" ? "Notify parents and guardians whose wards have unpaid fees." : "Write a notice and choose who should see it."}
        maxWidth="lg"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label htmlFor="announcement-title" className="mb-1.5 block text-sm font-semibold text-foreground">Title</label>
            <input
              id="announcement-title"
              required
              minLength={3}
              maxLength={180}
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="Enter a clear announcement title"
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="announcement-category" className="mb-1.5 block text-sm font-semibold text-foreground">Category</label>
              <Select value={form.category} onValueChange={(value) => setForm((current) => ({ ...current, category: value as AnnouncementCategory }))}>
                <SelectTrigger id="announcement-category" className="h-10 w-full">
                  <SelectValue placeholder="Choose a category" />
                </SelectTrigger>
                <SelectContent>
                  {filterOptions.filter((option) => option.value !== "ALL").map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="announcement-target" className="mb-1.5 block text-sm font-semibold text-foreground">Target audience</label>
              <Select value={form.target} onValueChange={(value) => setForm((current) => ({ ...current, target: value as CreateAnnouncementInput["target"], classIds: [] }))}>
                <SelectTrigger id="announcement-target" className="h-10 w-full">
                  <SelectValue placeholder="Choose an audience" />
                </SelectTrigger>
                <SelectContent>
                  {availableTargets.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {requiresClassTargets && (
            <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
              <label htmlFor="announcement-class-selector" className="block text-sm font-semibold text-foreground">Target classes</label>
              <p className="text-xs text-muted-foreground">Choose one or more classes. Teachers can only select classes assigned to them.</p>
              <Select
                value=""
                onValueChange={(classId) => setForm((current) => ({
                  ...current,
                  classIds: current.classIds.includes(classId) ? current.classIds : [...current.classIds, classId],
                }))}
              >
                <SelectTrigger id="announcement-class-selector" disabled={classOptionsQuery.isPending || classOptions.length === 0 || form.classIds.length >= 100} className="h-10 w-full bg-background">
                  <SelectValue placeholder={classOptionsQuery.isPending ? "Loading classes…" : "Add a class"} />
                </SelectTrigger>
                <SelectContent>
                  {classOptions.filter((option) => !form.classIds.includes(option.id)).map((option) => (
                    <SelectItem key={option.id} value={option.id}>{option.level} · {option.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {classOptionsQuery.isError && (
                <div role="alert" className="space-y-2 text-xs text-destructive">
                  <p>Could not load classes.</p>
                  <button type="button" onClick={() => void classOptionsQuery.refetch()} className="rounded-lg border border-border px-2.5 py-1.5 font-semibold text-foreground hover:bg-muted">
                    Retry loading classes
                  </button>
                </div>
              )}
              {!classOptionsQuery.isPending && classOptions.length === 0 && !classOptionsQuery.isError && (
                <p className="text-xs text-muted-foreground">No active classes are available for your account.</p>
              )}
              {selectedClasses.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selectedClasses.map((klass) => (
                    <span key={klass.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground">
                      {klass.level} · {klass.name}
                      <button type="button" onClick={() => setForm((current) => ({ ...current, classIds: current.classIds.filter((id) => id !== klass.id) }))} aria-label={"Remove " + klass.name} className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No classes selected yet.</p>
              )}
            </div>
          )}
          {mode === "admin" && (
            <div>
              <label htmlFor="announcement-status" className="mb-1.5 block text-sm font-semibold text-foreground">Publication status</label>
              <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value as AnnouncementStatus }))}>
                <SelectTrigger id="announcement-status" className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PUBLISHED">Publish now</SelectItem>
                  <SelectItem value="DRAFT">Save as draft</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <label htmlFor="announcement-content" className="mb-1.5 block text-sm font-semibold text-foreground">Announcement content</label>
            <textarea
              id="announcement-content"
              required
              rows={6}
              maxLength={10000}
              value={form.content}
              onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
              placeholder="Write the complete announcement…"
              className="w-full rounded-lg border border-input bg-background p-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {mode === "admin" && (
          <label className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm text-foreground">
            <input
              type="checkbox"
              checked={form.isPinned}
              onChange={(event) => setForm((current) => ({ ...current, isPinned: event.target.checked }))}
              className="size-4 accent-primary"
            />
            Pin this announcement to the top
          </label>
          )}
          {createMutation.isError && (
            <p role="alert" className="text-sm text-destructive">{errorText(createMutation.error)}</p>
          )}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              disabled={createMutation.isPending}
              className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || (requiresClassTargets && form.classIds.length === 0)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {createMutation.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
              {createMutation.isPending ? "Saving…" : mode === "admin" && form.status === "DRAFT" ? "Save draft" : "Publish"}
            </button>
          </div>
        </form>
      </PortalModal>

      <PortalModal
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.title ?? "Announcement"}
        description={selected ? `${announcementCategoryLabel(selected.category)} · ${announcementDate(selected.createdAt)} · ${selected.author.name}` : undefined}
        maxWidth="lg"
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <span className={cn("rounded-md px-2 py-1 text-xs font-semibold", ANNOUNCEMENT_CATEGORY_STYLES[selected.category].background, ANNOUNCEMENT_CATEGORY_STYLES[selected.category].foreground)}>
                {announcementCategoryLabel(selected.category)}
              </span>
              <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                {announcementTargetLabel(selected.target)}
              </span>
              <span className={cn("rounded-md px-2 py-1 text-xs font-semibold", selected.status === "PUBLISHED" ? "bg-success/10 text-success" : "bg-warning/10 text-warning")}>
                {selected.status === "PUBLISHED" ? "Published" : "Draft"}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">{selected.content}</p>
            <div className="flex justify-end border-t border-border pt-4">
              <button type="button" onClick={() => setSelected(null)} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Close</button>
            </div>
          </div>
        )}
      </PortalModal>

      <PortalModal
        isOpen={!!deleteTarget}
        onClose={() => !deleteMutation.isPending && setDeleteTarget(null)}
        title="Delete announcement"
        description="This permanently removes the announcement from the school."
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Delete <strong className="text-foreground">{deleteTarget?.title}</strong>? This action cannot be undone.
          </p>
          {deleteMutation.isError && <p role="alert" className="text-sm text-destructive">{errorText(deleteMutation.error)}</p>}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteMutation.isPending}
              className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={!deleteTarget || deleteMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-bold text-destructive-foreground disabled:opacity-50"
            >
              {deleteMutation.isPending && <LoaderCircle className="size-4 animate-spin" />}
              Delete
            </button>
          </div>
        </div>
      </PortalModal>
    </div>
  );
}
