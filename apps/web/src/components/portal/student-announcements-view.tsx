import { Bell, Calendar, Megaphone, Pin, Sparkles, Tag } from "lucide-react";

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
    content: "The official schedule for the 2025/2026 First Term Examinations is now available. Students are reminded that only students in full school uniform with verified hall passes will be admitted into the examination halls. Check your timetable under Academics.",
    author: "Academic Board",
    target: "All JHS Students",
  },
  {
    id: "ann-2",
    title: "National Science & Maths Quiz (NSMQ) School Trials",
    category: "EVENT",
    date: "October 16, 2026",
    isPinned: true,
    content: "Trial sessions for the Junior Science Olympiad & NSMQ prep squad will hold this Wednesday at 3:30 PM in the Science Auditorium. All interested students from Basic 7 to Basic 9 are invited to participate.",
    author: "Science Department",
    target: "Interested Students",
  },
  {
    id: "ann-3",
    title: "Inter-House Athletics & Cross Country Registration",
    category: "HOUSE",
    date: "October 14, 2026",
    content: "House captains and sports prefects are conducting trials for the 100m, 400m, 4x100m relay, and table tennis. Ensure you report to your House Master after school to register your events.",
    author: "Sports Master",
    target: "All School Houses",
  },
  {
    id: "ann-4",
    title: "Library Week & Extended ICT Lab Hours",
    category: "GENERAL",
    date: "October 10, 2026",
    content: "The central library and ICT lab will stay open until 5:00 PM on Mondays through Thursdays for assignment research and group study sessions. Internet access is restricted to academic educational resources.",
    author: "School Librarian",
    target: "Entire School Community",
  },
];

export function StudentAnnouncementsView() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-black text-slate-900 dark:text-white">School Notices & Announcements</h2>
        <p className="text-xs text-slate-500">
          Official school bulletins, academic notices, and extracurricular event updates
        </p>
      </div>

      <div className="space-y-4">
        {mockAnnouncements.map((item) => (
          <div
            key={item.id}
            className={`rounded-2xl border p-5 shadow-xs transition ${
              item.isPinned
                ? "border-indigo-200 bg-indigo-50/30 dark:border-indigo-900/40 dark:bg-slate-900"
                : "border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {item.isPinned && (
                  <span className="flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">
                    <Pin className="size-3" /> Pinned
                  </span>
                )}
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {item.category}
                </span>
                <span className="text-[11px] font-medium text-slate-400">
                  Target: {item.target}
                </span>
              </div>

              <span className="text-[11px] text-slate-400">{item.date}</span>
            </div>

            <h3 className="mt-2 text-sm font-bold text-slate-900 dark:text-white">
              {item.title}
            </h3>

            <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {item.content}
            </p>

            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-400 dark:border-slate-800">
              <span>Published by: <strong className="text-slate-700 dark:text-slate-200">{item.author}</strong></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
