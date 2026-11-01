import { Link } from "@tanstack/react-router";
import { Boxes, ClipboardList, Megaphone, UserRoundPlus, UsersRound, type LucideIcon } from "lucide-react";

const tasks: { page: string; label: string; detail: string; icon: LucideIcon }[] = [
  { page: "admissions", label: "Admissions", detail: "Review and progress applications", icon: UserRoundPlus },
  { page: "enrollments", label: "Enrollments", detail: "Place admitted pupils into classes", icon: ClipboardList },
  { page: "students", label: "Students", detail: "Look up pupil records", icon: UsersRound },
  { page: "inventory", label: "Inventory", detail: "Stock and supplies", icon: Boxes },
  { page: "announcements", label: "Announcements", detail: "Read notices from the school", icon: Megaphone },
];

/**
 * A staff member's home: the tasks their access is for. It deliberately loads no
 * school-wide analytics, so it exposes no pupil names, activity feed or census.
 */
export function StaffOverview({ today, greetingName }: { today: string; greetingName: string }) {
  return (
    <main className="mx-auto max-w-[1440px] space-y-6 px-4 py-7 sm:px-6 lg:px-9 lg:py-9">
      <header>
        <p className="mb-2 text-xs font-medium text-muted-foreground">{today}</p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[30px]">Good day, {greetingName}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Pick up where you left off.</p>
      </header>
      <section aria-label="Your tasks" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tasks.map(({ page, label, detail, icon: Icon }) => (
          <Link key={page} to="/$page" params={{ page }} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:bg-muted/50">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-5" /></span>
            <span><span className="block text-sm font-semibold text-foreground">{label}</span><span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span></span>
          </Link>
        ))}
      </section>
    </main>
  );
}
