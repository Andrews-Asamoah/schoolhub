import { useQuery } from "@tanstack/react-query";
import { BookOpen, Clock, MapPin, Search, User } from "lucide-react";
import { useState } from "react";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { apiFetch } from "@/lib/api";

interface EnrolledSubject {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  periodsPerWeek: number;
  teacher?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  room?: string | null;
}

interface StudentSubjectsResponse {
  class: { id: string; name: string; level: string } | null;
  subjects: EnrolledSubject[];
}

export function StudentSubjectsView() {
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["students", "me", "subjects"],
    queryFn: () => apiFetch<StudentSubjectsResponse>("/students/me/subjects"),
    retry: false,
  });

  const subjects = query.data?.subjects ?? [];
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filtered = subjects.filter((subject) => {
    const teacherName = subject.teacher
      ? `${subject.teacher.firstName} ${subject.teacher.lastName}`
      : "";
    return [subject.name, subject.code, teacherName]
      .some((value) => value.toLocaleLowerCase().includes(normalizedSearch));
  });
  const totalPeriods = subjects.reduce((total, subject) => total + Math.max(0, subject.periodsPerWeek || 0), 0);

  if (query.isPending) {
    return (
      <section role="status" className="flex min-h-48 items-center justify-center gap-2 rounded-2xl border border-border bg-card text-sm text-muted-foreground">
        <BookOpen className="size-4 animate-pulse text-primary" />
        Loading your enrolled subjects…
      </section>
    );
  }

  if (query.isError) {
    return <ErrorState message={`Your subjects could not be loaded: ${query.error.message}`} onRetry={() => void query.refetch()} />;
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><BookOpen className="size-5" /></span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold tracking-tight text-foreground">Enrolled subjects</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {query.data?.class
                ? `Subjects registered to ${query.data.class.name} in the current academic term.`
                : "Your current class enrollment and assigned subjects will appear here when they are available."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="rounded-xl border border-border bg-background px-3 py-2 text-xs">
            <span className="text-muted-foreground">Subjects </span>
            <span className="font-bold tabular-nums text-foreground">{subjects.length}</span>
          </div>
          <div className="rounded-xl border border-border bg-background px-3 py-2 text-xs">
            <span className="text-muted-foreground">Weekly periods </span>
            <span className="font-bold tabular-nums text-primary">{totalPeriods}</span>
          </div>
        </div>
      </section>

      {subjects.length > 0 && (
        <label className="relative block w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            type="search"
            placeholder="Search subjects, codes or teachers…"
            aria-label="Search enrolled subjects"
            className="h-10 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={search ? "No matching subjects" : query.data?.class ? "No subjects assigned yet" : "No current class enrollment"}
          description={search
            ? "Try a different subject name, course code or teacher."
            : query.data?.class
              ? "Subjects assigned to your current class will appear here once your school has set them up."
              : "Your school has not returned a class enrollment for the current academic term. Contact the school office if you think this is incorrect."}
          className="min-h-56"
        />
      ) : (
        <section aria-label="Enrolled subjects" className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((subject) => {
            const teacherName = subject.teacher
              ? `${subject.teacher.firstName} ${subject.teacher.lastName}`.trim()
              : null;
            return (
              <article key={subject.id} className="flex min-w-0 flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/30 sm:p-5">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="max-w-full truncate rounded-lg bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary">{subject.code}</span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-muted-foreground">
                      <Clock className="size-3.5" /> {subject.periodsPerWeek} period{subject.periodsPerWeek === 1 ? "" : "s"}/week
                    </span>
                  </div>
                  <h3 className="mt-3 break-words text-sm font-bold text-foreground">{subject.name}</h3>
                  {subject.description && <p className="mt-1.5 line-clamp-3 text-xs leading-5 text-muted-foreground">{subject.description}</p>}
                </div>
                <div className="mt-4 space-y-2 border-t border-border pt-3 text-xs">
                  <div className="flex min-w-0 items-start gap-2 text-muted-foreground">
                    <User className="mt-0.5 size-3.5 shrink-0" />
                    <span className="min-w-0 break-words">{teacherName ?? "No subject teacher recorded"}</span>
                  </div>
                  <div className="flex min-w-0 items-start gap-2 text-muted-foreground">
                    <MapPin className="mt-0.5 size-3.5 shrink-0" />
                    <span className="min-w-0 break-words">{subject.room?.trim() || "No classroom recorded"}</span>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
