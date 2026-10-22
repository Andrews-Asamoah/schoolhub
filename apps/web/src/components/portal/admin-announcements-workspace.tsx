import { useState } from "react";
import { Bell, Megaphone, Pin, Plus, Search, Send, Trash2, X } from "lucide-react";
import { PortalModal } from "./portal-modal";
import { cn } from "@/lib/utils";

interface AnnouncementItem {
  id: string;
  title: string;
  category: "ACADEMIC" | "EVENT" | "HOUSE" | "GENERAL";
  date: string;
  isPinned?: boolean;
  content: string;
  author: string;
  target: string;
  status: "PUBLISHED" | "DRAFT";
}

const initialAnnouncements: AnnouncementItem[] = [
  {
    id: "ann-1",
    title: "Mid-Term Examination Timetable & Examination Rules Published",
    category: "ACADEMIC",
    date: "October 18, 2026",
    isPinned: true,
    content:
      "The official schedule for the 2025/2026 First Term Examinations is now available. Students are reminded that only students in full school uniform with verified hall passes will be admitted into the examination halls. The examination will run from November 3rd to November 14th, 2026. All students must be seated 15 minutes before the start of each paper.",
    author: "Academic Board",
    target: "All JHS Students",
    status: "PUBLISHED",
  },
  {
    id: "ann-2",
    title: "National Science & Maths Quiz (NSMQ) School Trials",
    category: "EVENT",
    date: "October 16, 2026",
    isPinned: true,
    content:
      "Trial sessions for the Junior Science Olympiad & NSMQ prep squad will hold this Wednesday at 3:30 PM in the Science Auditorium. All interested students from Basic 7 to Basic 9 are invited to participate. The top 6 students will represent the school at the regional rounds.",
    author: "Science Department",
    target: "Interested Students",
    status: "PUBLISHED",
  },
  {
    id: "ann-3",
    title: "Inter-House Athletics & Cross Country Registration",
    category: "HOUSE",
    date: "October 14, 2026",
    content:
      "House captains and sports prefects are conducting trials for the 100m, 400m, 4x100m relay, and table tennis. Ensure you report to your House Master after school to register your events. Inter-house day is scheduled for Saturday, November 22nd.",
    author: "Sports Master",
    target: "All School Houses",
    status: "PUBLISHED",
  },
  {
    id: "ann-4",
    title: "Library Week & Extended ICT Lab Hours",
    category: "GENERAL",
    date: "October 10, 2026",
    content:
      "The central library and ICT lab will stay open until 5:00 PM on Mondays through Thursdays for assignment research and group study sessions. Library Week activities include a reading competition, a book fair, and a guest author talk.",
    author: "School Librarian",
    target: "Entire School Community",
    status: "PUBLISHED",
  },
  {
    id: "ann-5",
    title: "End-of-Term Report Distribution Plan (Draft)",
    category: "ACADEMIC",
    date: "October 20, 2026",
    content:
      "This draft outlines the planned procedure for distributing end-of-term student reports to parents and guardians. Reports will be available for collection at the school office from December 1st. Final details to be confirmed with form teachers.",
    author: "Academic Board",
    target: "All Teachers",
    status: "DRAFT",
  },
];

type CategoryFilter = "ALL" | "ACADEMIC" | "EVENT" | "HOUSE" | "GENERAL";

