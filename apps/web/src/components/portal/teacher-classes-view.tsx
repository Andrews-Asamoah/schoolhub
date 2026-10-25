import { ClipboardCheck, FileSpreadsheet, GraduationCap, Users } from "lucide-react";
import { useState } from "react";
import { ClassRegister } from "@/components/school/class-register";
import { useTeachingOverview } from "@/lib/teaching";

/**
 * The teacher's own classes. A class teacher also gets "Manage class", which
 * opens that class's register; every subject taught has a marks shortcut.
 */
export function TeacherClassesView({
  onEnterMarks,
}: {
  onEnterMarks: (classId: string, subjectId: string) => void;
}) {
  const overview = useTeachingOverview();
  const [managing, setManaging] = useState<string | null>(null);

  if (overview.isPending) return <p className="text-xs text-muted-foreground">Loading your classes…</p>;
  if (overview.error) return <p role="alert" className="text-xs text-destructive">Could not load your classes: {overview.error.message}</p>;
  const classes = overview.data.classes;
  if (classes.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-input p-8 text-center">
        <h2 className="text-sm font-semibold text-foreground">You have no classes yet</h2>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          Classes appear here once an administrator makes you the class teacher or assigns you a subject in a class.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {classes.map((klass) => {
        const open = managing === klass.id;
        return (
          <div key={klass.id} className="space-y-3">
            <article className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <GraduationCap className="size-5" />
                  </span>
                  <div>
                    <h3 className="flex flex-wrap items-center gap-2 text-sm font-bold text-foreground">
                      {klass.name}
                      {klass.isClassTeacher && (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">Class teacher</span>
                      )}
                    </h3>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Users className="size-3.5" /> {klass.studentCount} pupil{klass.studentCount === 1 ? "" : "s"} · {klass.level}
                    </p>
                  </div>
                </div>
                {klass.isClassTeacher && (
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setManaging(open ? null : klass.id)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    <ClipboardCheck className="size-4" />
                    {open ? "Close register" : `Manage ${klass.name}`}
                  </button>
                )}
              </div>

              {klass.subjects.length > 0 && (
                <div className="mt-4 border-t border-border/60 pt-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">I teach here</p>
                  <ul className="flex flex-wrap gap-2">
                    {klass.subjects.map((subject) => (
                      <li key={subject.id}>
                        <button
                          type="button"
                          onClick={() => onEnterMarks(klass.id, subject.id)}
                          aria-label={`Enter ${subject.name} marks for ${klass.name}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground/80 hover:border-primary/30 hover:bg-primary/10"
                        >
                          <FileSpreadsheet className="size-3.5 text-primary" />
                          {subject.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
            {open && <ClassRegister classId={klass.id} className={klass.name} canMark />}
          </div>
        );
      })}
    </div>
  );
}
