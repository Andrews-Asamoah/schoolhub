import { useMemo, useState, type ReactNode } from "react";
import { Activity, UsersRound, WalletCards, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AttendancePeriod = "week" | "month" | "term";

export interface ChartDatum {
  label: string;
  value: number;
}

export interface BreakdownDatum {\n  label: string;\n  count: number;\n  color: string;\n}\n\nexport interface InfographicCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
  aside?: ReactNode;
}

const attendanceSeries: Record<AttendancePeriod, ChartDatum[]> = {
  week: [
    { label: "Mon", value: 88 },
    { label: "Tue", value: 94 },
    { label: "Wed", value: 86 },
    { label: "Thu", value: 93 },
    { label: "Fri", value: 91 },
  ],
  month: [
    { label: "Week 1", value: 87 },
    { label: "Week 2", value: 91 },
    { label: "Week 3", value: 89 },
    { label: "Week 4", value: 94 },
  ],
  term: [
    { label: "Sep", value: 88 },
    { label: "Oct", value: 92 },
    { label: "Nov", value: 90 },
    { label: "Dec", value: 95 },
  ],
};

const enrollmentMix: BreakdownDatum[] = [
  { label: "Kindergarten", count: 180, color: "bg-violet-500" },
  { label: "Primary", count: 710, color: "bg-sky-500" },
  { label: "Junior high", count: 394, color: "bg-primary" },
];

const collectedFees = 84_250;
const feeTarget = 120_000;
const feeProgress = Math.min(100, Math.round((collectedFees / feeTarget) * 1000) / 10);

export function InfographicCard({
  title,
  description,
  icon: Icon,
  children,
  className,
  aside,
}: InfographicCardProps) {
  return (
    <article
      className={cn(
        "min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6",
        className,
      )}
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {aside}
          <span className="flex size-9 items-center justify-center rounded-xl bg-muted text-foreground">
            <Icon className="size-4" aria-hidden="true" />
          </span>
        </div>
      </div>
      {children}
      <p className="mt-5 text-[10px] text-muted-foreground">
        Illustrative sample data · not live school records
      </p>
    </article>
  );
}

