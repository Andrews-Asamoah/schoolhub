import { useState } from "react";
import { Bell, Megaphone, Pin, Search, X } from "lucide-react";
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
}

const mockAnnouncements: AnnouncementItem[] = [
  {
    id: "ann-1",
    title: "Mid-Term Examination Timetable & Examination Rules Published",
    category: "ACADEMIC",
    date: "October 18, 2026",
    isPinned: true,
    content:
      "The official schedule for the 2025/2026 First Term Examinations is now available. Students are reminded that only students in full school uniform with verified hall passes will be admitted into the examination halls. Check your timetable under Academics. The examination will run from November 3rd to November 14th, 2026. All students must be seated 15 minutes before the start of each paper. Mobile phones and electronic devices are strictly prohibited in all examination halls.",
    author: "Academic Board",
    target: "All JHS Students",
  },
  {
    id: "ann-2",
    title: "National Science & Maths Quiz (NSMQ) School Trials",
    category: "EVENT",
    date: "October 16, 2026",
    isPinned: true,
    content:
      "Trial sessions for the Junior Science Olympiad & NSMQ prep squad will hold this Wednesday at 3:30 PM in the Science Auditorium. All interested students from Basic 7 to Basic 9 are invited to participate. Bring your scientific calculators and mathematical sets. The top 6 students will be selected to represent the school at the regional rounds. Refreshments will be provided after the session.",
    author: "Science Department",
    target: "Interested Students",
  },
  {
    id: "ann-3",
    title: "Inter-House Athletics & Cross Country Registration",
    category: "HOUSE",
    date: "October 14, 2026",
    content:
      "House captains and sports prefects are conducting trials for the 100m, 400m, 4x100m relay, and table tennis. Ensure you report to your House Master after school to register your events. Inter-house day is scheduled for Saturday, November 22nd. Students selected will receive a special permission slip signed by their form teachers. Practice sessions begin next Monday at 4:00 PM on the school field.",
    author: "Sports Master",
    target: "All School Houses",
  },
  {
    id: "ann-4",
    title: "Library Week & Extended ICT Lab Hours",
    category: "GENERAL",
    date: "October 10, 2026",
    content:
      "The central library and ICT lab will stay open until 5:00 PM on Mondays through Thursdays for assignment research and group study sessions. Internet access is restricted to academic educational resources. Library Week activities include a reading competition, a book fair, and a guest author talk. Students who borrow a minimum of 3 books will receive extra credit points.",
    author: "School Librarian",
    target: "Entire School Community",
  },
  {
    id: "ann-5",
    title: "Second Term School Fees Payment Deadline",
    category: "ACADEMIC",
    date: "October 8, 2026",
    content:
      "All parents and guardians are reminded that the deadline for second term school fees payment is October 31st, 2026. Students with outstanding balances after this date may not be allowed to write the mid-term examinations. Payment can be made via bank transfer, mobile money (MTN/Vodafone/AirtelTigo), or at the bursary office between 8:00 AM and 3:00 PM on school days.",
    author: "Bursary Office",
    target: "All Parents & Guardians",
  },
  {
    id: "ann-6",
    title: "Uniform Inspection & Updated Dress Code Policy",
    category: "GENERAL",
    date: "October 5, 2026",
    content:
      "Following the PTA meeting, the school has updated its uniform policy effective immediately. All students must wear black leather shoes (no sneakers), full school uniform including ties for JHS 3, and hair must be in the approved school style. Prefects and teachers will conduct random uniform inspections each Monday morning. Students in violation will be sent home to change and a letter will be issued to parents.",
    author: "School Prefect Council",
    target: "All Students",
  },
];

type CategoryFilter = "ALL" | "ACADEMIC" | "EVENT" | "HOUSE" | "GENERAL";