const categoryColors: Record<Exclude<CategoryFilter, "ALL">, { bg: string; text: string }> = {
  ACADEMIC: { bg: "bg-blue-50 dark:bg-blue-950/40", text: "text-blue-700 dark:text-blue-300" },
  EVENT: { bg: "bg-purple-50 dark:bg-purple-950/40", text: "text-purple-700 dark:text-purple-300" },
  HOUSE: { bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-300" },
  GENERAL: { bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-700 dark:text-slate-300" },
};

const CATEGORIES: Exclude<CategoryFilter, "ALL">[] = ["ACADEMIC", "EVENT", "HOUSE", "GENERAL"];
const TARGETS = [
  "All Students",
  "All JHS Students",
  "Interested Students",
  "All School Houses",
  "Entire School Community",
  "All Parents & Guardians",
  "All Teachers",
];

const filterOptions: { id: CategoryFilter; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "ACADEMIC", label: "Academic" },
  { id: "EVENT", label: "Events" },
  { id: "HOUSE", label: "House" },
  { id: "GENERAL", label: "General" },
];

export function AdminAnnouncementsWorkspace() {
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>(initialAnnouncements);
  const [filter, setFilter] = useState<CategoryFilter>("ALL");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AnnouncementItem | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AnnouncementItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    category: "GENERAL" as Exclude<CategoryFilter, "ALL">,
    content: "",
    target: "All Students",
    isPinned: false,
  });

  const filtered = announcements.filter((item) => {
    const matchesCategory = filter === "ALL" || item.category === filter;
    const q = search.toLowerCase();
    const matchesSearch =
      !search ||
      item.title.toLowerCase().includes(q) ||
      item.content.toLowerCase().includes(q) ||
      item.author.toLowerCase().includes(q);
    return matchesCategory && matchesSearch;
  });

  const publishedCount = announcements.filter((a) => a.status === "PUBLISHED").length;
  const pinnedCount = announcements.filter((a) => a.isPinned).length;
  const draftCount = announcements.filter((a) => a.status === "DRAFT").length;

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const newItem: AnnouncementItem = {
      id: `ann-${Date.now()}`,
      ...form,
      date: new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      author: "Admin",
      status: "PUBLISHED",
    };
    setAnnouncements((prev) => [newItem, ...prev]);
    setIsCreateOpen(false);
    setForm({ title: "", category: "GENERAL", content: "", target: "All Students", isPinned: false });
    flash("Announcement published successfully.");
  }

  function handleDelete() {
    if (!deleteTarget) return;
    setAnnouncements((prev) => prev.filter((a) => a.id !== deleteTarget.id));
    setDeleteTarget(null);
    setSelected(null);
    flash("Announcement deleted.");
  }

  function togglePin(id: string) {
    setAnnouncements((prev) =>
      prev.map((a) => (a.id === id ? { ...a, isPinned: !a.isPinned } : a)),
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white">
            School Announcements
          </h2>
          <p className="text-xs text-slate-500">
            Manage and publish school-wide notices, event updates, and academic bulletins
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center gap-2 self-start rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-indigo-600/20 transition hover:bg-indigo-700 sm:self-auto"
        >
          <Plus className="size-4" />
          New Announcement
        </button>
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Published", value: publishedCount, color: "text-emerald-600 dark:text-emerald-400" },
          { label: "Pinned", value: pinnedCount, color: "text-indigo-600 dark:text-indigo-400" },
          { label: "Drafts", value: draftCount, color: "text-amber-600 dark:text-amber-400" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-slate-200/80 bg-white p-4 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900"
          >
            <p className={cn("text-2xl font-black", stat.color)}>{stat.value}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Success Notice */}
      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          <Bell className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          {notice}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title, content, or author…"
          className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-xs text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:border-indigo-600 dark:focus:ring-indigo-900/30"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        {filterOptions.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setFilter(opt.id)}
            className={cn(
              "flex shrink-0 items-center rounded-xl px-3.5 py-2 text-xs font-bold transition-all",
              filter === opt.id
                ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/20"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Announcements Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-14 text-center dark:border-slate-700 dark:bg-slate-900">
          <Megaphone className="size-10 text-slate-300 dark:text-slate-600" />
          <h3 className="mt-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
            No announcements found
          </h3>
          <p className="mt-1 max-w-xs text-xs text-slate-400">
            {search ? `No results for "${search}".` : "No notices in this category yet."}
          </p>
          {(search || filter !== "ALL") && (
            <button
              type="button"
              onClick={() => { setSearch(""); setFilter("ALL"); }}
              className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((item) => {
            const catColors = categoryColors[item.category];
            return (
              <div
                key={item.id}
                className={cn(
                  "relative rounded-2xl border p-5 shadow-xs dark:bg-slate-900",
                  item.isPinned
                    ? "border-indigo-200 bg-indigo-50/30 dark:border-indigo-900/40"
                    : "border-slate-200/80 bg-white dark:border-slate-800",
                )}
              >
                {item.status === "DRAFT" && (
                  <span className="absolute right-4 top-4 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                    DRAFT
                  </span>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {item.isPinned && (
                    <span className="flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">
                      <Pin className="size-3" /> Pinned
                    </span>
                  )}
                  <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-bold", catColors.bg, catColors.text)}>
                    {item.category}
                  </span>
                  <span className="text-[11px] text-slate-400">{item.target}</span>
                </div>

                <h3 className="mt-2 text-sm font-bold text-slate-900 dark:text-white">{item.title}</h3>
                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  {item.content}
                </p>

                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                  <span className="text-[11px] text-slate-400">{item.date}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => togglePin(item.id)}
                      title={item.isPinned ? "Unpin" : "Pin to top"}
                      className={cn(
                        "rounded-lg p-1.5 transition",
                        item.isPinned
                          ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400"
                          : "text-slate-400 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800",
                      )}
                    >
                      <Pin className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelected(item)}
                      className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-indigo-600 transition hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/30"
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(item)}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      <PortalModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="New Announcement"
        description="Compose and publish a school notice to a target audience"
        maxWidth="lg"
      >
        <form onSubmit={handleCreate} className="space-y-4 text-xs">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Title
            </label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Mid-Term Exam Schedule Published"
              className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Category
              </label>
              <select
                value={form.category}
                onChange={(e) =>
                  setForm((f) => ({ ...f, category: e.target.value as Exclude<CategoryFilter, "ALL"> }))
                }
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Target Audience
              </label>
              <select
                value={form.target}
                onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {TARGETS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Content
            </label>
            <textarea
              required
              rows={5}
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              placeholder="Write the full announcement content here…"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={form.isPinned}
              onChange={(e) => setForm((f) => ({ ...f, isPinned: e.target.checked }))}
              className="size-4 rounded accent-indigo-600"
            />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              Pin this announcement to the top
            </span>
          </label>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
            >
              <Send className="size-3.5" />
              Publish
            </button>
          </div>
        </form>
      </PortalModal>

      {/* Detail Modal */}
      <PortalModal
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ""}
        description={`${selected?.category} • ${selected?.date} • ${selected?.author}`}
        maxWidth="lg"
      >
        {selected && (
          <div className="space-y-4 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "rounded-md px-2 py-0.5 text-[10px] font-bold",
                  categoryColors[selected.category].bg,
                  categoryColors[selected.category].text,
                )}
              >
                {selected.category}
              </span>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {selected.target}
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold",
                  selected.status === "PUBLISHED"
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
                )}
              >
                {selected.status}
              </span>
            </div>

            <p className="leading-relaxed text-slate-600 dark:text-slate-300">
              {selected.content}
            </p>

            <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => { setDeleteTarget(selected); setSelected(null); }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:hover:bg-rose-950/30"
              >
                <Trash2 className="size-3.5" /> Delete
              </button>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </PortalModal>

      {/* Delete Confirm Modal */}
      <PortalModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Announcement"
        description="This action cannot be undone."
        maxWidth="sm"
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-600 dark:text-slate-300">
            Are you sure you want to delete{" "}
            <strong className="text-slate-900 dark:text-white">
              &ldquo;{deleteTarget?.title}&rdquo;
            </strong>
            ?
          </p>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700"
            >
              Delete
            </button>
          </div>
        </div>
      </PortalModal>
    </div>
  );
}
