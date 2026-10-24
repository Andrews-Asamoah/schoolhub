import { useEffect, useState } from "react";
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
  School,
  Users,
} from "lucide-react";
import { PortalStatCard } from "./portal-stat-card";
import { StudentFeeAlertBanner, StudentFeeBadge } from "./student-fee-badge";
import { StudentSubjectsView } from "./student-subjects-view";
import { StudentAttendanceView } from "./student-attendance-view";
import { StudentTimetableView } from "./student-timetable-view";
import { StudentReportView } from "./student-report-view";
import { StudentClassmatesView } from "./student-classmates-view";
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
    | "attendance"
    | "announcements";
}

export function StudentPortalWorkspace({ defaultTab = "dashboard" }: StudentPortalWorkspaceProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  useEffect(() => setActiveTab(defaultTab), [defaultTab]);

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
          { id: "announcements", label: "Notices", icon: Megaphone },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive =
            activeTab === tab.id ||
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
      {activeTab === "timetable" && <StudentTimetableView />}
      {(activeTab === "grades" || (activeTab as string) === "assessments") && <StudentReportView />}
      {activeTab === "assignments" && <StudentAssignmentsView />}
      {activeTab === "attendance" && <StudentAttendanceView />}
      {activeTab === "classmates" && <StudentClassmatesView />}
      {activeTab === "announcements" && <StudentAnnouncementsView />}
    </div>
  );
}
