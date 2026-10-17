import { useState } from "react";
import {
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  GraduationCap,
  LayoutDashboard,
  Megaphone,
  PenLine,
  Plus,
  Printer,
  Search,
  Sparkles,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { PortalStatCard } from "./portal-stat-card";
import { PortalModal } from "./portal-modal";
import { cn } from "@/lib/utils";

interface TeacherPortalWorkspaceProps {
  defaultTab?: "overview" | "classes" | "gradebook" | "attendance" | "timetable" | "remarks" | "salary";
}

interface PeriodSchedule {
  id: string;
  period: number;
  time: string;
  className: string;
  subject: string;
  room: string;
  status: "completed" | "live" | "upcoming";
  studentsCount: number;
}

interface AssignedClass {
  id: string;
  name: string;
  level: string;
  room: string;
  studentCount: number;
  isClassTeacher: boolean;
  subjects: string[];
  schedule: string;
}

interface StudentGradeRow {
  id: string;
  studentId: string;
  name: string;
  classAssessment: number; // max 30
  examScore: number; // max 70
  totalScore: number;
  grade: string;
  position?: number;
  remark: string;
}

interface AttendanceStudent {
  id: string;
  studentId: string;
  name: string;
  gender: "M" | "F";
  status: "PRESENT" | "LATE" | "EXCUSED" | "ABSENT";
  note?: string;
}

const mockClasses: AssignedClass[] = [
  {
    id: "cls-1",
    name: "Basic 9 - Emerald",
    level: "JHS 3",
    room: "Block B, Room 102",
    studentCount: 38,
    isClassTeacher: true,
    subjects: ["Integrated Science", "ICT"],
    schedule: "Mon, Wed, Fri",
  },
  {
    id: "cls-2",
    name: "Form 2 - Science A",
    level: "SHS 2",
    room: "Science Lab 1",
    studentCount: 42,
    isClassTeacher: false,
    subjects: ["Physics", "General Science"],
    schedule: "Tue, Thu",
  },
  {
    id: "cls-3",
    name: "Basic 8 - Gold",
    level: "JHS 2",
    room: "Block A, Room 204",
    studentCount: 35,
    isClassTeacher: false,
    subjects: ["Integrated Science"],
    schedule: "Mon, Thu",
  },
];

const mockTodaySchedule: PeriodSchedule[] = [
  {
    id: "p1",
    period: 1,
    time: "08:00 - 08:50 AM",
    className: "Basic 9 - Emerald",
    subject: "Integrated Science",
    room: "Room 102",
    status: "completed",
    studentsCount: 38,
  },
  {
    id: "p2",
    period: 2,
    time: "09:00 - 09:50 AM",
    className: "Form 2 - Science A",
    subject: "Physics",
    room: "Lab 1",
    status: "live",
    studentsCount: 42,
  },
  {
    id: "p3",
    period: 4,
    time: "11:15 - 12:05 PM",
    className: "Basic 8 - Gold",
    subject: "Integrated Science",
    room: "Room 204",
    status: "upcoming",
    studentsCount: 35,
  },
  {
    id: "p4",
    period: 6,
    time: "01:30 - 02:20 PM",
    className: "Basic 9 - Emerald",
    subject: "ICT Practical",
    room: "Computer Lab",
    status: "upcoming",
    studentsCount: 38,
  },
];

const initialGradeRows: StudentGradeRow[] = [
  { id: "s1", studentId: "STU-2024-001", name: "Kwame Asante", classAssessment: 27, examScore: 62, totalScore: 89, grade: "A1", position: 1, remark: "Outstanding scientific curiosity" },
  { id: "s2", studentId: "STU-2024-002", name: "Ama Boateng", classAssessment: 25, examScore: 58, totalScore: 83, grade: "B2", position: 2, remark: "Consistent high performance" },
  { id: "s3", studentId: "STU-2024-003", name: "Emanuel Mensah", classAssessment: 24, examScore: 54, totalScore: 78, grade: "B3", position: 3, remark: "Very good analytical approach" },
  { id: "s4", studentId: "STU-2024-004", name: "Akua Osei", classAssessment: 22, examScore: 49, totalScore: 71, grade: "C4", position: 4, remark: "Shows steady improvement" },
  { id: "s5", studentId: "STU-2024-005", name: "Kofi Appiah", classAssessment: 19, examScore: 45, totalScore: 64, grade: "C5", position: 5, remark: "Needs more consistency in lab work" },
  { id: "s6", studentId: "STU-2024-006", name: "Abena Danquah", classAssessment: 18, examScore: 42, totalScore: 60, grade: "C6", position: 6, remark: "Capable of much better results" },
  { id: "s7", studentId: "STU-2024-007", name: "Yaw Frimpong", classAssessment: 15, examScore: 38, totalScore: 53, grade: "D7", position: 7, remark: "Extra tutorials recommended" },
];

const initialAttendanceStudents: AttendanceStudent[] = [
  { id: "s1", studentId: "STU-2024-001", name: "Kwame Asante", gender: "M", status: "PRESENT" },
  { id: "s2", studentId: "STU-2024-002", name: "Ama Boateng", gender: "F", status: "PRESENT" },
  { id: "s3", studentId: "STU-2024-003", name: "Emanuel Mensah", gender: "M", status: "LATE", note: "Arrived 8:15 AM due to rain" },
  { id: "s4", studentId: "STU-2024-004", name: "Akua Osei", gender: "F", status: "PRESENT" },
  { id: "s5", studentId: "STU-2024-005", name: "Kofi Appiah", gender: "M", status: "ABSENT", note: "Sick leave reported by guardian" },
  { id: "s6", studentId: "STU-2024-006", name: "Abena Danquah", gender: "F", status: "PRESENT" },
  { id: "s7", studentId: "STU-2024-007", name: "Yaw Frimpong", gender: "M", status: "PRESENT" },
];

export function TeacherPortalWorkspace({ defaultTab = "overview" }: TeacherPortalWorkspaceProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [selectedClassId, setSelectedClassId] = useState("cls-1");
  const [selectedSubject, setSelectedSubject] = useState("Integrated Science");
  const [selectedTerm, setSelectedTerm] = useState("Term 1");
  const [gradeRows, setGradeRows] = useState<StudentGradeRow[]>(initialGradeRows);
  const [attendanceList, setAttendanceList] = useState<AttendanceStudent[]>(initialAttendanceStudents);
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().slice(0, 10));
  const [isSavedNotice, setIsSavedNotice] = useState<string | null>(null);

  // Modals
  const [activeRosterClass, setActiveRosterClass] = useState<AssignedClass | null>(null);
  const [showPayslipModal, setShowPayslipModal] = useState(false);

  // Grade calculation helper
  const calculateGrade = (total: number): string => {
    if (total >= 80) return "A1";
    if (total >= 75) return "B2";
    if (total >= 70) return "B3";
    if (total >= 65) return "C4";
    if (total >= 60) return "C5";
    if (total >= 55) return "C6";
    if (total >= 50) return "D7";
    if (total >= 45) return "E8";
    return "F9";
  };

  const handleScoreChange = (id: string, field: "classAssessment" | "examScore", val: number) => {
    setGradeRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const classAssessment = field === "classAssessment" ? Math.min(30, Math.max(0, val)) : row.classAssessment;
        const examScore = field === "examScore" ? Math.min(70, Math.max(0, val)) : row.examScore;
        const totalScore = classAssessment + examScore;
        const grade = calculateGrade(totalScore);
        return { ...row, classAssessment, examScore, totalScore, grade };
      }),
    );
  };

  const handleAttendanceChange = (id: string, status: AttendanceStudent["status"]) => {
    setAttendanceList((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status } : item)),
    );
  };

  const markAllPresent = () => {
    setAttendanceList((prev) => prev.map((item) => ({ ...item, status: "PRESENT" })));
    triggerNotice("All students marked Present");
  };

  const triggerNotice = (msg: string) => {
    setIsSavedNotice(msg);
    setTimeout(() => setIsSavedNotice(null), 3000);
  };

  // Stats calculation
  const totalStudents = mockClasses.reduce((acc, c) => acc + c.studentCount, 0);
  const presentCount = attendanceList.filter((s) => s.status === "PRESENT").length;
  const lateCount = attendanceList.filter((s) => s.status === "LATE").length;
  const absentCount = attendanceList.filter((s) => s.status === "ABSENT").length;
  const attendanceRate = Math.round(((presentCount + lateCount) / attendanceList.length) * 100);

  return (
    <div className="space-y-6">
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-700 via-blue-700 to-indigo-900 p-6 text-white shadow-xl sm:p-8">
        <div className="absolute top-0 right-0 -m-16 size-72 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -m-10 size-60 rounded-full bg-blue-400/20 blur-2xl pointer-events-none" />

        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider backdrop-blur-md">
              <GraduationCap className="size-3.5 text-blue-200" />
              Teacher Workspace • Term 1 2025/2026
            </div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl md:text-4xl">
              Teacher Instruction Hub
            </h1>
            <p className="max-w-xl text-sm text-blue-100/90 leading-relaxed">
              Manage your assigned classes, take morning attendance, submit continuous assessment scores, and track your teaching timetable.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setActiveTab("attendance")}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-indigo-900 shadow-md transition hover:bg-blue-50"
            >
              <ClipboardCheck className="size-4 text-indigo-700" />
              Take Attendance
            </button>
            <button
              onClick={() => setActiveTab("gradebook")}
              className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-xs font-bold text-white backdrop-blur-md transition hover:bg-white/20"
            >
              <FileSpreadsheet className="size-4" />
              Enter Marks
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <PortalStatCard
          label="My Assigned Classes"
          value={mockClasses.length}
          subValue="Classes"
          icon={BookOpen}
          variant="indigo"
          onClick={() => setActiveTab("classes")}
        />
        <PortalStatCard
          label="Total Students"
          value={totalStudents}
          subValue="Under care"
          icon={Users}
          variant="blue"
          trend={{ value: "100%", isPositive: true, label: "Enrolled" }}
        />
        <PortalStatCard
          label="Lectures Today"
          value={mockTodaySchedule.length}
          subValue="4 periods"
          icon={Clock}
          variant="amber"
          onClick={() => setActiveTab("timetable")}
        />
        <PortalStatCard
          label="Class Attendance"
          value={`${attendanceRate}%`}
          subValue="Today's avg"
          icon={CheckCircle2}
          variant="emerald"
          trend={{ value: `${presentCount} present`, isPositive: true }}
          onClick={() => setActiveTab("attendance")}
        />
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        {[
          { id: "overview", label: "Overview & Schedule", icon: LayoutDashboard },
          { id: "classes", label: "My Classes", icon: Users, badge: mockClasses.length },
          { id: "gradebook", label: "Gradebook & Marks", icon: FileSpreadsheet },
          { id: "attendance", label: "Attendance Register", icon: ClipboardCheck },
          { id: "timetable", label: "Weekly Timetable", icon: Calendar },
          { id: "remarks", label: "Terminal Remarks", icon: PenLine },
          { id: "salary", label: "My Salary & Payslip", icon: Wallet },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all",
                isActive
                  ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/20"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
              )}
            >
              <Icon className="size-4" />
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.2 text-[10px]",
                    isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800",
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Toast Notice */}
      {isSavedNotice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800 shadow-xs dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          <Check className="size-4 text-emerald-600" />
          {isSavedNotice}
        </div>
      )}

      {/* TAB CONTENT: OVERVIEW */}
      {activeTab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Today's Schedule */}
          <div className="space-y-4 lg:col-span-2">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Clock className="size-4 text-indigo-600" />
                    Today's Teaching Schedule
                  </h3>
                  <p className="text-xs text-slate-500">Live period schedule for today</p>
                </div>
                <button
                  onClick={() => setActiveTab("timetable")}
                  className="text-xs font-semibold text-indigo-600 hover:underline"
                >
                  Full Timetable →
                </button>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {mockTodaySchedule.map((item) => (
                  <div key={item.id} className="py-3.5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div
                        className={cn(
                          "flex size-10 shrink-0 flex-col items-center justify-center rounded-xl text-xs font-bold",
                          item.status === "live"
                            ? "bg-amber-100 text-amber-900 ring-2 ring-amber-400"
                            : item.status === "completed"
                              ? "bg-emerald-50 text-emerald-800"
                              : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
                        )}
                      >
                        <span className="text-[9px] uppercase font-semibold">P{item.period}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                            {item.subject}
                          </h4>
                          {item.status === "live" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-300">
                              <span className="size-1.5 animate-pulse rounded-full bg-amber-500" />
                              IN PROGRESS
                            </span>
                          )}
                          {item.status === "completed" && (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                              Done
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {item.className} • {item.room} • {item.studentsCount} students
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="hidden sm:inline-block text-xs font-medium text-slate-500">
                        {item.time}
                      </span>
                      <button
                        onClick={() => {
                          setSelectedClassId(mockClasses[0]?.id ?? "cls-1");
                          setActiveTab("attendance");
                        }}
                        className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-700 dark:bg-slate-800 dark:text-slate-300"
                      >
                        Register
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Assessment Deadlines */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ClipboardCheck className="size-4 text-blue-600" />
                Upcoming Grading Milestones
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Tasks due for submission this term</p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200">Mid-Term Assessment 1</span>
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">Due Friday</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">Basic 9 - Emerald • Integrated Science</p>
                  <div className="mt-3 flex items-center justify-between text-xs font-semibold text-indigo-600">
                    <span>28 / 38 Graded</span>
                    <button onClick={() => setActiveTab("gradebook")} className="hover:underline">Continue grading →</button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200">Physics Lab Experiment 3</span>
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">Next Week</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">Form 2 - Science A • Physics</p>
                  <div className="mt-3 flex items-center justify-between text-xs font-semibold text-indigo-600">
                    <span>Pending submissions</span>
                    <button onClick={() => setActiveTab("gradebook")} className="hover:underline">Open marksheet →</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Sidebar: Quick Actions & Notices */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Quick Shortcuts</h3>
              <div className="mt-3 grid gap-2">
                <button
                  onClick={() => setActiveTab("attendance")}
                  className="flex items-center justify-between rounded-xl border border-slate-100 p-3 text-left transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
                      <ClipboardCheck className="size-4" />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Daily Attendance</p>
                      <p className="text-[10px] text-slate-500">Mark morning student register</p>
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-slate-400" />
                </button>

                <button
                  onClick={() => setActiveTab("gradebook")}
                  className="flex items-center justify-between rounded-xl border border-slate-100 p-3 text-left transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="rounded-lg bg-blue-50 p-2 text-blue-600">
                      <FileSpreadsheet className="size-4" />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Enter Class Marks</p>
                      <p className="text-[10px] text-slate-500">Input tests and exam scores</p>
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-slate-400" />
                </button>

                <button
                  onClick={() => setActiveTab("remarks")}
                  className="flex items-center justify-between rounded-xl border border-slate-100 p-3 text-left transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="rounded-lg bg-purple-50 p-2 text-purple-600">
                      <PenLine className="size-4" />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Report Remarks</p>
                      <p className="text-[10px] text-slate-500">Conduct and terminal comments</p>
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-slate-400" />
                </button>

                <button
                  onClick={() => setShowPayslipModal(true)}
                  className="flex items-center justify-between rounded-xl border border-slate-100 p-3 text-left transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="rounded-lg bg-amber-50 p-2 text-amber-600">
                      <Wallet className="size-4" />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Monthly Payslip</p>
                      <p className="text-[10px] text-slate-500">View latest salary voucher</p>
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-slate-400" />
                </button>
              </div>
            </div>

            {/* School Notice */}
            <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-5 dark:border-blue-900/40 dark:bg-blue-950/20">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-900 dark:text-blue-300">
                <Megaphone className="size-4 text-blue-600" />
                Staff Notice
              </div>
              <p className="mt-2 text-xs text-blue-950/80 dark:text-blue-200 leading-relaxed">
                Reminder: All continuous assessment (30%) marks must be submitted to the Academic Dean by Friday 4:00 PM for terminal report collation.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: MY CLASSES */}
      {activeTab === "classes" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Assigned Classes</h2>
              <p className="text-xs text-slate-500">Classes and student cohorts under your direct instruction</p>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {mockClasses.map((cls) => (
              <div
                key={cls.id}
                className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                      {cls.level}
                    </span>
                    <h3 className="mt-1.5 text-base font-bold text-slate-900 dark:text-white">
                      {cls.name}
                    </h3>
                    <p className="text-xs text-slate-500">{cls.room}</p>
                  </div>
                  {cls.isClassTeacher && (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                      Class Teacher
                    </span>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800">
                  <span className="text-slate-500">Students enrolled</span>
                  <span className="font-bold text-slate-900 dark:text-white">{cls.studentCount}</span>
                </div>

                <div className="mt-3">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Subjects</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {cls.subjects.map((s) => (
                      <span key={s} className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-5 flex items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => setActiveRosterClass(cls)}
                    className="flex-1 rounded-lg bg-indigo-50 py-2 text-center text-xs font-bold text-indigo-700 transition hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300"
                  >
                    View Roster
                  </button>
                  <button
                    onClick={() => {
                      setSelectedClassId(cls.id);
                      setActiveTab("attendance");
                    }}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                  >
                    Register
                  </button>
                  <button
                    onClick={() => {
                      setSelectedClassId(cls.id);
                      setActiveTab("gradebook");
                    }}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                  >
                    Marks
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONTENT: GRADEBOOK */}
      {activeTab === "gradebook" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Assessment Marksheet</h2>
              <p className="text-xs text-slate-500">Record scores and compute final grading for report cards</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => triggerNotice("Marksheet draft successfully saved to school database")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-indigo-700"
              >
                <Check className="size-4" />
                Save Marksheet
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="grid gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 sm:grid-cols-3 dark:border-slate-800 dark:bg-slate-900">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Class</label>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {mockClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.level})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Subject</label>
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="Integrated Science">Integrated Science</option>
                <option value="Physics">Physics</option>
                <option value="ICT Practical">ICT Practical</option>
                <option value="Core Mathematics">Core Mathematics</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Academic Term</label>
              <select
                value={selectedTerm}
                onChange={(e) => setSelectedTerm(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="Term 1">Term 1 (Active)</option>
                <option value="Term 2">Term 2</option>
                <option value="Term 3">Term 3</option>
              </select>
            </div>
          </div>

          {/* Marks Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full min-w-[700px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-800/50">
                  <th className="p-3.5 pl-5">#</th>
                  <th className="p-3.5">Student Name</th>
                  <th className="p-3.5 text-center">Class Assessment (30)</th>
                  <th className="p-3.5 text-center">Exam Score (70)</th>
                  <th className="p-3.5 text-center">Total (100)</th>
                  <th className="p-3.5 text-center">Grade</th>
                  <th className="p-3.5 text-center">Rank</th>
                  <th className="p-3.5">Teacher Remark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {gradeRows.map((row, idx) => (
                  <tr key={row.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="p-3.5 pl-5 text-slate-400 font-mono">{idx + 1}</td>
                    <td className="p-3.5">
                      <span className="font-bold text-slate-900 dark:text-white block">{row.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{row.studentId}</span>
                    </td>
                    <td className="p-3.5 text-center">
                      <input
                        type="number"
                        min="0"
                        max="30"
                        value={row.classAssessment}
                        onChange={(e) => handleScoreChange(row.id, "classAssessment", Number(e.target.value))}
                        className="w-16 rounded-md border border-slate-200 p-1.5 text-center font-bold text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </td>
                    <td className="p-3.5 text-center">
                      <input
                        type="number"
                        min="0"
                        max="70"
                        value={row.examScore}
                        onChange={(e) => handleScoreChange(row.id, "examScore", Number(e.target.value))}
                        className="w-16 rounded-md border border-slate-200 p-1.5 text-center font-bold text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </td>
                    <td className="p-3.5 text-center font-black text-slate-900 dark:text-white">
                      {row.totalScore}%
                    </td>
                    <td className="p-3.5 text-center">
                      <span
                        className={cn(
                          "rounded-md px-2 py-0.5 text-xs font-black",
                          row.totalScore >= 80
                            ? "bg-emerald-50 text-emerald-700"
                            : row.totalScore >= 60
                              ? "bg-blue-50 text-blue-700"
                              : "bg-amber-50 text-amber-700",
                        )}
                      >
                        {row.grade}
                      </span>
                    </td>
                    <td className="p-3.5 text-center font-semibold text-slate-600 dark:text-slate-400">
                      #{row.position}
                    </td>
                    <td className="p-3.5">
                      <input
                        type="text"
                        value={row.remark}
                        onChange={(e) => {
                          const val = e.target.value;
                          setGradeRows((prev) =>
                            prev.map((r) => (r.id === row.id ? { ...r, remark: val } : r)),
                          );
                        }}
                        className="w-full rounded-md border border-slate-200 p-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: ATTENDANCE */}
      {activeTab === "attendance" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Daily Attendance Register</h2>
              <p className="text-xs text-slate-500">Record and review student attendance by class</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={markAllPresent}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <Check className="size-4 text-emerald-600" />
                Mark All Present
              </button>
              <button
                onClick={() => triggerNotice("Attendance register successfully recorded")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-indigo-700"
              >
                <CheckCircle2 className="size-4" />
                Submit Register
              </button>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-56">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Class</label>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 p-1.5 text-xs font-medium dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  {mockClasses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Date</label>
                <input
                  type="date"
                  value={attendanceDate}
                  onChange={(e) => setAttendanceDate(e.target.value)}
                  className="mt-1 block rounded-lg border border-slate-200 p-1.5 text-xs font-medium dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>

            {/* Metrics */}
            <div className="flex items-center gap-4 text-xs">
              <div className="text-center">
                <p className="text-[10px] text-slate-400 uppercase font-semibold">Present</p>
                <p className="text-sm font-black text-emerald-600">{presentCount}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-slate-400 uppercase font-semibold">Late</p>
                <p className="text-sm font-black text-amber-600">{lateCount}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-slate-400 uppercase font-semibold">Absent</p>
                <p className="text-sm font-black text-rose-600">{absentCount}</p>
              </div>
              <div className="text-center pl-2 border-l border-slate-200 dark:border-slate-700">
                <p className="text-[10px] text-slate-400 uppercase font-semibold">Rate</p>
                <p className="text-sm font-black text-indigo-600">{attendanceRate}%</p>
              </div>
            </div>
          </div>

          {/* Student Attendance List */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full min-w-[650px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-800/50">
                  <th className="p-3.5 pl-5">#</th>
                  <th className="p-3.5">Student</th>
                  <th className="p-3.5">Gender</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5">Notes / Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {attendanceList.map((st, idx) => (
                  <tr key={st.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="p-3.5 pl-5 text-slate-400 font-mono">{idx + 1}</td>
                    <td className="p-3.5">
                      <span className="font-bold text-slate-900 dark:text-white block">{st.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{st.studentId}</span>
                    </td>
                    <td className="p-3.5 font-semibold text-slate-600 dark:text-slate-300">
                      {st.gender === "M" ? "Male" : "Female"}
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center justify-center gap-1.5">
                        {(["PRESENT", "LATE", "EXCUSED", "ABSENT"] as const).map((status) => {
                          const isCurrent = st.status === status;
                          return (
                            <button
                              key={status}
                              onClick={() => handleAttendanceChange(st.id, status)}
                              className={cn(
                                "rounded-lg px-2.5 py-1 text-[11px] font-bold transition",
                                isCurrent && status === "PRESENT" && "bg-emerald-600 text-white shadow-xs",
                                isCurrent && status === "LATE" && "bg-amber-600 text-white shadow-xs",
                                isCurrent && status === "EXCUSED" && "bg-blue-600 text-white shadow-xs",
                                isCurrent && status === "ABSENT" && "bg-rose-600 text-white shadow-xs",
                                !isCurrent && "border border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400",
                              )}
                            >
                              {status === "PRESENT" ? "P" : status === "LATE" ? "L" : status === "EXCUSED" ? "E" : "A"}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td className="p-3.5">
                      <input
                        type="text"
                        placeholder="Optional remarks..."
                        value={st.note ?? ""}
                        onChange={(e) => {
                          const note = e.target.value;
                          setAttendanceList((prev) =>
                            prev.map((item) => (item.id === st.id ? { ...item, note } : item)),
                          );
                        }}
                        className="w-full rounded-md border border-slate-200 p-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: TIMETABLE */}
      {activeTab === "timetable" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Master Weekly Timetable</h2>
              <p className="text-xs text-slate-500">Your weekly instructional teaching schedule</p>
            </div>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              <Printer className="size-4" />
              Print Schedule
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="grid min-w-[750px] grid-cols-6 gap-3 text-center text-xs">
              <div className="p-2 font-bold uppercase tracking-wider text-slate-400">Period / Day</div>
              {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((day) => (
                <div key={day} className="rounded-xl bg-slate-50 p-2 font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {day}
                </div>
              ))}

              {/* Period 1 */}
              <div className="p-3 font-semibold text-slate-400">08:00 - 08:50</div>
              <div className="rounded-xl bg-indigo-50/70 p-3 text-left border border-indigo-100 dark:border-indigo-900/30 dark:bg-indigo-950/20">
                <p className="font-bold text-indigo-900 dark:text-indigo-300 text-xs">Integrated Science</p>
                <p className="text-[11px] text-indigo-700 dark:text-indigo-400">Basic 9 Emerald</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 text-slate-400 dark:bg-slate-800/40">Free Period</div>
              <div className="rounded-xl bg-indigo-50/70 p-3 text-left border border-indigo-100 dark:border-indigo-900/30 dark:bg-indigo-950/20">
                <p className="font-bold text-indigo-900 dark:text-indigo-300 text-xs">Integrated Science</p>
                <p className="text-[11px] text-indigo-700 dark:text-indigo-400">Basic 9 Emerald</p>
              </div>
              <div className="rounded-xl bg-blue-50/70 p-3 text-left border border-blue-100 dark:border-blue-900/30 dark:bg-blue-950/20">
                <p className="font-bold text-blue-900 dark:text-blue-300 text-xs">General Science</p>
                <p className="text-[11px] text-blue-700 dark:text-blue-400">Form 2 Science</p>
              </div>
              <div className="rounded-xl bg-indigo-50/70 p-3 text-left border border-indigo-100 dark:border-indigo-900/30 dark:bg-indigo-950/20">
                <p className="font-bold text-indigo-900 dark:text-indigo-300 text-xs">Integrated Science</p>
                <p className="text-[11px] text-indigo-700 dark:text-indigo-400">Basic 9 Emerald</p>
              </div>

              {/* Period 2 */}
              <div className="p-3 font-semibold text-slate-400">09:00 - 09:50</div>
              <div className="rounded-xl bg-purple-50/70 p-3 text-left border border-purple-100 dark:border-purple-900/30 dark:bg-purple-950/20">
                <p className="font-bold text-purple-900 dark:text-purple-300 text-xs">Science Practical</p>
                <p className="text-[11px] text-purple-700 dark:text-purple-400">Basic 8 Gold</p>
              </div>
              <div className="rounded-xl bg-blue-50/70 p-3 text-left border border-blue-100 dark:border-blue-900/30 dark:bg-blue-950/20">
                <p className="font-bold text-blue-900 dark:text-blue-300 text-xs">Physics</p>
                <p className="text-[11px] text-blue-700 dark:text-blue-400">Form 2 Science</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 text-slate-400 dark:bg-slate-800/40">Free Period</div>
              <div className="rounded-xl bg-blue-50/70 p-3 text-left border border-blue-100 dark:border-blue-900/30 dark:bg-blue-950/20">
                <p className="font-bold text-blue-900 dark:text-blue-300 text-xs">Physics Lab</p>
                <p className="text-[11px] text-blue-700 dark:text-blue-400">Form 2 Science</p>
              </div>
              <div className="rounded-xl bg-purple-50/70 p-3 text-left border border-purple-100 dark:border-purple-900/30 dark:bg-purple-950/20">
                <p className="font-bold text-purple-900 dark:text-purple-300 text-xs">Science Quiz</p>
                <p className="text-[11px] text-purple-700 dark:text-purple-400">Basic 8 Gold</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: REMARKS */}
      {activeTab === "remarks" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Terminal Student Remarks</h2>
              <p className="text-xs text-slate-500">Provide qualitative observations and conduct appraisal for report cards</p>
            </div>
            <button
              onClick={() => triggerNotice("Report card remarks successfully saved")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-indigo-700"
            >
              <Check className="size-4" />
              Save All Remarks
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="grid gap-4 sm:grid-cols-2">
              {gradeRows.map((st) => (
                <div key={st.id} className="rounded-xl border border-slate-100 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">{st.name}</h4>
                      <p className="text-[10px] text-slate-400">Total: {st.totalScore}% • Grade: {st.grade}</p>
                    </div>
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                      Rank #{st.position}
                    </span>
                  </div>

                  <div className="mt-3">
                    <label className="text-[10px] font-bold uppercase text-slate-400">Teacher's Comment</label>
                    <textarea
                      rows={2}
                      defaultValue={st.remark}
                      className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-800 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    />
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1">
                    {["Excellent attitude", "Hardworking", "Needs extra attention", "Active participant"].map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => triggerNotice(`Appended "${tag}" to ${st.name}`)}
                        className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 dark:bg-slate-700 dark:text-slate-300"
                      >
                        +{tag}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: SALARY */}
      {activeTab === "salary" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Teacher Compensation & Payslips</h2>
              <p className="text-xs text-slate-500">Your official monthly salary statement and disbursements</p>
            </div>
            <button
              onClick={() => setShowPayslipModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-indigo-700"
            >
              <FileText className="size-4" />
              Download Current Payslip
            </button>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-semibold text-slate-500">Gross Monthly Salary</p>
              <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">GH₵ 4,850.00</p>
              <p className="mt-1 text-[11px] text-emerald-600 font-medium">Base salary + allowances</p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-semibold text-slate-500">Total Deductions</p>
              <p className="mt-2 text-2xl font-black text-rose-600">GH₵ 765.20</p>
              <p className="mt-1 text-[11px] text-slate-500">PAYE Tax + SSNIT Tier 1</p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-semibold text-slate-500">Net Take-Home Pay</p>
              <p className="mt-2 text-2xl font-black text-emerald-600">GH₵ 4,084.80</p>
              <p className="mt-1 text-[11px] text-slate-500">Direct deposit to Bank</p>
            </div>
          </div>

          {/* History */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Recent Payslip Receipts</h3>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {[
                { month: "September 2026", gross: "GH₵ 4,850.00", net: "GH₵ 4,084.80", status: "DISBURSED", date: "Sep 28, 2026" },
                { month: "August 2026", gross: "GH₵ 4,850.00", net: "GH₵ 4,084.80", status: "DISBURSED", date: "Aug 29, 2026" },
                { month: "July 2026", gross: "GH₵ 4,850.00", net: "GH₵ 4,084.80", status: "DISBURSED", date: "Jul 28, 2026" },
              ].map((item) => (
                <div key={item.month} className="py-3 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200 block">{item.month}</span>
                    <span className="text-[10px] text-slate-400">Paid on {item.date}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-black text-slate-900 dark:text-white">{item.net}</span>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      {item.status}
                    </span>
                    <button
                      onClick={() => setShowPayslipModal(true)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                    >
                      <Download className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Class Roster */}
      <PortalModal
        isOpen={!!activeRosterClass}
        onClose={() => setActiveRosterClass(null)}
        title={activeRosterClass ? `${activeRosterClass.name} — Student Roster` : "Class Roster"}
        description={`Showing enrolled students for ${activeRosterClass?.level}`}
        maxWidth="2xl"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Total Enrolled: <strong>{activeRosterClass?.studentCount}</strong></span>
            <span className="text-slate-500">Room: <strong>{activeRosterClass?.room}</strong></span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {gradeRows.map((st, i) => (
              <div key={st.id} className="py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex size-7 items-center justify-center rounded-full bg-indigo-50 font-mono text-xs font-bold text-indigo-700">
                    {i + 1}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">{st.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{st.studentId}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    Active
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </PortalModal>

      {/* MODAL: Payslip Preview */}
      <PortalModal
        isOpen={showPayslipModal}
        onClose={() => setShowPayslipModal(false)}
        title="Official Staff Payslip Voucher"
        description="Confidential payment statement issued by School Accounts Office"
        maxWidth="lg"
        footer={
          <button
            onClick={() => {
              window.print();
              setShowPayslipModal(false);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700"
          >
            <Printer className="size-4" />
            Print Official Payslip
          </button>
        }
      >
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 font-mono text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-200">
          <div className="text-center pb-4 border-b border-slate-200 dark:border-slate-700">
            <h4 className="text-sm font-black uppercase tracking-wider">SchoolHub Academy</h4>
            <p className="text-[10px] text-slate-500">Staff Remuneration Voucher • September 2026</p>
          </div>

          <div className="grid grid-cols-2 gap-3 py-3 border-b border-slate-200 dark:border-slate-700 text-[11px]">
            <div>Employee: <strong>Senior Science Tutor</strong></div>
            <div>Staff ID: <strong>TCH-2024-008</strong></div>
            <div>Bank: <strong>GCB Bank Ltd</strong></div>
            <div>Disbursed: <strong>Sep 28, 2026</strong></div>
          </div>

          <div className="space-y-2 py-3 border-b border-slate-200 dark:border-slate-700">
            <div className="flex justify-between font-bold text-indigo-700">
              <span>Earnings</span>
              <span>Amount</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Basic Salary</span>
              <span>GH₵ 3,850.00</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Teaching Allowance</span>
              <span>GH₵ 600.00</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Transport Allowance</span>
              <span>GH₵ 400.00</span>
            </div>
            <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-1">
              <span>Gross Pay</span>
              <span>GH₵ 4,850.00</span>
            </div>
          </div>

          <div className="space-y-2 py-3 border-b border-slate-200 dark:border-slate-700">
            <div className="flex justify-between font-bold text-rose-700">
              <span>Deductions</span>
              <span>Amount</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Income Tax (PAYE)</span>
              <span>GH₵ 500.20</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>SSNIT Pension (5.5%)</span>
              <span>GH₵ 265.00</span>
            </div>
            <div className="flex justify-between font-bold text-rose-700 border-t border-slate-200 pt-1">
              <span>Total Deductions</span>
              <span>GH₵ 765.20</span>
            </div>
          </div>

          <div className="flex justify-between items-center pt-3 text-sm font-black text-emerald-700">
            <span>NET AMOUNT PAID</span>
            <span className="text-base">GH₵ 4,084.80</span>
          </div>
        </div>
      </PortalModal>
    </div>
  );
}
