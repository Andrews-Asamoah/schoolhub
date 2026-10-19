import { useState } from "react";
import {
  AlertCircle,
  Award,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  Download,
  FileCheck,
  FileText,
  Flame,
  GraduationCap,
  Home,
  LayoutDashboard,
  Megaphone,
  Printer,
  School,
  Sparkles,
  Trophy,
  Upload,
  User,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { PortalStatCard } from "./portal-stat-card";
import { PortalModal } from "./portal-modal";
import { cn } from "@/lib/utils";
import { MyProfilePanel } from "@/components/school/student-profile-panel";
import { DataTable } from "@/components/ui/data-table";
import { useCanExportTables } from "@/lib/table-export-policy";

interface StudentPortalWorkspaceProps {
  defaultTab?: "dashboard" | "timetable" | "grades" | "assignments" | "classmates" | "house" | "fees";
}

interface StudentAssignment {
  id: string;
  title: string;
  subject: string;
  dueDate: string;
  maxScore: number;
  status: "PENDING" | "SUBMITTED" | "GRADED";
  score?: number;
  instructions: string;
}

interface Classmate {
  id: string;
  name: string;
  role?: string;
  house: string;
  avatarInitials: string;
}

const mockAssignments: StudentAssignment[] = [
  {
    id: "asg-1",
    title: "Newton's Laws of Motion Lab Report",
    subject: "Integrated Science",
    dueDate: "Tomorrow at 11:59 PM",
    maxScore: 30,
    status: "PENDING",
    instructions: "Write a 2-page laboratory observation on our pendulum experiments. Include force diagram calculations.",
  },
  {
    id: "asg-2",
    title: "Quadratic Equations Problem Set 4",
    subject: "Core Mathematics",
    dueDate: "In 3 days",
    maxScore: 20,
    status: "PENDING",
    instructions: "Complete exercises 4.1 to 4.5 in your textbook. Show all working steps.",
  },
  {
    id: "asg-3",
    title: "Expository Essay: The Impact of AI on Education",
    subject: "English Language",
    dueDate: "Submitted Oct 12",
    maxScore: 30,
    score: 28,
    status: "GRADED",
    instructions: "Well structured essay with excellent thesis and vocabulary.",
  },
];

const mockClassmates: Classmate[] = [
  { id: "cm-1", name: "Kwame Asante (You)", role: "Class Prefect", house: "Aggrey House", avatarInitials: "KA" },
  { id: "cm-2", name: "Ama Boateng", role: "Assistant Prefect", house: "Aggrey House", avatarInitials: "AB" },
  { id: "cm-3", name: "Emanuel Mensah", role: "Sports Captain", house: "Gbewaa House", avatarInitials: "EM" },
  { id: "cm-4", name: "Akua Osei", house: "Osei Tutu House", avatarInitials: "AO" },
  { id: "cm-5", name: "Kofi Appiah", house: "Yaa Asantewaa House", avatarInitials: "KA" },
  { id: "cm-6", name: "Abena Danquah", house: "Aggrey House", avatarInitials: "AD" },
  { id: "cm-7", name: "Yaw Frimpong", house: "Gbewaa House", avatarInitials: "YF" },
];

export function StudentPortalWorkspace({ defaultTab = "dashboard" }: StudentPortalWorkspaceProps) {
  const canExport = useCanExportTables();
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [assignments, setAssignments] = useState<StudentAssignment[]>(mockAssignments);
  const [activeAssignmentToSubmit, setActiveAssignmentToSubmit] = useState<StudentAssignment | null>(null);
  const [submissionText, setSubmissionText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const triggerNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3500);
  };

  const handleAssignmentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAssignmentToSubmit) return;

    setAssignments((prev) =>
      prev.map((asg) =>
        asg.id === activeAssignmentToSubmit.id
          ? { ...asg, status: "SUBMITTED" }
          : asg,
      ),
    );

    triggerNotice(`Assignment "${activeAssignmentToSubmit.title}" submitted successfully!`);
    setActiveAssignmentToSubmit(null);
    setSubmissionText("");
  };

  const studentResults = [
    { name: "Integrated Science", code: "SCI-09", cw: 28, ex: 61, tot: 89, gr: "A1", rk: "#1", rm: "Outstanding mastery of concepts." },
    { name: "Core Mathematics", code: "MTH-09", cw: 26, ex: 59, tot: 85, gr: "A1", rk: "#2", rm: "Excellent analytical clarity." },
    { name: "English Language", code: "ENG-09", cw: 25, ex: 56, tot: 81, gr: "A1", rk: "#4", rm: "Great essay structure and vocabulary." },
    { name: "Social Studies", code: "SOC-09", cw: 24, ex: 54, tot: 78, gr: "B2", rk: "#5", rm: "Good historical insights." },
    { name: "Information Technology", code: "ICT-09", cw: 29, ex: 64, tot: 93, gr: "A1", rk: "#1", rm: "Brilliant practical skill." },
    { name: "French Language", code: "FRN-09", cw: 21, ex: 48, tot: 69, gr: "C4", rk: "#8", rm: "More verbal practice recommended." }
  ];

  return (
    <div className="space-y-6">
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-700 via-indigo-700 to-purple-900 p-6 text-white shadow-xl sm:p-8">
        <div className="absolute top-0 right-0 -m-16 size-72 rounded-full bg-violet-400/20 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -m-10 size-60 rounded-full bg-purple-400/20 blur-2xl pointer-events-none" />

        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider backdrop-blur-md">
              <School className="size-3.5 text-purple-200" />
              Student Learning Portal • JHS 3 Emerald
            </div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl md:text-4xl">
              Welcome back, Kwame! 👋
            </h1>
            <p className="max-w-xl text-sm text-purple-100/90 leading-relaxed">
              Admission ID: <span className="font-mono font-bold text-white">STU-2024-001</span> • Aggrey House • Class Prefect
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/20 px-3.5 py-1.5 text-xs font-bold text-emerald-200 backdrop-blur-md">
              <CheckCircle2 className="size-4 text-emerald-400" />
              Exam Clearance: Approved
            </span>
            <button
              onClick={() => setActiveTab("timetable")}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-indigo-900 shadow-md transition hover:bg-purple-50"
            >
              <Clock className="size-4 text-indigo-700" />
              View Today&apos;s Schedule
            </button>
          </div>
        </div>
      </div>

      <MyProfilePanel />

      {/* KPI Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <PortalStatCard
          label="Term Grade Average"
          value="86.4%"
          subValue="Class Rank: #1"
          icon={Award}
          variant="purple"
          trend={{ value: "Exemplary", isPositive: true }}
          onClick={() => setActiveTab("grades")}
        />
        <PortalStatCard
          label="Attendance Streak"
          value="18 Days"
          subValue="100% Punctual"
          icon={Flame}
          variant="amber"
          trend={{ value: "On track", isPositive: true }}
        />
        <PortalStatCard
          label="Pending Homework"
          value={assignments.filter((a) => a.status === "PENDING").length}
          subValue="Due this week"
          icon={BookOpen}
          variant="blue"
          onClick={() => setActiveTab("assignments")}
        />
        <PortalStatCard
          label="House Points"
          value="450 pts"
          subValue="Aggrey House (#1)"
          icon={Trophy}
          variant="emerald"
          onClick={() => setActiveTab("house")}
        />
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        {[
          { id: "dashboard", label: "Learning Dashboard", icon: LayoutDashboard },
          { id: "timetable", label: "My Timetable", icon: Clock },
          { id: "grades", label: "Grades & Exam Results", icon: Award },
          { id: "assignments", label: "Assignments & Homework", icon: BookOpen, badge: assignments.filter((a) => a.status === "PENDING").length },
          { id: "classmates", label: "Class & Classmates", icon: Users },
          { id: "house", label: "House & Clubs", icon: Trophy },
          { id: "fees", label: "Fee Clearance", icon: Wallet },
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
              {tab.badge !== undefined && tab.badge > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.2 text-[10px]",
                    isActive ? "bg-white/20 text-white" : "bg-indigo-100 text-indigo-700 dark:bg-slate-800",
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Notice */}
      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800 shadow-xs dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          <Check className="size-4 text-emerald-600" />
          {notice}
        </div>
      )}

      {/* TAB: DASHBOARD */}
      {activeTab === "dashboard" && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Left: Today's Classes & Pending Work */}
          <div className="space-y-6 lg:col-span-2">
            {/* Today's Lessons */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Clock className="size-4 text-indigo-600" />
                  Today&apos;s Class Lessons
                </h3>
                <button
                  onClick={() => setActiveTab("timetable")}
                  className="text-xs font-semibold text-indigo-600 hover:underline"
                >
                  Full Week Schedule →
                </button>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800 mt-2">
                {[
                  { period: "P1", time: "08:00 - 08:50 AM", subject: "Integrated Science", teacher: "Mrs. Grace Appiah", room: "Room 102", status: "completed" },
                  { period: "P2", time: "09:00 - 09:50 AM", subject: "Core Mathematics", teacher: "Mr. Kwabena Darko", room: "Room 102", status: "live" },
                  { period: "P4", time: "11:15 - 12:05 PM", subject: "English Language", teacher: "Ms. Veronica Kusi", room: "Room 102", status: "upcoming" },
                  { period: "P6", time: "01:30 - 02:20 PM", subject: "ICT Practical", teacher: "Mr. Ebenezer Osei", room: "Computer Lab", status: "upcoming" },
                ].map((item) => (
                  <div key={item.period} className="py-3 flex items-center justify-between gap-4 text-xs">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex size-9 items-center justify-center rounded-xl font-bold font-mono text-xs",
                          item.status === "live"
                            ? "bg-amber-100 text-amber-900 ring-2 ring-amber-400"
                            : item.status === "completed"
                              ? "bg-emerald-50 text-emerald-800"
                              : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
                        )}
                      >
                        {item.period}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-slate-900 dark:text-white">{item.subject}</p>
                          {item.status === "live" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold text-amber-700 border border-amber-300">
                              <span className="size-1 animate-pulse rounded-full bg-amber-500" />
                              NOW
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400">{item.teacher} • {item.room}</p>
                      </div>
                    </div>
                    <span className="text-slate-500 font-medium">{item.time}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Assignments Due */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <BookOpen className="size-4 text-indigo-600" />
                  Homework & Lab Submissions
                </h3>
                <button
                  onClick={() => setActiveTab("assignments")}
                  className="text-xs font-semibold text-indigo-600 hover:underline"
                >
                  View All →
                </button>
              </div>

              <div className="mt-3 space-y-3">
                {assignments.filter((a) => a.status === "PENDING").map((asg) => (
                  <div key={asg.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                        {asg.subject}
                      </span>
                      <span className="font-bold text-rose-600">{asg.dueDate}</span>
                    </div>
                    <h4 className="mt-2 text-xs font-bold text-slate-900 dark:text-white">{asg.title}</h4>
                    <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">{asg.instructions}</p>
                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={() => setActiveAssignmentToSubmit(asg)}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 font-bold text-white shadow-xs hover:bg-indigo-700"
                      >
                        Submit Solution →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: House info & Quick actions */}
          <div className="space-y-4">
            {/* House Banner */}
            <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100/60 p-5 shadow-xs dark:border-amber-900/40 dark:bg-amber-950/20">
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
                  <Trophy className="size-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-amber-950 dark:text-amber-200">Aggrey House</h4>
                  <p className="text-[11px] font-medium text-amber-800 dark:text-amber-300 italic">&ldquo;Always on Top&rdquo;</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between rounded-xl bg-white/80 p-3 text-xs dark:bg-slate-800">
                <span className="text-slate-600 dark:text-slate-300">House Standings</span>
                <span className="font-black text-amber-700">1st Place (450 pts)</span>
              </div>
            </div>

            {/* School Notice */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Megaphone className="size-4 text-blue-600" />
                Student Notice Board
              </h4>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                National Science & Maths Quiz (NSMQ) school trials take place this Wednesday at 3:30 PM in the Assembly Hall.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB: TIMETABLE */}
      {activeTab === "timetable" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Class Timetable (JHS 3 Emerald)</h2>
              <p className="text-xs text-slate-500">Weekly class periods and teacher allocations</p>
            </div>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              <Printer className="size-4" />
              Print
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="grid min-w-[700px] grid-cols-5 gap-3 text-xs">
              {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((day) => (
                <div key={day} className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                  <h4 className="font-bold text-slate-900 dark:text-white pb-2 border-b border-slate-200 dark:border-slate-700">
                    {day}
                  </h4>
                  <div className="mt-2.5 space-y-2">
                    <div className="rounded-lg bg-white p-2 border border-slate-100 shadow-2xs dark:bg-slate-800">
                      <p className="text-[10px] text-slate-400">08:00 - 08:50</p>
                      <p className="font-bold text-indigo-700 dark:text-indigo-400">Integrated Science</p>
                    </div>
                    <div className="rounded-lg bg-white p-2 border border-slate-100 shadow-2xs dark:bg-slate-800">
                      <p className="text-[10px] text-slate-400">09:00 - 09:50</p>
                      <p className="font-bold text-blue-700 dark:text-blue-400">Core Mathematics</p>
                    </div>
                    <div className="rounded-lg bg-amber-50/60 p-1.5 text-center text-[10px] font-semibold text-amber-800">
                      Morning Break (10:00)
                    </div>
                    <div className="rounded-lg bg-white p-2 border border-slate-100 shadow-2xs dark:bg-slate-800">
                      <p className="text-[10px] text-slate-400">10:30 - 11:20</p>
                      <p className="font-bold text-emerald-700 dark:text-emerald-400">English Language</p>
                    </div>
                    <div className="rounded-lg bg-white p-2 border border-slate-100 shadow-2xs dark:bg-slate-800">
                      <p className="text-[10px] text-slate-400">11:30 - 12:20</p>
                      <p className="font-bold text-purple-700 dark:text-purple-400">Social Studies</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB: GRADES */}
      {activeTab === "grades" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Continuous Assessment & Exam Scores</h2>
              <p className="text-xs text-slate-500">First Term 2025/2026 Academic Record</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
              GPA: 3.92 / 4.00
            </span>
          </div>

          <DataTable
            rows={studentResults}
            canExport={canExport}
            exportTitle="Academic record"
            getRowId={(row) => row.code}
            emptyTitle="No results yet"
            emptyDescription="Published assessment results will appear here."
            columns={[
              { id: "subject", header: "Subject", cell: (row) => <span className="font-bold text-foreground">{row.name}</span> },
              { id: "cw", header: "Classwork (30)", className: "text-center", value: (row) => row.cw, cell: (row) => <span className="font-medium">{row.cw}</span> },
              { id: "ex", header: "Exam (70)", className: "text-center", value: (row) => row.ex, cell: (row) => <span className="font-medium">{row.ex}</span> },
              { id: "tot", header: "Total (100)", className: "text-center", value: (row) => row.tot, cell: (row) => <span className="font-black text-foreground">{row.tot}%</span> },
              {
                id: "gr",
                header: "Grade",
                className: "text-center",
                value: (row) => row.gr,
                cell: (row) => <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-black text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">{row.gr}</span>,
              },
              { id: "rk", header: "Class Rank", className: "text-center", value: (row) => Number(row.rk.replace("#", "")), cell: (row) => <span className="font-semibold text-muted-foreground">{row.rk}</span> },
              { id: "rm", header: "Teacher Remark", cell: (row) => row.rm },
            ]}
          />
        </div>
      )}

      {/* TAB: ASSIGNMENTS */}
      {activeTab === "assignments" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Assignments & Coursework</h2>
              <p className="text-xs text-slate-500">Submit completed tasks and review grades</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {assignments.map((asg) => (
              <div
                key={asg.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
              >
                <div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                      {asg.subject}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold",
                        asg.status === "GRADED" && "bg-emerald-50 text-emerald-700",
                        asg.status === "SUBMITTED" && "bg-blue-50 text-blue-700",
                        asg.status === "PENDING" && "bg-amber-50 text-amber-700",
                      )}
                    >
                      {asg.status}
                    </span>
                  </div>
                  <h3 className="mt-2 text-sm font-bold text-slate-900 dark:text-white">{asg.title}</h3>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed">{asg.instructions}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-medium">{asg.dueDate}</span>
                  {asg.status === "PENDING" ? (
                    <button
                      onClick={() => setActiveAssignmentToSubmit(asg)}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 font-bold text-white shadow-xs hover:bg-indigo-700"
                    >
                      Submit File
                    </button>
                  ) : asg.status === "GRADED" ? (
                    <span className="font-black text-emerald-600">
                      {asg.score} / {asg.maxScore} marks
                    </span>
                  ) : (
                    <span className="text-blue-600 font-semibold flex items-center gap-1">
                      <Check className="size-3.5" /> Awaiting Review
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: CLASSMATES */}
      {activeTab === "classmates" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">JHS 3 Emerald — Classmates</h2>
              <p className="text-xs text-slate-500">Your classmates and peer leaders</p>
            </div>
            <span className="text-xs font-semibold text-slate-500">38 Enrolled Students</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {mockClassmates.map((cm) => (
              <div
                key={cm.id}
                className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 font-bold text-xs text-indigo-700 dark:bg-indigo-950/40">
                  {cm.avatarInitials}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">{cm.name}</h4>
                  <p className="text-[10px] text-slate-400">{cm.house}</p>
                  {cm.role && (
                    <span className="inline-block mt-1 rounded-md bg-amber-50 px-1.5 py-0.2 text-[9px] font-bold text-amber-700">
                      {cm.role}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: HOUSE */}
      {activeTab === "house" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-6 shadow-xs dark:border-amber-900/40 dark:bg-amber-950/20">
            <div className="flex items-center justify-between">
              <div>
                <span className="rounded-md bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white uppercase">
                  Leading House
                </span>
                <h2 className="mt-1.5 text-2xl font-black text-amber-950 dark:text-amber-200">Aggrey House</h2>
                <p className="text-xs text-amber-800 dark:text-amber-300 italic mt-0.5">&ldquo;Always on Top&rdquo;</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-black text-amber-600">450</p>
                <p className="text-[10px] uppercase font-bold text-amber-800">House Points</p>
              </div>
            </div>
          </div>

          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Inter-House Championship Leaderboard</h3>
          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80 bg-white p-4 text-xs dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {[
              { rank: 1, name: "Aggrey House (Yellow)", points: 450, isUserHouse: true },
              { rank: 2, name: "Gbewaa House (Blue)", points: 420 },
              { rank: 3, name: "Osei Tutu House (Green)", points: 395 },
              { rank: 4, name: "Yaa Asantewaa House (Red)", points: 380 },
            ].map((h) => (
              <div key={h.rank} className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={cn("size-6 rounded-full flex items-center justify-center font-bold text-xs", h.rank === 1 ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-600")}>
                    {h.rank}
                  </span>
                  <span className={cn("font-bold", h.isUserHouse ? "text-indigo-600" : "text-slate-800 dark:text-slate-200")}>
                    {h.name} {h.isUserHouse && "(Your House)"}
                  </span>
                </div>
                <span className="font-black text-slate-900 dark:text-white">{h.points} pts</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: FEES */}
      {activeTab === "fees" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6 shadow-xs dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <div className="flex items-center justify-between">
              <div>
                <span className="rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white uppercase">
                  Examination Clearance
                </span>
                <h2 className="mt-1.5 text-2xl font-black text-emerald-950 dark:text-emerald-200">Hall Pass Approved</h2>
                <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-0.5">
                  You are officially certified to sit for all Term 1 Examination papers.
                </p>
              </div>
              <CheckCircle2 className="size-12 text-emerald-600" />
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Submit Assignment */}
      <PortalModal
        isOpen={!!activeAssignmentToSubmit}
        onClose={() => setActiveAssignmentToSubmit(null)}
        title={activeAssignmentToSubmit ? `Submit: ${activeAssignmentToSubmit.title}` : "Submit Assignment"}
        description={`Course: ${activeAssignmentToSubmit?.subject}`}
        maxWidth="md"
      >
        <form onSubmit={handleAssignmentSubmit} className="space-y-4 text-xs">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Assignment Brief</label>
            <p className="mt-1 text-slate-600 dark:text-slate-300">{activeAssignmentToSubmit?.instructions}</p>
          </div>

          <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 p-6 text-center dark:border-indigo-800 dark:bg-indigo-950/20">
            <Upload className="mx-auto size-8 text-indigo-600" />
            <p className="mt-2 font-bold text-slate-800 dark:text-slate-200">Upload assignment PDF or Doc</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Drag and drop file here, or click to browse</p>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Student Submission Notes</label>
            <textarea
              rows={3}
              placeholder="Add any comments or notes for your teacher..."
              value={submissionText}
              onChange={(e) => setSubmissionText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setActiveAssignmentToSubmit(null)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
            >
              Confirm Submission
            </button>
          </div>
        </form>
      </PortalModal>
    </div>
  );
}