export function VerticalBarChart({
  data,
  maxValue = 100,
  suffix = "%",
  color = "bg-primary",
  label,
}: {
  data: ChartDatum[];
  maxValue?: number;
  suffix?: string;
  color?: string;
  label: string;
}) {
  return (
    <div
      role="img"
      aria-label={label + ": " + data.map((item) => `${item.label} ${item.value}${suffix}`).join(", ")}
      className="flex h-40 items-end gap-3 border-b border-border/70 pb-2 sm:gap-4"
    >
      {data.map((item) => {
        const height = Math.max(4, Math.min(100, (item.value / maxValue) * 100));
        return (
          <div
            key={item.label}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"
          >
            <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
              {item.value}{suffix}
            </span>
            <div className="flex h-[78%] w-full items-end justify-center">
              <div
                className={cn("w-full max-w-10 rounded-t-md transition-[height] duration-300", color)}
                style={{ height: `${height}%` }}
                aria-hidden="true"
              />
            </div>
            <span className="whitespace-nowrap text-[10px] text-muted-foreground">
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function DonutProgressChart({
  value,
  label,
  sublabel,
  amount,
  targetAmount,
  currencyPrefix = "GHS",
}: {
  value: number;
  label: string;
  sublabel: string;
  amount: number;
  targetAmount: number;
  currencyPrefix?: string;
}) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const boundedValue = Math.min(100, Math.max(0, value));
  const dashOffset = circumference * (1 - boundedValue / 100);

  return (
    <div className="flex items-center gap-5">
      <div
        role="img"
        aria-label={`${label}: ${boundedValue}%`}
        className="relative size-32 shrink-0 text-primary"
      >
        <svg viewBox="0 0 112 112" className="size-full -rotate-90" aria-hidden="true">
          <circle
            cx="56"
            cy="56"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.12"
            strokeWidth="10"
          />
          <circle
            cx="56"
            cy="56"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="transition-[stroke-dashoffset] duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-bold tracking-tight text-foreground">
            {boundedValue}%
          </span>
          <span className="text-[10px] text-muted-foreground">of target</span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{sublabel}</p>
        <p className="mt-1 text-xl font-bold tracking-tight text-foreground">
          {currencyPrefix} {amount.toLocaleString("en-GH")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          of {currencyPrefix} {targetAmount.toLocaleString("en-GH")} target
        </p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${boundedValue}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function HorizontalBreakdown({
  data,
}: {
  data: { label: string; count: number; color: string }[];
}) {
  const total = data.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="space-y-4">
      <div
        className="flex h-3 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={data.map((item) => `${item.label}: ${item.count} students`).join(", ")}
      >
        {data.map((item) => (
          <div
            key={item.label}
            className={cn("h-full transition-[width]", item.color)}
            style={{ width: `${(item.count / total) * 100}%` }}
            aria-hidden="true"
          />
        ))}
      </div>
      {data.map((item) => {
        const percentage = Math.round((item.count / total) * 1000) / 10;
        return (
          <div key={item.label} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="flex min-w-0 items-center gap-2 text-foreground">
                <span className={cn("size-2.5 shrink-0 rounded-sm", item.color)} aria-hidden="true" />
                <span>{item.label}</span>
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {item.count.toLocaleString("en-GH")} <span className="px-1">·</span> {percentage}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", item.color)}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        );
      })}
      <div className="border-t border-border/70 pt-3 text-xs text-muted-foreground">
        Sample total: <strong className="font-semibold text-foreground">{total.toLocaleString("en-GH")}</strong> students
      </div>
    </div>
  );
}

export function DashboardInfographics() {
  const [period, setPeriod] = useState<AttendancePeriod>("week");
  const attendanceData = attendanceSeries[period];
  const averageAttendance = useMemo(
    () => Math.round((attendanceData.reduce((sum, item) => sum + item.value, 0) / attendanceData.length) * 10) / 10,
    [attendanceData],
  );

  return (
    <section aria-label="School infographics" className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      <InfographicCard
        title="Attendance trend"
        description="Average attendance across the selected period"
        icon={Activity}
        aside={
          <Select
            value={period}
            onValueChange={(value) => setPeriod(value as AttendancePeriod)}
          >
            <SelectTrigger className="h-8 w-[104px] rounded-lg px-2 text-[11px]" aria-label="Attendance time period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">This week</SelectItem>
              <SelectItem value="month">This month</SelectItem>
              <SelectItem value="term">This term</SelectItem>
            </SelectContent>
          </Select>
        }
      >
        <div className="mb-4 flex items-baseline gap-2">
          <span className="text-3xl font-bold tracking-tight text-foreground">
            {averageAttendance}%
          </span>
          <span className="text-xs text-muted-foreground">average attendance</span>
        </div>
        <VerticalBarChart
          data={attendanceData}
          label="Attendance trend"
          maxValue={100}
        />
      </InfographicCard>

      <InfographicCard
        title="Student distribution"
        description="Sample enrolment mix by school level"
        icon={UsersRound}
      >
        <HorizontalBreakdown data={enrollmentMix} />
      </InfographicCard>

      <InfographicCard
        title="Fee collection progress"
        description="Collected fees compared with the term target"
        icon={WalletCards}
      >
        <DonutProgressChart
          value={feeProgress}
          label="Fees collected"
          sublabel="Collected this term"
        />
        <p className="mt-4 text-[11px] leading-5 text-muted-foreground">
          Remaining target:{" "}
          <strong className="font-semibold text-foreground">
            GHS {(feeTarget - collectedFees).toLocaleString("en-GH")}
          </strong>
        </p>
      </InfographicCard>
    </section>
  );
}
