import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, CalendarCheck, ClipboardList, FileText, GraduationCap, Megaphone, UserRound } from "lucide-react";
import { MyProfilePanel } from "@/components/school/student-profile-panel";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth-client";

interface StudentProfileResponse {
  id: string;
  studentId: string;
  admissionNumber: string;
  profile: { firstName: string; lastName: string };
  class?: { id: string; name: string; level: string } | null;
  house?: { id: string; name: string } | null;
}

const quickLinks = [
  { title: "My subjects", description: "View your registered subjects", page: "subjects", icon: BookOpen },
  { title: "Attendance", description: "Review your attendance record", page: "attendance", icon: CalendarCheck },
  { title: "Assignments", description: "Check work assigned by teachers", page: "assignments", icon: ClipboardList },
  { title: "Academic reports", description: "View reports published by school", page: "assessments", icon: FileText },
  { title: "School notices", description: "Read official school announcements", page: "announcements", icon: Megaphone },
  { title: "Classmates", description: "View classmates in your class", page: "classmates", icon: UserRound },
] as const;

export function StudentOverview() {
  const { data: session } = useSession();
  const { data: profile, isPending, isError } = useQuery({
    queryKey: ["students", "me", "profile"],
    queryFn: () => apiFetch<StudentProfileResponse>("/students/me"),
    retry: false,
  });
  const firstName = profile?.profile?.firstName || session?.user?.name?.trim().split(/\\s+/)[0] || "Student";

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="pointer-events-none absolute -right-12 -top-16 size-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
              <GraduationCap className="size-4" /> Student portal
            </p>
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Welcome{firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Your school information, learning resources, attendance and published academic records in one place.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {profile?.class?.name && <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">{profile.class.name}</span>}
              {profile?.admissionNumber && <span className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground">Admission no. {profile.admissionNumber}</span>}
              {profile?.house?.name && <span className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground">{profile.house.name}</span>}
              {isPending && <span className="text-xs text-muted-foreground">Loading your student profile…</span>}
              {isError && <span className="text-xs text-muted-foreground">Some profile details are currently unavailable.</span>}
            </div>
          </div>
          <Link to="/$page" params={{ page: "timetable" }} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90">
            View timetable <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <MyProfilePanel />

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Your learning workspace</h2>
          <p className="mt-1 text-sm text-muted-foreground">Open a section to view information recorded by your school. Items appear here when data is available.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {quickLinks.map(({ title, description, page, icon: Icon }) => (
            <Link key={page} to="/$page" params={{ page }} className="group flex min-h-28 items-start gap-4 rounded-2xl border border-border bg-card p-4 transition hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-foreground">{title}</span>
                <span className="mt-1 block text-sm leading-5 text-muted-foreground">{description}</span>
              </span>
              <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
