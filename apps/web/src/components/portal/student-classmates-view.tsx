import { useQuery } from "@tanstack/react-query";
import { GraduationCap, Search, Users, UsersRound, House, RefreshCw, UserRound } from "lucide-react";
import { useState } from "react";
import { apiFetch } from "@/lib/api";

interface ClassmateItem {
  id: string;
  isSelf?: boolean;
  studentId?: string | null;
  admissionNumber?: string | null;
  name: string;
  firstName?: string;
  lastName?: string;
  house?: string | null;
  houseColor?: string | null;
  gender?: string | null;
}

interface ClassmatesResponse {
  class: {
    id: string;
    name: string;
    level: string;
  } | null;
  classmates: ClassmateItem[];
}

export function StudentClassmatesView() {
  const [search, setSearch] = useState("");

  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["students", "me", "classmates"],
    queryFn: () => apiFetch<ClassmatesResponse>("/students/me/classmates"),
    retry: false,
  });

  const classmates = data?.classmates ?? [];
  const className = data?.class?.name;

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filtered = classmates.filter((classmate) => {
    const searchable = [
      classmate.name,
      classmate.house,
      classmate.admissionNumber,
      classmate.studentId,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();
    return searchable.includes(normalizedSearch);
  });

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <div className="pointer-events-none absolute -right-10 -top-12 size-48 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <GraduationCap className="size-6" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Student community</p>
              <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                {className ?? "My classmates"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Your classmates enrolled in the current academic term.
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 self-start rounded-xl border border-border bg-background px-3 py-2 sm:self-center">
            <Users className="size-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">
              {isLoading ? "—" : classmates.length}
            </span>
            <span className="text-sm text-muted-foreground">
              {classmates.length === 1 ? "student" : "students"}
            </span>
          </div>
        </div>
      </section>

      {isError ? (
        <section className="flex flex-col items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold text-foreground">We couldn’t load your classmates</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Check your connection and try again. Only school records returned by the server are shown.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
            Try again
          </button>
        </section>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                placeholder="Search by name, house or admission number"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search classmates"
                className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            {!isLoading && (
              <p className="text-sm text-muted-foreground">
                Showing {filtered.length} of {classmates.length} {classmates.length === 1 ? "student" : "students"}
              </p>
            )}
          </div>

          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
                  <div className="size-11 animate-pulse rounded-xl bg-muted" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : !data?.class ? (
            <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-12 text-center">
              <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <UsersRound className="size-6" />
              </span>
              <h3 className="mt-4 font-semibold text-foreground">No current class found</h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Your class and classmates will appear here once the school records your current-term enrollment.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-12 text-center">
              <Search className="mx-auto size-8 text-muted-foreground" />
              <h3 className="mt-3 font-semibold text-foreground">
                {classmates.length === 0 ? "No classmates listed yet" : "No matching classmates"}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {classmates.length === 0
                  ? "There are no active or completed enrollments for your class in the current term."
                  : "Try another name, house or admission number."}
              </p>
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="mt-3 text-sm font-semibold text-primary hover:underline"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((classmate) => {
                const initials = classmate.name
                  .trim()
                  .split(/\s+/)
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase();

                return (
                  <article
                    key={classmate.id}
                    className={`flex min-w-0 items-center gap-3 rounded-2xl border bg-card p-4 transition hover:border-primary/40 hover:shadow-sm ${
                      classmate.isSelf ? "border-primary/40 bg-primary/5" : "border-border"
                    }`}
                  >
                    <span
                      className={`flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
                        classmate.isSelf
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      }`}
                      aria-hidden="true"
                    >
                      {initials || <UserRound className="size-5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-foreground">{classmate.name}</h3>
                        {classmate.isSelf && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">You</span>
                        )}
                      </div>
                      {(classmate.admissionNumber || classmate.studentId) && (
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {classmate.admissionNumber || classmate.studentId}
                        </p>
                      )}
                      {classmate.house && classmate.house !== "No House" && (
                        <p className="mt-2 inline-flex max-w-full items-center gap-1 rounded-lg bg-muted px-2 py-1 text-xs text-muted-foreground">
                          <House className="size-3 shrink-0" />
                          <span className="truncate">{classmate.house}</span>
                        </p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
