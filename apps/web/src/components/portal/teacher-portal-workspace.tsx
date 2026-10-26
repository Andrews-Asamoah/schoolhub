import { BookOpen, Calendar, ClipboardCheck, FileSpreadsheet, GraduationCap, LayoutDashboard, Megaphone, UserCheck, Users } from "lucide-react";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
              id={`teacher-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`teacher-panel-${tab.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => {
                const currentIndex = tabs.findIndex((item) => item.id === tab.id);
                let nextIndex: number | null = null;
                if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
                if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
                if (event.key === "Home") nextIndex = 0;
                if (event.key === "End") nextIndex = tabs.length - 1;
                if (nextIndex !== null) {
                  event.preventDefault();
                  const nextTab = tabs[nextIndex];
                  if (nextTab) {
                    setActiveTab(nextTab.id);
                    document.getElementById(`teacher-tab-${nextTab.id}`)?.focus();
                  }
                }
              }}
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

      <div role="tabpanel" id={`teacher-panel-${activeTab}`} aria-labelledby={`teacher-tab-${activeTab}`} tabIndex={0} className="min-w-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {activeTab === "overview" && <Overview onMarks={openMarks} onRegister={openRegister} />}
      {activeTab === "classes" && <TeacherClassesView onEnterMarks={openMarks} />}
      {activeTab === "gradebook" && <AssessmentEntryWorkspace mode="teacher" initial={marksTarget} />}
      {activeTab === "attendance" &&
        (overview.isPending ? (
          <p className="text-xs text-muted-foreground">Loading your classes…</p>
        ) : ownClasses.length === 0 || !registerClass ? (
          <div className="rounded-2xl border border-dashed border-input p-8 text-center">
            <h2 className="text-sm font-semibold text-foreground">The register is marked by the class teacher</h2>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
              You are not the class teacher of any class this year. If that is wrong, ask an administrator to assign you in Classes.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {ownClasses.length > 1 && (
              <label className="grid w-fit gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                Class
                <Select value={registerClass.id} onValueChange={setRegisterClassId}>
                  <SelectTrigger aria-label="Choose class register" className="h-9 min-w-44 normal-case tracking-normal">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ownClasses.map((klass) => <SelectItem key={klass.id} value={klass.id}>{klass.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
            )}
            <ClassRegister key={registerClass.id} classId={registerClass.id} className={registerClass.name} canMark />
          </div>
        ))}
      {activeTab === "timetable" && <TimetableWorkspace />}
      {activeTab === "announcements" && <AdminAnnouncementsWorkspace mode="teacher" />}
      </div>
    </div>
  );
}

function Overview({ onMarks, onRegister }: { onMarks: (classId: string, subjectId: string) => void; onRegister: (classId: string) => void }) {
  const overview = useTeachingOverview();
  if (overview.isPending) return <p className="text-xs text-muted-foreground">Loading your classes…</p>;
  if (overview.error) return <p role="alert" className="text-xs text-destructive">Could not load your classes: {overview.error.message}</p>;
  const classes = overview.data.classes;
  if (classes.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-input p-8 text-center">
        <h2 className="text-sm font-semibold text-foreground">Nothing assigned yet</h2>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          Once an administrator assigns you a subject in a class, or makes you a class teacher, your work shows up here.
        </p>
      </div>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {classes.map((klass) => (
        <article key={klass.id} className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs">
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-bold text-foreground">
            {klass.name}
            {klass.isClassTeacher && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">Class teacher</span>}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{klass.studentCount} pupil{klass.studentCount === 1 ? "" : "s"}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {klass.isClassTeacher && (
              <button type="button" onClick={() => onRegister(klass.id)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
                <ClipboardCheck className="size-3.5" /> Take register
              </button>
            )}
            {klass.subjects.map((subject) => (
              <button key={subject.id} type="button" onClick={() => onMarks(klass.id, subject.id)} aria-label={`Enter ${subject.name} marks for ${klass.name}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-muted/50">
                <FileSpreadsheet className="size-3.5 text-primary" /> {subject.name} marks
              </button>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
