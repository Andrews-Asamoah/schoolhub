import { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Award,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  DollarSign,
  Download,
  FileCheck,
  FileText,
  Heart,
  HeartHandshake,
  Mail,
  MapPin,
  Megaphone,
  MessageSquare,
  Phone,
  Printer,
  QrCode,
  Send,
  Smartphone,
  Sparkles,
  TrendingUp,
  User,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { PortalStatCard } from "./portal-stat-card";
import { PortalModal } from "./portal-modal";
import { cn } from "@/lib/utils";
import { MyWardsPanel } from "@/components/school/student-profile-panel";
import { DataTable } from "@/components/ui/data-table";
import { useCanExportTables } from "@/lib/table-export-policy";

interface GuardianPortalWorkspaceProps {
  defaultTab?: "overview" | "academics" | "attendance" | "fees" | "timetable" | "notices";
}

interface LinkedChild {
  id: string;
  name: string;
  studentId: string;
  className: string;
  level: string;
  room: string;
  house: string;
  houseColor: string;
  classTeacher: string;
  classTeacherPhone: string;
  attendanceRate: number;
  termAverage: number;
  feeBalance: number;
  avatarInitials: string;
}

interface ChildGrade {
  subject: string;
  code: string;
  classScore: number;
  examScore: number;
  total: number;
  grade: string;
  position: string;
  teacherRemark: string;
}

const mockChildren: LinkedChild[] = [
  {
    id: "child-1",
    name: "Kofi Mensah",
    studentId: "STU-2024-001",
    className: "Basic 9 - Emerald",
    level: "JHS 3",
    room: "Block B, Room 102",
    house: "Aggrey House",
    houseColor: "bg-amber-500",
    classTeacher: "Mrs. Grace Appiah",
    classTeacherPhone: "+233 24 555 0192",
    attendanceRate: 97.5,
    termAverage: 86.4,
    feeBalance: 650,
    avatarInitials: "KM",
  },
  {
    id: "child-2",
    name: "Ama Mensah",
    studentId: "STU-2024-084",
    className: "Basic 6 - Sapphire",
    level: "Primary 6",
    room: "Block A, Room 105",
    house: "Gbewaa House",
    houseColor: "bg-blue-500",
    classTeacher: "Mr. Ebenezer Osei",
    classTeacherPhone: "+233 20 882 1194",
    attendanceRate: 100,
    termAverage: 91.2,
    feeBalance: 0,
    avatarInitials: "AM",
  },
];

const mockKofiGrades: ChildGrade[] = [
  { subject: "Integrated Science", code: "SCI-09", classScore: 28, examScore: 61, total: 89, grade: "A1", position: "1st of 38", teacherRemark: "Exceptional grasp of scientific concepts." },
  { subject: "Core Mathematics", code: "MTH-09", classScore: 26, examScore: 59, total: 85, grade: "A1", position: "2nd of 38", teacherRemark: "Strong analytical problem solving skills." },
  { subject: "English Language", code: "ENG-09", classScore: 25, examScore: 56, total: 81, grade: "A1", position: "4th of 38", teacherRemark: "Great expression and reading comprehension." },
  { subject: "Social Studies", code: "SOC-09", classScore: 24, examScore: 54, total: 78, grade: "B2", position: "5th of 38", teacherRemark: "Active participant in class discussions." },
  { subject: "Information Technology", code: "ICT-09", classScore: 29, examScore: 64, total: 93, grade: "A1", position: "1st of 38", teacherRemark: "Brilliant practical computing abilities." },
  { subject: "French Language", code: "FRN-09", classScore: 21, examScore: 48, total: 69, grade: "C4", position: "8th of 38", teacherRemark: "Needs more vocabulary practice." },
];

export function GuardianPortalWorkspace({ defaultTab = "overview" }: GuardianPortalWorkspaceProps) {
  const canExport = useCanExportTables();
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [selectedChildId, setSelectedChildId] = useState<string>("child-1");
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showReportCardModal, setShowReportCardModal] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Payment form state
  const [payAmount, setPayAmount] = useState("650");
  const [momoNumber, setMomoNumber] = useState("0244123456");
  const [momoNetwork, setMomoNetwork] = useState("MTN");
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Contact Teacher modal state
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactSubject, setContactSubject] = useState("");
  const [contactMessage, setContactMessage] = useState("");

  const activeChild: LinkedChild = mockChildren.find((c) => c.id === selectedChildId) ?? mockChildren[0]!;

  const triggerNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3500);
  };

  const handleSimulatePayment = (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessingPayment(true);
    setTimeout(() => {
      setIsProcessingPayment(false);
      setShowPaymentModal(false);
      activeChild.feeBalance = Math.max(0, activeChild.feeBalance - Number(payAmount));
      triggerNotice(`Payment prompt sent to ${momoNumber}! GH₵ ${Number(payAmount).toLocaleString()} confirmed.`);
    }, 1200);
  };

  return (
    <div className="space-y-6">
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-700 via-indigo-700 to-sky-900 p-6 text-white shadow-xl sm:p-8">
        <div className="absolute top-0 right-0 -m-16 size-72 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -m-10 size-60 rounded-full bg-sky-400/20 blur-2xl pointer-events-none" />

        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider backdrop-blur-md">
              <HeartHandshake className="size-3.5 text-blue-200" />
              Parent & Guardian Portal • SchoolHub Family Center
            </div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl md:text-4xl">
              Family & Ward Hub
            </h1>
            <p className="max-w-xl text-sm text-blue-100/90 leading-relaxed">
              Stay actively connected with your children&apos;s academic journey, monitor real-time class attendance, inspect terminal grades, and pay fees effortlessly.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {activeChild.feeBalance > 0 && (
              <button
                onClick={() => setShowPaymentModal(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-blue-900 shadow-md transition hover:bg-blue-50"
              >
                <Smartphone className="size-4 text-emerald-600" />
                Pay Fees Online
              </button>
            )}
            <button
              onClick={() => setShowReportCardModal(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-xs font-bold text-white backdrop-blur-md transition hover:bg-white/20"
            >
              <FileCheck className="size-4" />
              Term Report Card
            </button>
          </div>
        </div>
      </div>

      <MyWardsPanel />

      {/* Children Selector Pills */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400 pl-2">Select Child:</span>
        {mockChildren.map((child) => {
          const isSelected = child.id === selectedChildId;
          return (
            <button
              key={child.id}
              onClick={() => setSelectedChildId(child.id)}
              className={cn(
                "flex items-center gap-3 rounded-xl border p-2 pr-4 text-left transition-all",
                isSelected
                  ? "border-blue-600 bg-blue-50/70 shadow-xs ring-1 ring-blue-600 dark:bg-blue-950/40"
                  : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800",
              )}
            >
              <div className="flex size-9 items-center justify-center rounded-lg bg-blue-600 font-bold text-xs text-white">
                {child.avatarInitials}
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">{child.name}</p>
                <p className="text-[10px] text-slate-500">{child.className}</p>
              </div>
              {child.feeBalance > 0 && (
                <span className="ml-1 rounded-full bg-rose-50 px-2 py-0.5 text-[9px] font-bold text-rose-700">
                  Arrears
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* KPI Stats for Active Child */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <PortalStatCard
          label="Attendance Health"
          value={`${activeChild.attendanceRate}%`}
          subValue="Present"
          icon={CheckCircle2}
          variant="emerald"
          trend={{ value: "Punctual", isPositive: true }}
          onClick={() => setActiveTab("attendance")}
        />
        <PortalStatCard
          label="Term Grade Average"
          value={`${activeChild.termAverage}%`}
          subValue="Average Score"
          icon={Award}
          variant="blue"
          trend={{ value: "Top 5%", isPositive: true, label: "Class ranking" }}
          onClick={() => setActiveTab("academics")}
        />
        <PortalStatCard
          label="Outstanding Balance"
          value={activeChild.feeBalance > 0 ? `GH₵ ${activeChild.feeBalance.toLocaleString()}` : "GH₵ 0.00"}
          subValue={activeChild.feeBalance > 0 ? "Due for Term 1" : "Fully Cleared"}
          icon={Wallet}
          variant={activeChild.feeBalance > 0 ? "rose" : "emerald"}
          onClick={() => setActiveTab("fees")}
        />
        <PortalStatCard
          label="Class & House"
          value={activeChild.level}
          subValue={activeChild.house}
          icon={Users}
          variant="indigo"
          onClick={() => setActiveTab("timetable")}
        />
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        {[
          { id: "overview", label: "Ward Overview", icon: User },
          { id: "academics", label: "Academic Grades", icon: BookOpen },
          { id: "attendance", label: "Attendance Calendar", icon: Calendar },
          { id: "fees", label: "Fees & Payment", icon: Wallet, badge: activeChild.feeBalance > 0 ? "Due" : undefined },
          { id: "timetable", label: "Class Timetable", icon: Clock },
          { id: "notices", label: "School Notices & PTA", icon: Megaphone },
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
                  ? "bg-blue-600 text-white shadow-sm shadow-blue-600/20"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
              )}
            >
              <Icon className="size-4" />
              <span>{tab.label}</span>
              {tab.badge && (
                <span className="rounded-full bg-rose-500 px-1.5 py-0.2 text-[10px] text-white">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Toast Notice */}
      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800 shadow-xs dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          <Check className="size-4 text-emerald-600" />
          {notice}
        </div>
      )}

      {/* TAB: OVERVIEW */}
      {activeTab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Left: Child Profile Card */}
          <div className="space-y-6 lg:col-span-2">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-4">
                  <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 font-black text-xl text-white shadow-md shadow-blue-500/20">
                    {activeChild.avatarInitials}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      {activeChild.name}
                    </h3>
                    <p className="text-xs text-slate-500">
                      ID: <span className="font-mono font-semibold">{activeChild.studentId}</span> • {activeChild.className}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setShowReportCardModal(true)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  View Full Report Card →
                </button>
              </div>

              {/* Profile Details Grid */}
              <div className="mt-4 grid gap-3 sm:grid-cols-2 text-xs">
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Classroom Venue</p>
                  <p className="mt-0.5 font-bold text-slate-800 dark:text-slate-200">{activeChild.room}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">School House</p>
                  <p className="mt-0.5 font-bold text-slate-800 dark:text-slate-200">{activeChild.house}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Class Teacher</p>
                  <p className="mt-0.5 font-bold text-slate-800 dark:text-slate-200">{activeChild.classTeacher}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Teacher Contact</p>
                  <p className="mt-0.5 font-bold text-indigo-600 dark:text-indigo-400">{activeChild.classTeacherPhone}</p>
                </div>
              </div>
            </div>

            {/* Quick Academics Preview */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Award className="size-4 text-blue-600" />
                  Recent Continuous Assessment Highlights
                </h3>
                <button
                  onClick={() => setActiveTab("academics")}
                  className="text-xs font-semibold text-blue-600 hover:underline"
                >
                  All Subjects →
                </button>
              </div>

              <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                {mockKofiGrades.slice(0, 3).map((g) => (
                  <div key={g.code} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white">{g.subject}</p>
                      <p className="text-[10px] text-slate-400">{g.teacherRemark}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-black text-slate-800 dark:text-slate-200">{g.total}%</span>
                      <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                        {g.grade}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Contact Teacher & Fee Status */}
          <div className="space-y-4">
            {/* Fee Card */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Wallet className="size-4 text-emerald-600" />
                Fee Payment Status
              </h3>
              <div className="mt-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Current Balance:</span>
                  <span className={cn("text-base font-black", activeChild.feeBalance > 0 ? "text-rose-600" : "text-emerald-600")}>
                    GH₵ {activeChild.feeBalance.toLocaleString()}
                  </span>
                </div>
                {activeChild.feeBalance > 0 ? (
                  <button
                    onClick={() => setShowPaymentModal(true)}
                    className="mt-3 w-full rounded-xl bg-emerald-600 py-2.5 text-center text-xs font-bold text-white shadow-xs hover:bg-emerald-700"
                  >
                    Pay with Mobile Money
                  </button>
                ) : (
                  <p className="mt-2 text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="size-3.5" /> All term fees fully settled!
                  </p>
                )}
              </div>
            </div>

            {/* Quick Contact Teacher */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <MessageSquare className="size-4 text-indigo-600" />
                Inquire with Class Teacher
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Send an official message directly to {activeChild.classTeacher}.
              </p>
              <button
                onClick={() => setShowContactModal(true)}
                className="mt-3 w-full rounded-xl border border-slate-200 bg-white py-2 text-center text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Send Inquiry Message
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB: ACADEMICS */}
      {activeTab === "academics" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Terminal Academic Scores</h2>
              <p className="text-xs text-slate-500">Assessment marksheet and grading breakdown for {activeChild.name}</p>
            </div>
            <button
              onClick={() => setShowReportCardModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700"
            >
              <FileCheck className="size-4" />
              Download Terminal Report Card
            </button>
          </div>

          <DataTable
            rows={mockKofiGrades}
            canExport={canExport}
            exportTitle="Academic results"
            getRowId={(g) => g.code}
            emptyTitle="No results yet"
            emptyDescription="Published assessment results will appear here."
            columns={[
              {
                id: "subject",
                header: "Subject",
                value: (g) => `${g.subject} (${g.code})`,
                cell: (g) => (
                  <>
                    <p className="font-bold text-foreground">{g.subject}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">{g.code}</p>
                  </>
                ),
              },
              { id: "classScore", header: "Class Score (30)", className: "text-center", value: (g) => g.classScore, cell: (g) => <span className="font-medium">{g.classScore}</span> },
              { id: "examScore", header: "Exam Score (70)", className: "text-center", value: (g) => g.examScore, cell: (g) => <span className="font-medium">{g.examScore}</span> },
              { id: "total", header: "Total (100)", className: "text-center", value: (g) => g.total, cell: (g) => <span className="font-black text-foreground">{g.total}%</span> },
              {
                id: "grade",
                header: "Grade",
                className: "text-center",
                value: (g) => g.grade,
                cell: (g) => <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-black text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">{g.grade}</span>,
              },
              { id: "position", header: "Rank", className: "text-center", value: (g) => String(g.position), cell: (g) => <span className="font-semibold text-muted-foreground">{g.position}</span> },
              { id: "remark", header: "Teacher Remark", cell: (g) => g.teacherRemark },
            ]}
          />
        </div>
      )}

      {/* TAB: ATTENDANCE */}
      {activeTab === "attendance" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Attendance Calendar & Punctuality</h2>
              <p className="text-xs text-slate-500">Daily morning roll call record for {activeChild.name}</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
              {activeChild.attendanceRate}% Present
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 text-center dark:border-slate-800 dark:bg-slate-900">
              <p className="text-[10px] font-bold uppercase text-slate-400">Total School Days</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">45</p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 text-center dark:border-emerald-900/30 dark:bg-emerald-950/20">
              <p className="text-[10px] font-bold uppercase text-emerald-700">Days Present</p>
              <p className="text-2xl font-black text-emerald-700 mt-1">43</p>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4 text-center dark:border-amber-900/30 dark:bg-amber-950/20">
              <p className="text-[10px] font-bold uppercase text-amber-700">Late Arrivals</p>
              <p className="text-2xl font-black text-amber-700 mt-1">1</p>
            </div>
            <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-4 text-center dark:border-rose-900/30 dark:bg-rose-950/20">
              <p className="text-[10px] font-bold uppercase text-rose-700">Days Absent</p>
              <p className="text-2xl font-black text-rose-700 mt-1">1</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Recent 5-Day Attendance Log</h3>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {[
                { date: "Friday, Oct 17, 2026", status: "PRESENT", time: "07:42 AM", note: "On time" },
                { date: "Thursday, Oct 16, 2026", status: "PRESENT", time: "07:45 AM", note: "On time" },
                { date: "Wednesday, Oct 15, 2026", status: "LATE", time: "08:15 AM", note: "Late due to heavy rain" },
                { date: "Tuesday, Oct 14, 2026", status: "PRESENT", time: "07:38 AM", note: "On time" },
                { date: "Monday, Oct 13, 2026", status: "PRESENT", time: "07:40 AM", note: "On time" },
              ].map((log) => (
                <div key={log.date} className="py-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200 block">{log.date}</span>
                    <span className="text-[10px] text-slate-400">Clocked in: {log.time} • {log.note}</span>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[10px] font-black",
                      log.status === "PRESENT" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700",
                    )}
                  >
                    {log.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB: FEES & PAYMENT */}
      {activeTab === "fees" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">School Fees & Billing Statement</h2>
              <p className="text-xs text-slate-500">Official bill breakdown and receipt history for {activeChild.name}</p>
            </div>
            {activeChild.feeBalance > 0 && (
              <button
                onClick={() => setShowPaymentModal(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700"
              >
                <Smartphone className="size-4" />
                Pay Balance via Mobile Money
              </button>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Term 1 2025/2026 Bill Breakdown</h3>
            <div className="space-y-2 text-xs divide-y divide-slate-100 dark:divide-slate-800">
              <div className="flex justify-between py-2 text-slate-600 dark:text-slate-300">
                <span>Tuition & Instructional Material</span>
                <span className="font-semibold text-slate-900 dark:text-white">GH₵ 1,200.00</span>
              </div>
              <div className="flex justify-between py-2 text-slate-600 dark:text-slate-300">
                <span>Science Laboratory & Practical Levy</span>
                <span className="font-semibold text-slate-900 dark:text-white">GH₵ 250.00</span>
              </div>
              <div className="flex justify-between py-2 text-slate-600 dark:text-slate-300">
                <span>ICT & Computer Lab Access</span>
                <span className="font-semibold text-slate-900 dark:text-white">GH₵ 200.00</span>
              </div>
              <div className="flex justify-between py-2 text-slate-600 dark:text-slate-300">
                <span>PTA Dues & Development Levy</span>
                <span className="font-semibold text-slate-900 dark:text-white">GH₵ 200.00</span>
              </div>
              <div className="flex justify-between py-2 font-bold text-slate-900 dark:text-white border-t border-slate-200 pt-3">
                <span>Total Term 1 Bill</span>
                <span>GH₵ 1,850.00</span>
              </div>
              <div className="flex justify-between py-2 font-bold text-emerald-600">
                <span>Total Paid To Date</span>
                <span>-GH₵ 1,200.00</span>
              </div>
              <div className="flex justify-between py-2 text-sm font-black text-rose-600 border-t border-slate-200 pt-3">
                <span>Remaining Outstanding Balance</span>
                <span>GH₵ {activeChild.feeBalance.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: TIMETABLE */}
      {activeTab === "timetable" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{activeChild.className} — Class Schedule</h2>
              <p className="text-xs text-slate-500">Know your child&apos;s daily lessons, teachers, and timings</p>
            </div>
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
                      <p className="font-bold text-blue-700 dark:text-blue-400">Integrated Science</p>
                    </div>
                    <div className="rounded-lg bg-white p-2 border border-slate-100 shadow-2xs dark:bg-slate-800">
                      <p className="text-[10px] text-slate-400">09:00 - 09:50</p>
                      <p className="font-bold text-indigo-700 dark:text-indigo-400">Core Mathematics</p>
                    </div>
                    <div className="rounded-lg bg-amber-50/60 p-1.5 text-center text-[10px] font-semibold text-amber-800">
                      Snack Break (10:00 - 10:30)
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

      {/* TAB: NOTICES */}
      {activeTab === "notices" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">School Circulars & PTA Announcements</h2>
            <p className="text-xs text-slate-500">Official updates from the school administration</p>
          </div>

          <div className="space-y-3">
            {[
              {
                title: "Mid-Term Academic Progress Exhibition & Open Day",
                date: "October 24, 2026",
                category: "Event",
                body: "All parents and guardians are cordially invited to our Term 1 Open Day on Friday, Oct 24. Teachers will be available from 1:00 PM to discuss individual student learning targets.",
              },
              {
                title: "Annual Inter-House Athletics Competition",
                date: "November 5, 2026",
                category: "Sports",
                body: "Students in Aggrey, Gbewaa, and Osei Tutu houses will compete in track & field events at the El-Wak Stadium. Parent attendance is enthusiastically welcomed.",
              },
            ].map((n) => (
              <div key={n.title} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between text-xs">
                  <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                    {n.category}
                  </span>
                  <span className="text-slate-400 font-medium">{n.date}</span>
                </div>
                <h3 className="mt-2 text-sm font-bold text-slate-900 dark:text-white">{n.title}</h3>
                <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{n.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: Pay Fees Online */}
      <PortalModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        title="Pay School Fees with Mobile Money"
        description={`Paying outstanding balance for ${activeChild.name}`}
        maxWidth="md"
      >
        <form onSubmit={handleSimulatePayment} className="space-y-4 text-xs">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Network Provider</label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {["MTN Mobile Money", "Telecel Cash"].map((net) => (
                <button
                  key={net}
                  type="button"
                  onClick={() => setMomoNetwork(net)}
                  className={cn(
                    "rounded-xl border p-2.5 font-bold transition",
                    momoNetwork === net
                      ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                      : "border-slate-200 bg-white text-slate-600",
                  )}
                >
                  {net}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">MoMo Phone Number</label>
            <input
              required
              type="tel"
              value={momoNumber}
              onChange={(e) => setMomoNumber(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs font-mono dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Amount (GH₵)</label>
            <input
              required
              type="number"
              min="1"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 p-2 font-black text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="pt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowPaymentModal(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isProcessingPayment}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {isProcessingPayment ? "Sending Prompt..." : "Authorize Payment"}
            </button>
          </div>
        </form>
      </PortalModal>

      {/* MODAL: Official Report Card Preview */}
      <PortalModal
        isOpen={showReportCardModal}
        onClose={() => setShowReportCardModal(false)}
        title="Official Terminal Report Card"
        description="Comprehensive terminal performance appraisal"
        maxWidth="2xl"
        footer={
          <button
            onClick={() => {
              window.print();
              setShowReportCardModal(false);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
          >
            <Printer className="size-4" />
            Print Official Report Card
          </button>
        }
      >
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 font-mono text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-200">
          <div className="text-center pb-4 border-b border-slate-200 dark:border-slate-700">
            <h3 className="text-base font-black uppercase tracking-wider">SchoolHub Academy</h3>
            <p className="text-[10px] text-slate-500">Continuous Assessment & Terminal Examination Report</p>
            <p className="text-[10px] font-bold text-blue-700 mt-0.5">Academic Year 2025/2026 • First Term</p>
          </div>

          <div className="grid grid-cols-2 gap-2 py-3 border-b border-slate-200 dark:border-slate-700 text-[11px]">
            <div>Student: <strong>{activeChild.name}</strong></div>
            <div>Student ID: <strong>{activeChild.studentId}</strong></div>
            <div>Class: <strong>{activeChild.className}</strong></div>
            <div>Attendance: <strong>{activeChild.attendanceRate}%</strong></div>
          </div>

          <table className="w-full my-3 border-collapse text-left text-[11px]">
            <thead>
              <tr className="border-b border-slate-200 font-bold">
                <th className="py-1.5">Subject</th>
                <th className="py-1.5 text-center">Score</th>
                <th className="py-1.5 text-center">Grade</th>
                <th className="py-1.5">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mockKofiGrades.map((g) => (
                <tr key={g.code}>
                  <td className="py-1 font-bold">{g.subject}</td>
                  <td className="py-1 text-center">{g.total}%</td>
                  <td className="py-1 text-center font-bold text-blue-700">{g.grade}</td>
                  <td className="py-1 text-slate-600">{g.teacherRemark}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="py-2 border-t border-slate-200 text-xs">
            <p>Class Teacher&apos;s General Remark: <strong className="font-bold text-slate-900">An exceptionally hardworking student with exemplary conduct and leadership aptitude.</strong></p>
            <p className="mt-1">Headmaster&apos;s Signature: <strong>[ Certified — School Seal Affixed ]</strong></p>
          </div>
        </div>
      </PortalModal>

      {/* MODAL: Contact Teacher */}
      <PortalModal
        isOpen={showContactModal}
        onClose={() => setShowContactModal(false)}
        title={`Message ${activeChild.classTeacher}`}
        description="Direct communication regarding your child's academic or welfare needs"
        maxWidth="md"
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Subject</label>
            <input
              type="text"
              placeholder="e.g. Inquiry regarding science lab project"
              value={contactSubject}
              onChange={(e) => setContactSubject(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Message</label>
            <textarea
              rows={4}
              placeholder="Write your message here..."
              value={contactMessage}
              onChange={(e) => setContactMessage(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              onClick={() => setShowContactModal(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                triggerNotice(`Message successfully dispatched to ${activeChild.classTeacher}`);
                setShowContactModal(false);
                setContactSubject("");
                setContactMessage("");
              }}
              className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
            >
              Send Message
            </button>
          </div>
        </div>
      </PortalModal>
    </div>
  );
}
