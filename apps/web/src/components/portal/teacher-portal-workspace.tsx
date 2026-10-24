import { BookOpen, Calendar, ClipboardCheck, FileSpreadsheet, GraduationCap, LayoutDashboard, Megaphone, UserCheck, Users } from "lucide-react";
import { useState } from "react";
import { AssessmentEntryWorkspace } from "@/components/school/assessment-entry-workspace";
import { ClassRegister } from "@/components/school/class-register";
import { TimetableWorkspace } from "@/components/school/timetable-workspace";
import { useTeachingOverview } from "@/lib/teaching";
import { cn } from "@/lib/utils";
import { PortalStatCard } from "./portal-stat-card";
import { TeacherClassesView } from "./teacher-classes-view";
import { AdminAnnouncementsWorkspace } from "./admin-announcements-workspace";

type Tab = "overview" | "classes" | "gradebook" | "attendance" | "timetable" | "announcements";

interface TeacherPortalWorkspaceProps {
  defaultTab?: Tab;
}

/**
 * The teacher's workspace, driven by real assignments: the classes they teach,
 * the ones they are class teacher of (register and class management), and the
 * subjects they enter marks for.
 */
export function TeacherPortalWorkspace({ defaultTab = "overview" }: TeacherPortalWorkspaceProps) {
  const overview = useTeachingOverview();
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);
  const [marksTarget, setMarksTarget] = useState<{ classId: string; subjectId: string } | null>(null);
  const [registerClassId, setRegisterClassId] = useState("");

  const classes = overview.data?.classes ?? [];
  const ownClasses = classes.filter((klass) => klass.isClassTeacher);
  const subjectCount = new Set(classes.flatMap((klass) => klass.subjects.map((subject) => subject.id))).size;
  const pupils = classes.reduce((total, klass) => total + klass.studentCount, 0);
  const registerClass = ownClasses.find((klass) => klass.id === registerClassId) ?? ownClasses[0];

  function openMarks(classId: string, subjectId: string) {
    setMarksTarget({ classId, subjectId });
    setActiveTab("gradebook");
  }
  function openRegister(classId: string) {
    setRegisterClassId(classId);
    setActiveTab("attendance");
  }

  const tabs: { id: Tab; label: string; icon: typeof Users; badge?: number }[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "classes", label: "My Classes", icon: Users, badge: classes.length || undefined },
    { id: "gradebook", label: "Gradebook & Marks", icon: FileSpreadsheet },
    { id: "attendance", label: "Attendance Register", icon: ClipboardCheck },
    { id: "timetable", label: "Weekly Timetable", icon: Calendar },
    { id: "announcements", label: "Announcements", icon: Megaphone },
  ];

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl bg-primary p-6 text-primary-foreground shadow-xl sm:p-8">
        <div className="pointer-events-none absolute right-0 top-0 -m-16 size-72 rounded-full bg-primary-foreground/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider backdrop-blur-md">
              <GraduationCap className="size-3.5 text-primary-foreground/80" />
              Teacher workspace{overview.data?.term ? ` • ${overview.data.term.name}` : ""}
            </div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
              {overview.data?.teacher?.name ? `Welcome, ${overview.data.teacher.name}` : "Teacher Instruction Hub"}
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-primary-foreground/85">
              Enter marks for the subjects you teach{ownClasses.length ? ", and take the register for the class you look after" : ""}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {ownClasses.length > 0 && (
              <button
                type="button"
                onClick={() => openRegister(ownClasses[0]!.id)}
                className="inline-flex items-center gap-2 rounded-xl bg-background px-4 py-2.5 text-xs font-bold text-foreground shadow-md transition hover:bg-muted"
              >
                <ClipboardCheck className="size-4 text-primary" />
                Take register
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveTab("gradebook")}
              className="inline-flex items-center gap-2 rounded-xl border border-primary-foreground/30 bg-primary-foreground/10 px-4 py-2.5 text-xs font-bold text-primary-foreground backdrop-blur-md transition hover:bg-primary-foreground/20"
            >
              <FileSpreadsheet className="size-4" />
              Enter marks
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <PortalStatCard label="My classes" value={classes.length} subValue="Classes" icon={BookOpen} variant="indigo" onClick={() => setActiveTab("classes")} />
        <PortalStatCard label="Pupils" value={pupils} subValue="This term" icon={Users} variant="blue" />
        <PortalStatCard label="Subjects I teach" value={subjectCount} subValue="Subjects" icon={FileSpreadsheet} variant="amber" onClick={() => setActiveTab("gradebook")} />
        <PortalStatCard label="Class teacher of" value={ownClasses.length} subValue={ownClasses.map((klass) => klass.name).join(", ") || "No class"} icon={UserCheck} variant="emerald" onClick={() => ownClasses.length && setActiveTab("classes")} />
      </div>

      <div role="tablist" aria-label="Teacher workspace" className="flex items-center gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-1.5 shadow-xs">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition",
                active ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <tab.icon className="size-4" />
              {tab.label}
              {tab.badge !== undefined && (
                <span className={cn("rounded-full px-1.5 text-[10px]", active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground")}>{tab.badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === "overview" && <Overview onMarks={openMarks} onRegister={openRegister} />}
      {activeTab === "classes" && <TeacherClassesView onEnterMarks={openMarks} />}
      {activeTab === "gradebook" && <AssessmentEntryWorkspace mode="teacher" initial={marksTarget} />}
      {activeTab === "attendance" &&
        (overview.isPending ? (
          <p className="text-xs text-slate-500">Loading your classes…</p>
        ) : ownClasses.length === 0 || !registerClass ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">The register is marked by the class teacher</h2>
            <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
              You are not the class teacher of any class this year. If that is wrong, ask an administrator to assign you in Classes.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {ownClasses.length > 1 && (
              <label className="grid w-fit gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Class
                <select
                  value={registerClass.id}
                  onChange={(event) => setRegisterClassId(event.target.value)}
                  className="h-9 min-w-44 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium normal-case tracking-normal text-slate-700 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  {ownClasses.map((klass) => <option key={klass.id} value={klass.id}>{klass.name}</option>)}
                </select>
              </label>
            )}
            <ClassRegister key={registerClass.id} classId={registerClass.id} className={registerClass.name} canMark />
          </div>
        ))}
      {activeTab === "timetable" && <TimetableWorkspace />}
      {activeTab === "announcements" && <AdminAnnouncementsWorkspace mode="teacher" />}
    </div>
  );
}

function Overview({ onMarks, onRegister }: { onMarks: (classId: string, subjectId: string) => void; onRegister: (classId: string) => void }) {
  const overview = useTeachingOverview();
  if (overview.isPending) return <p className="text-xs text-slate-500">Loading your classes…</p>;
  if (overview.error) return <p role="alert" className="text-xs text-rose-700">Could not load your classes: {overview.error.message}</p>;
  const classes = overview.data.classes;
  if (classes.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Nothing assigned yet</h2>
        <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
          Once an administrator assigns you a subject in a class, or makes you a class teacher, your work shows up here.
        </p>
      </div>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {classes.map((klass) => (
        <article key={klass.id} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            {klass.name}
            {klass.isClassTeacher && <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white">Class teacher</span>}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">{klass.studentCount} pupil{klass.studentCount === 1 ? "" : "s"}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {klass.isClassTeacher && (
              <button type="button" onClick={() => onRegister(klass.id)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">
                <ClipboardCheck className="size-3.5" /> Take register
              </button>
            )}
            {klass.subjects.map((subject) => (
              <button key={subject.id} type="button" onClick={() => onMarks(klass.id, subject.id)} aria-label={`Enter ${subject.name} marks for ${klass.name}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                <FileSpreadsheet className="size-3.5 text-indigo-600" /> {subject.name} marks
              </button>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
