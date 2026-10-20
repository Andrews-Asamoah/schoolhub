import { useState } from "react";
import {
  Award,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  Flame,
  GraduationCap,
  LayoutDashboard,
  Megaphone,
  Printer,
  School,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { PortalStatCard } from "./portal-stat-card";
import { StudentFeeAlertBanner, StudentFeeBadge } from "./student-fee-badge";
import { StudentSubjectsView } from "./student-subjects-view";
import { StudentAttendanceView } from "./student-attendance-view";
import { StudentReportView } from "./student-report-view";
import { StudentClassmatesView } from "./student-classmates-view";
import { StudentHouseClubsView } from "./student-house-clubs-view";
import { StudentAssignmentsView } from "./student-assignments-view";
import { StudentAnnouncementsView } from "./student-announcements-view";
import { StudentOverview } from "./student-overview";
import { cn } from "@/lib/utils";

export interface StudentPortalWorkspaceProps {
  defaultTab?:
    | "dashboard"
    | "subjects"
    | "timetable"
    | "grades"
    | "assignments"
    | "classmates"
    | "house"
    | "attendance"
    | "clubs"
    | "announcements";
}

export function StudentPortalWorkspace({ defaultTab = "dashboard" }: StudentPortalWorkspaceProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  return (
    <div className="space-y-6">
      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        {[
          { id: "dashboard", label: "Overview", icon: LayoutDashboard },
          { id: "subjects", label: "My Subjects", icon: BookOpen },
          { id: "timetable", label: "My Timetable", icon: Clock },
          { id: "grades", label: "Academic Report", icon: Award },
          { id: "assignments", label: "Assignments", icon: FileText },
          { id: "attendance", label: "Attendance", icon: Calendar },
          { id: "classmates", label: "Classmates", icon: Users },
          { id: "house", label: "House & Clubs", icon: Trophy },
          { id: "announcements", label: "Notices", icon: Megaphone },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive =
            activeTab === tab.id ||
            (tab.id === "house" && activeTab === "clubs") ||
            (tab.id === "grades" && (activeTab as string) === "assessments");

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all",
                isActive
                  ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/20"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
              )}
            >
              <Icon className="size-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Contents */}
      {activeTab === "dashboard" && <StudentOverview />}
      {activeTab === "subjects" && <StudentSubjectsView />}
      {activeTab === "timetable" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white">Class Timetable (JHS 3 Emerald)</h2>
              <p className="text-xs text-slate-500">Weekly class periods, assigned teacher allocations, and lab rooms</p>
            </div>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              <Printer className="size-4" />
              Print Timetable
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="grid min-w-[700px] grid-cols-5 gap-3 text-xs">
              {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((day) => (
                <div key={day} className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                  <h4 className="border-b border-slate-200 pb-2 font-bold text-slate-900 dark:border-slate-700 dark:text-white">
                    {day}
                  </h4>
                  <div className="mt-2.5 space-y-2">
                    <div className="rounded-lg border border-slate-100 bg-white p-2 shadow-2xs dark:bg-slate-800">
                      <p className="text-[10px] text-slate-400">08:00 - 08:50</p>
                      <p className="font-bold text-indigo-700 dark:text-indigo-400">Integrated Science</p>
                      <p className="text-[10px] text-slate-400">Room 102</p>
                    </div>
                    <div className="rounded-lg border border-slate-100 bg-white p-2 shadow-2xs dark:bg-slate-800">
                      <p className="text-[10px] text-slate-400">09:00 - 09:50</p>
                      <p className="font-bold text-blue-700 dark:text-blue-400">Core Mathematics</p>
                      <p className="text-[10px] text-slate-400">Room 102</p>
                    </div>
                    <div className="rounded-lg bg-amber-50/70 p-1.5 text-center text-[10px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                      Morning Break (10:00 - 10:30)
                    </div>
                    <div className="rounded-lg border border-slate-100 bg-white p-2 shadow-2xs dark:bg-slate-800">
                      <p className="text-[10px] text-slate-400">10:30 - 11:20</p>
                      <p className="font-bold text-emerald-700 dark:text-emerald-400">English Language</p>
                      <p className="text-[10px] text-slate-400">Room 102</p>
                    </div>
                    <div className="rounded-lg border border-slate-100 bg-white p-2 shadow-2xs dark:bg-slate-800">
                      <p className="text-[10px] text-slate-400">11:30 - 12:20</p>
                      <p className="font-bold text-purple-700 dark:text-purple-400">Social Studies</p>
                      <p className="text-[10px] text-slate-400">Room 102</p>
                    </div>
                    <div className="rounded-lg bg-blue-50/70 p-1.5 text-center text-[10px] font-semibold text-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
                      Lunch & Midday Break
                    </div>
                    <div className="rounded-lg border border-slate-100 bg-white p-2 shadow-2xs dark:bg-slate-800">
                      <p className="text-[10px] text-slate-400">01:30 - 02:20</p>
                      <p className="font-bold text-cyan-700 dark:text-cyan-400">ICT Lab / French</p>
                      <p className="text-[10px] text-slate-400">Computer Lab</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {(activeTab === "grades" || (activeTab as string) === "assessments") && <StudentReportView />}
      {activeTab === "assignments" && <StudentAssignmentsView />}
      {activeTab === "attendance" && <StudentAttendanceView />}
      {activeTab === "classmates" && <StudentClassmatesView />}
      {(activeTab === "house" || activeTab === "clubs") && <StudentHouseClubsView />}
      {activeTab === "announcements" && <StudentAnnouncementsView />}
    </div>
  );
}
