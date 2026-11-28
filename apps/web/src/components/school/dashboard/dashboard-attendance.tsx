import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import { useSchoolOrganization } from "@/components/school/school-organization";
import { useSchoolRole } from "@/components/school/school-role-switcher";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth-client";

type AttendanceSummary = { date: string } & (
  | { state: "outside-term" | "non-instructional" }
  | {
      state: "instructional";
      counts: Record<"PRESENT" | "LATE" | "ABSENT" | "EXCUSED" | "SICK" | "PERMISSION", number>;
      marked: number;
      expected: number;
    }
);

const formatCount = new Intl.NumberFormat("en-GH");
const formatPercent = new Intl.NumberFormat("en-GH", { style: "percent", maximumFractionDigits: 1 });
const formatDate = new Intl.DateTimeFormat("en-GH", { dateStyle: "long", timeZone: "UTC" });

export function DashboardAttendance() {
  const { activeOrganization } = useSchoolOrganization();
  const { activeRole } = useSchoolRole();
  const { data: session } = useSession();
  const { data, isPending, isError, isFetching, refetch } = useQuery({
    queryKey: ["dashboard", "attendance", "today", activeOrganization?.id, session?.user.id, activeRole],
    queryFn: () => apiFetch<AttendanceSummary>("/dashboard/attendance/today"),
    refetchInterval: 60_000,
    retry: false,
  });

  return (
    <section aria-labelledby="dashboard-attendance-title" className="mt-5 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ClipboardCheck className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="dashboard-attendance-title" className="text-lg font-semibold tracking-tight text-foreground">Today’s student attendance</h2>
            {data && <time dateTime={data.date} className="text-sm text-muted-foreground">{formatDate.format(new Date(data.date))}</time>}
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/$page" params={{ page: "attendance" }}>
            View class registers <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>

      <div className="mt-4" aria-busy={isPending}>
        {isPending ? (
          <div role="status" aria-label="Loading today’s attendance">
            <Skeleton className="h-28 w-full" />
          </div>
        ) : isError ? (
          <div role="alert" className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-destructive">Today’s attendance could not be loaded.</p>
            <Button variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>Retry</Button>
          </div>
        ) : data?.state === "instructional" && data.expected > 0 ? (
          <AttendanceBreakdown counts={data.counts} marked={data.marked} expected={data.expected} />
        ) : (
          <p className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">
            {data?.state === "outside-term"
              ? "No current academic term covers today."
              : data?.state === "non-instructional"
                ? "No register is due today. It’s a non-instructional day."
                : "No students are scheduled to be marked today."}
          </p>
        )}
      </div>
    </section>
  );
}

function AttendanceBreakdown({ counts, marked, expected }: Pick<Extract<AttendanceSummary, { state: "instructional" }>, "counts" | "marked" | "expected">) {
  const unmarked = expected - marked;
  const tiles = [
    { label: "Present", count: counts.PRESENT, tone: "bg-success/10 text-success" },
    { label: "Late", count: counts.LATE, tone: "bg-warning/10 text-warning" },
    { label: "Absent", count: counts.ABSENT, tone: "bg-destructive/10 text-destructive" },
    { label: "Other absences", count: counts.EXCUSED + counts.SICK + counts.PERMISSION, tone: "bg-info/10 text-info" },
    { label: "Unmarked", count: unmarked, tone: "bg-muted text-foreground" },
  ];

  return (
    <>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {tiles.map(({ label, count, tone }) => (
          <div key={label} className="rounded-xl border border-border p-3">
            <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
            <dd className={`mt-2 inline-flex rounded-lg px-2.5 py-1 text-xl font-semibold tabular-nums ${tone}`}>{formatCount.format(count)}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 grid gap-1 border-t border-border pt-3 text-sm text-muted-foreground sm:grid-cols-2">
        <p><strong className="font-semibold text-foreground">{formatCount.format(marked)} of {formatCount.format(expected)}</strong> students marked</p>
        <p className="sm:text-right">
          {marked > 0 ? (
            <><strong className="font-semibold text-foreground">{formatPercent.format((counts.PRESENT + counts.LATE) / marked)}</strong> {unmarked > 0 ? "attendance among marked students" : "attendance"} (present or late)</>
          ) : "Waiting for class registers"}
        </p>
      </div>
    </>
  );
}
