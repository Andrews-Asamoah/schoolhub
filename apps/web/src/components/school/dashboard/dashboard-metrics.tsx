import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
const weeklyAttendance: { day: string; value: number }[] = [
  { day: "Mon", value: 88 },
  { day: "Tue", value: 94 },
  { day: "Wed", value: 91 },
  { day: "Thu", value: 97 },
  { day: "Fri", value: 94 },
];

interface MetricCardProps {
  label: string;
  value: string;
  change: string;
  trend: "up" | "down";
  detail: string;
  icon: LucideIcon;
  iconClass: string;
}

export function MetricCard({
  label,
  value,
  change,
  trend,
  detail,
  icon: Icon,
  iconClass,
}: MetricCardProps) {
  const TrendIcon = trend === "up" ? ArrowUpRight : ArrowDownRight;

  return (
    <article className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md sm:p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-3 text-[26px] font-bold tracking-tight text-foreground">
            {value}
          </p>
        </div>
        <span
          className={cn(
            "flex size-10 items-center justify-center rounded-xl",
            iconClass,
          )}
        >
          <Icon className="size-[18px]" />
        </span>
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        <span
          className={cn(
            "inline-flex items-center gap-0.5 text-[11px] font-semibold",
            trend === "up" ? "text-success" : "text-destructive",
          )}
        >
          <TrendIcon className="size-3.5" />
          {change}
        </span>
        <span className="text-[11px] text-muted-foreground/70">{detail}</span>
      </div>
    </article>
  );
}

export function AttendanceOverviewCard() {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5 lg:p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Attendance overview
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Student attendance throughout this week
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-2 rounded-lg border border-border px-2.5 text-[11px] font-medium text-muted-foreground hover:bg-muted/50"
        >
          This week <ChevronDown className="size-3.5" />
        </button>
      </div>
      <div className="mb-4 flex items-baseline gap-2">
        <span className="text-3xl font-bold tracking-tight text-foreground">
          92.8%
        </span>
        <span className="inline-flex items-center text-[11px] font-semibold text-success">
          <ArrowUpRight className="size-3.5" />
          3.2%
        </span>
        <span className="text-[11px] text-muted-foreground/70">vs. last week</span>
      </div>
      <div className="flex h-44 items-end gap-3 border-b border-border/60 pb-2 sm:gap-5">
        {weeklyAttendance.map(({ day, value }) => (
          <div
            key={day}
            className="flex h-full flex-1 flex-col items-center justify-end gap-2"
          >
            <div className="flex h-full w-full items-end justify-center">
              <div
                className={cn(
                  "w-full max-w-12 rounded-t-md transition-colors",
                  day === "Thu"
                    ? "bg-primary"
                    : "bg-primary/15 hover:bg-primary/20",
                )}
                style={{ height: `${value}%` }}
                aria-label={`${day}: ${value}%`}
                role="img"
              />
            </div>
            <span className="text-[10px] font-medium text-muted-foreground/70">
              {day}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between text-[10px] text-muted-foreground/70">
        <span>Mon, Oct 12</span>
        <span>Fri, Oct 16</span>
      </div>
    </div>
  );
}
