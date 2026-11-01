import { Link } from "@tanstack/react-router";
import { BookOpenCheck, CalendarDays, ClipboardCheck, FileSpreadsheet, Megaphone, MessageSquare, UsersRound, type LucideIcon } from "lucide-react";
import { useTeachingOverview } from "@/lib/teaching";

const quickLinks: { page: string; label: string; detail: string; icon: LucideIcon }[] = [
  { page: "timetable", label: "Timetable", detail: "Your lessons this week", icon: CalendarDays },
  { page: "assignments", label: "Assignments", detail: "Set work and review submissions", icon: BookOpenCheck },
  { page: "announcements", label: "Announcements", detail: "Message your classes", icon: Megaphone },
  { page: "messages", label: "Messages", detail: "Conversations with the school", icon: MessageSquare },
];

function Stat({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: LucideIcon }) {
  return (
    <article className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-3 text-2xl font-bold tracking-tight text-foreground">{value}</p>
        </div>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-[18px]" /></span>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">{detail}</p>
    </article>
  );
}

/**
 * A teacher's home: only their own classes, pupils and marking work. It never
 * calls the school-wide analytics endpoint, so no other pupil's data is loaded.
 */
export function TeacherOverview({ today, greetingName }: { today: string; greetingName: string }) {
  const overview = useTeachingOverview();
  const classes = overview.data?.classes ?? [];
  const pupils = classes.reduce((total, klass) => total + klass.studentCount, 0);
  const classTeacherOf = classes.filter((klass) => klass.isClassTeacher).length;

  return (
    <main className="mx-auto max-w-[1440px] space-y-6 px-4 py-7 sm:px-6 lg:px-9 lg:py-9">
      <header>
        <p className="mb-2 text-xs font-medium text-muted-foreground">{today}{overview.data?.term ? ` · ${overview.data.term.name}` : ""}</p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[30px]">Good day, {greetingName}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Your classes, registers and marks for this term.</p>
      </header>

      {overview.isPending ? (
        <div className="grid gap-3 sm:grid-cols-3" aria-label="Loading your classes">{[1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted/60" />)}</div>
      ) : overview.isError ? (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Could not load your classes: {overview.error.message}</p>
      ) : (
        <>
          <section aria-label="Your teaching summary" className="grid gap-3 sm:grid-cols-3">
            <Stat label="My classes" value={String(classes.length)} detail="Classes you teach or manage" icon={UsersRound} />
            <Stat label="My pupils" value={String(pupils)} detail="Active enrolments this term" icon={UsersRound} />
            <Stat label="Class teacher of" value={String(classTeacherOf)} detail="Registers you are responsible for" icon={ClipboardCheck} />
          </section>

          {classes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-input p-8 text-center">
              <h2 className="text-sm font-semibold text-foreground">Nothing assigned yet</h2>
              <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">Once an administrator assigns you a subject in a class, or makes you a class teacher, your work shows up here.</p>
            </div>
          ) : (
            <section aria-label="My classes" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {classes.map((klass) => (
                <article key={klass.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                  <h2 className="flex flex-wrap items-center gap-2 text-sm font-bold text-foreground">
                    {klass.name}
                    {klass.isClassTeacher && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">Class teacher</span>}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">{klass.studentCount} pupil{klass.studentCount === 1 ? "" : "s"}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {klass.isClassTeacher && (
                      <Link to="/$page" params={{ page: "attendance" }} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
                        <ClipboardCheck className="size-3.5" /> Take register
                      </Link>
                    )}
                    {klass.subjects.map((subject) => (
                      <Link key={subject.id} to="/$page" params={{ page: "assessments" }} aria-label={`Enter ${subject.name} marks for ${klass.name}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent">
                        <FileSpreadsheet className="size-3.5 text-primary" /> {subject.name} marks
                      </Link>
                    ))}
                  </div>
                </article>
              ))}
            </section>
          )}
        </>
      )}

      <section aria-label="Quick links" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {quickLinks.map(({ page, label, detail, icon: Icon }) => (
          <Link key={page} to="/$page" params={{ page }} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition hover:bg-muted/50">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" /></span>
            <span><span className="block text-sm font-semibold text-foreground">{label}</span><span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span></span>
          </Link>
        ))}
      </section>
    </main>
  );
}
