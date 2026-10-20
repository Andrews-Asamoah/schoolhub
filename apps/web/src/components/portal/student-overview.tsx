import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Flame,
  GraduationCap,
  Megaphone,
  School,
  Sparkles,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";
import { PortalStatCard } from "./portal-stat-card";
import { StudentFeeAlertBanner, StudentFeeBadge } from "./student-fee-badge";
import { MyProfilePanel } from "@/components/school/student-profile-panel";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

interface StudentProfileResponse {
  id: string;
  studentId: string;
  admissionNumber: string;
  profile: {
    firstName: string;
    lastName: string;
  };
  class?: { id: string; name: string; level: string } | null;
  house?: { id: string; name: string } | null;
}

export function StudentOverview() {
  const { data: session } = useSession();
  const userName = session?.user?.name ?? "Kwame Asante";
  const firstName = userName.split(" ")[0] ?? "Student";

  const { data: profile } = useQuery({
    queryKey: ["students", "me", "profile"],
    queryFn: () => apiFetch<StudentProfileResponse>("/students/me"),
    retry: false,
  });

  const className = profile?.class?.name ?? "JHS 3 Emerald";
  const houseName = profile?.house?.name ?? "Aggrey House";
  const studentId = profile?.admissionNumber || profile?.studentId || "STU-2024-001";

  return (
    <div className="space-y-6">
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-700 via-indigo-700 to-purple-900 p-6 text-white shadow-xl sm:p-8">
        <div className="pointer-events-none absolute top-0 right-0 -m-16 size-72 rounded-full bg-violet-400/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 -m-10 size-60 rounded-full bg-purple-400/20 blur-2xl" />

        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider backdrop-blur-md">
              <School className="size-3.5 text-purple-200" />
              Student Learning Portal • {className}
            </div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl md:text-4xl">
              Welcome back, {firstName}! 👋
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-purple-100/90">
              Admission ID: <span className="font-mono font-bold text-white">{studentId}</span> • {houseName} • Class Prefect
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Prominent Fee Payment Status Badge */}
            <StudentFeeBadge className="bg-white/15 text-white border-white/30 backdrop-blur-md" />

            <Link
              to="/$page"
              params={{ page: "timetable" }}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-indigo-900 shadow-md transition hover:bg-purple-50"
            >
              <Clock className="size-4 text-indigo-700" />
              View Today&apos;s Schedule
            </Link>
          </div>
        </div>
      </div>

      {/* Fee Status Notice Alert Banner */}
      <StudentFeeAlertBanner />

      {/* My Student Profile Details */}
      <MyProfilePanel />

      {/* KPI Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <PortalStatCard
          label="Term Grade Average"
          value="86.4%"
          subValue="Class Rank: #1 of 38"
          icon={Award}
          variant="purple"
          trend={{ value: "Exemplary", isPositive: true }}
        />
        <PortalStatCard
          label="Attendance Streak"
          value="18 Days"
          subValue="97.4% Term Attendance"
          icon={Flame}
          variant="amber"
          trend={{ value: "On track", isPositive: true }}
        />
        <PortalStatCard
          label="Pending Homework"
          value="2 Tasks"
          subValue="Due this week"
          icon={BookOpen}
          variant="blue"
        />
        <PortalStatCard
          label="House Points"
          value="450 pts"
          subValue={`${houseName} (#1)`}
          icon={Trophy}
          variant="emerald"
        />
      </div>

      {/* Today's Lessons & Quick Actions */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column: Today's Schedule & Homework */}
        <div className="space-y-6 lg:col-span-2">
          {/* Today's Lessons */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
                <Clock className="size-4 text-indigo-600" />
                Today&apos;s Class Lessons
              </h3>
              <Link
                to="/$page"
                params={{ page: "timetable" }}
                className="text-xs font-semibold text-indigo-600 hover:underline"
              >
                Full Week Schedule →
              </Link>
            </div>

            <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
              {[
                { period: "P1", time: "08:00 - 08:50 AM", subject: "Integrated Science", teacher: "Mrs. Grace Appiah", room: "Room 102", status: "completed" },
                { period: "P2", time: "09:00 - 09:50 AM", subject: "Core Mathematics", teacher: "Mr. Kwabena Darko", room: "Room 102", status: "live" },
                { period: "P4", time: "11:15 - 12:05 PM", subject: "English Language", teacher: "Ms. Veronica Kusi", room: "Room 102", status: "upcoming" },
                { period: "P6", time: "01:30 - 02:20 PM", subject: "ICT Practical", teacher: "Mr. Ebenezer Osei", room: "Computer Lab", status: "upcoming" },
              ].map((item) => (
                <div key={item.period} className="flex items-center justify-between gap-4 py-3 text-xs">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex size-9 items-center justify-center rounded-xl font-mono text-xs font-bold",
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
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold text-amber-700">
                            <span className="size-1 animate-pulse rounded-full bg-amber-500" />
                            LIVE NOW
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400">{item.teacher} • {item.room}</p>
                    </div>
                  </div>
                  <span className="font-medium text-slate-500">{item.time}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Pending Coursework */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
                <BookOpen className="size-4 text-indigo-600" />
                Homework & Lab Submissions
              </h3>
              <Link
                to="/$page"
                params={{ page: "assignments" }}
                className="text-xs font-semibold text-indigo-600 hover:underline"
              >
                View All Assignments →
              </Link>
            </div>

            <div className="mt-3 space-y-3">
              {[
                {
                  id: "asg-1",
                  title: "Newton's Laws of Motion Lab Report",
                  subject: "Integrated Science",
                  dueDate: "Tomorrow at 11:59 PM",
                  instructions: "Write a 2-page laboratory observation on our pendulum experiments.",
                },
                {
                  id: "asg-2",
                  title: "Quadratic Equations Problem Set 4",
                  subject: "Core Mathematics",
                  dueDate: "In 3 days",
                  instructions: "Complete exercises 4.1 to 4.5 in your textbook. Show all working steps.",
                },
              ].map((asg) => (
                <div key={asg.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-4 text-xs dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="flex items-center justify-between">
                    <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                      {asg.subject}
                    </span>
                    <span className="font-bold text-rose-600">{asg.dueDate}</span>
                  </div>
                  <h4 className="mt-2 text-xs font-bold text-slate-900 dark:text-white">{asg.title}</h4>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{asg.instructions}</p>
                  <div className="mt-3 flex justify-end">
                    <Link
                      to="/$page"
                      params={{ page: "assignments" }}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 font-bold text-white shadow-xs hover:bg-indigo-700"
                    >
                      Submit Solution →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: House, Notices, and Quick Links */}
        <div className="space-y-5">
          {/* House Standings Card */}
          <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100/60 p-5 shadow-xs dark:border-amber-900/40 dark:bg-amber-950/20">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
                <Trophy className="size-5" />
              </div>
              <div>
                <h4 className="text-sm font-black text-amber-950 dark:text-amber-200">{houseName}</h4>
                <p className="italic text-[11px] font-medium text-amber-800 dark:text-amber-300">&ldquo;Always on Top&rdquo;</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-white/80 p-3 text-xs dark:bg-slate-800">
              <span className="text-slate-600 dark:text-slate-300">House Standings</span>
              <span className="font-black text-amber-700 dark:text-amber-300">1st Place (450 pts)</span>
            </div>
            <div className="mt-3 text-right">
              <Link
                to="/$page"
                params={{ page: "houses" }}
                className="text-xs font-bold text-amber-900 hover:underline dark:text-amber-200"
              >
                View Inter-House Standings →
              </Link>
            </div>
          </div>

          {/* School Notice Snippet */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
              <Megaphone className="size-4 text-blue-600" />
              Student Notice Board
            </h4>
            <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              National Science & Maths Quiz (NSMQ) school trials take place this Wednesday at 3:30 PM in the Assembly Hall.
            </p>
            <div className="mt-3 text-right">
              <Link
                to="/$page"
                params={{ page: "announcements" }}
                className="text-xs font-bold text-indigo-600 hover:underline"
              >
                All Announcements →
              </Link>
            </div>
          </div>

          {/* Quick Hub Navigation Cards */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Student Navigation Hub
            </h4>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <Link
                to="/$page"
                params={{ page: "subjects" }}
                className="flex items-center gap-2 rounded-xl border border-slate-100 p-2.5 font-semibold text-slate-700 hover:border-indigo-200 hover:bg-indigo-50/50 dark:border-slate-800 dark:text-slate-200"
              >
                <BookOpen className="size-4 text-indigo-600" />
                <span>My Subjects</span>
              </Link>

              <Link
                to="/$page"
                params={{ page: "attendance" }}
                className="flex items-center gap-2 rounded-xl border border-slate-100 p-2.5 font-semibold text-slate-700 hover:border-indigo-200 hover:bg-indigo-50/50 dark:border-slate-800 dark:text-slate-200"
              >
                <Clock className="size-4 text-emerald-600" />
                <span>Attendance</span>
              </Link>

              <Link
                to="/$page"
                params={{ page: "assessments" }}
                className="flex items-center gap-2 rounded-xl border border-slate-100 p-2.5 font-semibold text-slate-700 hover:border-indigo-200 hover:bg-indigo-50/50 dark:border-slate-800 dark:text-slate-200"
              >
                <Award className="size-4 text-purple-600" />
                <span>Academic Report</span>
              </Link>

              <Link
                to="/$page"
                params={{ page: "classmates" }}
                className="flex items-center gap-2 rounded-xl border border-slate-100 p-2.5 font-semibold text-slate-700 hover:border-indigo-200 hover:bg-indigo-50/50 dark:border-slate-800 dark:text-slate-200"
              >
                <Users className="size-4 text-blue-600" />
                <span>Classmates</span>
              </Link>

              <Link
                to="/$page"
                params={{ page: "clubs" }}
                className="flex items-center gap-2 rounded-xl border border-slate-100 p-2.5 font-semibold text-slate-700 hover:border-indigo-200 hover:bg-indigo-50/50 dark:border-slate-800 dark:text-slate-200"
              >
                <Sparkles className="size-4 text-amber-600" />
                <span>Clubs Joined</span>
              </Link>

              <Link
                to="/$page"
                params={{ page: "houses" }}
                className="flex items-center gap-2 rounded-xl border border-slate-100 p-2.5 font-semibold text-slate-700 hover:border-indigo-200 hover:bg-indigo-50/50 dark:border-slate-800 dark:text-slate-200"
              >
                <Trophy className="size-4 text-amber-500" />
                <span>House Standing</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
