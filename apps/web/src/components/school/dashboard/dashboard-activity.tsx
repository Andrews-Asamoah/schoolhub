import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  ReceiptText,
  UserRoundPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardActivity } from "@/components/school/dashboard/dashboard-data";

const money = new Intl.NumberFormat("en-GH", {
  style: "currency",
  currency: "GHS",
  maximumFractionDigits: 2,
});

const timestamp = (value: string) =>
  new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const date = (value: string) =>
  new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium",
  }).format(new Date(value));

interface AcademicTerm {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

interface AcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  terms: AcademicTerm[];
}

export function SchoolYearCard({
  academicYear,
}: {
  academicYear?: AcademicYear;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <CalendarDays className="size-5" />
        </span>

        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">
            Academic year
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Current school year and term dates
          </p>
        </div>

        {academicYear?.isCurrent && (
          <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
            Current
          </span>
        )}
      </div>

      {!academicYear ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center">
          <Clock3 className="mx-auto size-5 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium text-foreground">
            No academic year selected
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create an academic year and its terms to see the schedule here.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-xl bg-muted/40 p-4">
            <p className="text-base font-semibold text-foreground">
              {academicYear.name}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {date(academicYear.startDate)} – {date(academicYear.endDate)}
            </p>
          </div>

          <div className="mt-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold text-foreground">Terms</h3>
              <span className="text-[10px] text-muted-foreground">
                {academicYear.terms.length} total
              </span>
            </div>

            {academicYear.terms.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
                No terms have been added to this academic year yet.
              </p>
            ) : (
              <div className="space-y-2">
                {academicYear.terms.map((term) => (
                  <div
                    key={term.id}
                    className="flex items-start gap-3 rounded-xl border border-border p-3"
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg",
                        term.isCurrent
                          ? "bg-emerald-500/10 text-emerald-600"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {term.isCurrent ? (
                        <CheckCircle2 className="size-4" />
                      ) : (
                        <CalendarDays className="size-4" />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-semibold text-foreground">
                          {term.name}
                        </p>
                        {term.isCurrent && (
                          <span className="text-[10px] font-medium text-emerald-600">
                            Current term
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {date(term.startDate)} – {date(term.endDate)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export function RecentActivityCard({
  activities,
  isLoading,
  isError,
  canViewFinance,
}: {
  activities: DashboardActivity[];
  isLoading: boolean;
  isError: boolean;
  canViewFinance: boolean;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Recent activity
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Latest changes recorded in this school
          </p>
        </div>
        <span className="rounded-full border border-border px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
          Live records
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-14 animate-pulse rounded-lg bg-muted/60"
            />
          ))}
        </div>
      ) : isError ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          Recent activity could not be loaded.
        </p>
      ) : activities.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-7 text-center">
          <p className="text-sm font-medium text-foreground">
            No recent activity yet
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            New student records and other recorded updates will appear here.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/70">
          {activities.map((activity) => {
            const Icon =
              activity.type === "student"
                ? UserRoundPlus
                : activity.type === "payment"
                  ? CreditCard
                  : ReceiptText;

            const iconClass =
              activity.type === "student"
                ? "bg-blue-500/10 text-blue-600"
                : activity.type === "payment"
                  ? "bg-emerald-500/10 text-emerald-600"
                  : "bg-orange-500/10 text-orange-600";

            return (
              <div
                key={activity.id}
                className="flex min-w-0 items-center gap-3 py-3.5 first:pt-0 last:pb-0"
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-xl",
                    iconClass,
                  )}
                >
                  <Icon className="size-4" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-foreground">
                    {activity.title}
                  </p>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    {activity.detail}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {timestamp(activity.createdAt)}
                  </p>
                </div>

                {canViewFinance && activity.amount !== null && (
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
                    {money.format(activity.amount)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!canViewFinance && (
        <p className="mt-4 border-t border-border/70 pt-3 text-[10px] text-muted-foreground">
          Financial activity is restricted to authorised school roles.
        </p>
      )}
    </section>
  );
}