const categoryColors: Record<Exclude<CategoryFilter, "ALL">, { bg: string; text: string }> = {
  ACADEMIC: { bg: "bg-blue-50 dark:bg-blue-950/40", text: "text-blue-700 dark:text-blue-300" },
  EVENT: { bg: "bg-purple-50 dark:bg-purple-950/40", text: "text-purple-700 dark:text-purple-300" },
  HOUSE: { bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-300" },
  GENERAL: { bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-700 dark:text-slate-300" },
};

const filterOptions: { id: CategoryFilter; label: string }[] = [
  { id: "ALL", label: "All Notices" },
  { id: "ACADEMIC", label: "Academic" },
  { id: "EVENT", label: "Events" },
  { id: "HOUSE", label: "House" },
  { id: "GENERAL", label: "General" },
];

export function StudentAnnouncementsView() {
  const [filter, setFilter] = useState<CategoryFilter>("ALL");
  const [search, setSearch] = useState("");
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<AnnouncementItem | null>(null);

  function openAnnouncement(item: AnnouncementItem) {
    setSelected(item);
    setReadIds((prev) => new Set([...prev, item.id]));
  }

  const filtered = mockAnnouncements.filter((item) => {
    const matchesCategory = filter === "ALL" || item.category === filter;
    const q = search.toLowerCase();
    const matchesSearch =
      !search ||
      item.title.toLowerCase().includes(q) ||
      item.content.toLowerCase().includes(q) ||
      item.author.toLowerCase().includes(q);
    return matchesCategory && matchesSearch;
  });

  const pinnedCount = mockAnnouncements.filter((a) => a.isPinned).length;
  const unreadCount = mockAnnouncements.filter((a) => !readIds.has(a.id)).length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white">
            School Notices &amp; Announcements
          </h2>
          <p className="text-xs text-slate-500">
            Official school bulletins, academic notices, and extracurricular event updates
          </p>
        </div>
        {unreadCount > 0 && (
          <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 sm:self-auto">
            <Bell className="size-3.5" />
            {unreadCount} unread
          </span>
        )}
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Notices", value: mockAnnouncements.length, color: "text-slate-900 dark:text-white" },
          { label: "Pinned", value: pinnedCount, color: "text-indigo-600 dark:text-indigo-400" },
          { label: "Unread", value: unreadCount, color: "text-rose-600 dark:text-rose-400" },
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

      {/* Search Bar */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notices by title, content, or author…"
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

      {/* Category Filter Tabs */}
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

      {/* Announcements List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-14 text-center dark:border-slate-700 dark:bg-slate-900">
          <Megaphone className="size-10 text-slate-300 dark:text-slate-600" />
          <h3 className="mt-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
            No notices found
          </h3>
          <p className="mt-1 max-w-xs text-xs text-slate-400">
            {search
              ? `No announcements match "${search}". Try a different search term.`
              : "There are no notices in this category yet."}
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
        <div className="space-y-4">
          {filtered.map((item) => {
            const isRead = readIds.has(item.id);
            const catColors = categoryColors[item.category];
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openAnnouncement(item)}
                className={cn(
                  "w-full rounded-2xl border p-5 text-left shadow-xs transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                  item.isPinned
                    ? "border-indigo-200 bg-indigo-50/30 dark:border-indigo-900/40 dark:bg-slate-900"
                    : "border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900",
                  isRead && "opacity-70",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {!isRead && (
                      <span className="size-2 shrink-0 rounded-full bg-indigo-600" aria-label="Unread" />
                    )}
                    {item.isPinned && (
                      <span className="flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">
                        <Pin className="size-3" /> Pinned
                      </span>
                    )}
                    <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-bold", catColors.bg, catColors.text)}>
                      {item.category}
                    </span>
                    <span className="text-[11px] font-medium text-slate-400">
                      {item.target}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">{item.date}</span>
                </div>

                <h3 className="mt-2 text-sm font-bold text-slate-900 dark:text-white">
                  {item.title}
                </h3>

                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  {item.content}
                </p>

                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-400 dark:border-slate-800">
                  <span>
                    Published by:{" "}
                    <strong className="text-slate-700 dark:text-slate-200">{item.author}</strong>
                  </span>
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                    Read more →
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      <PortalModal
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ""}
        description={`${selected?.category} • ${selected?.date} • Published by ${selected?.author}`}
        maxWidth="lg"
      >
        {selected && (
          <div className="space-y-4 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              {selected.isPinned && (
                <span className="flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">
                  <Pin className="size-3" /> Pinned
                </span>
              )}
              <span
                className={cn(
                  "rounded-md px-2 py-0.5 text-[10px] font-bold",
                  categoryColors[selected.category].bg,
                  categoryColors[selected.category].text,
                )}
              >
                {selected.category}
              </span>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                Target: {selected.target}
              </span>
            </div>

            <p className="leading-relaxed text-slate-600 dark:text-slate-300">
              {selected.content}
            </p>

            <div className="flex items-center justify-end border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
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
