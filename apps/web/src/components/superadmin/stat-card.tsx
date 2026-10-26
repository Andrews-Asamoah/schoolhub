import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "primary" | "success" | "warning" | "danger" | "info";

interface StatCardProps {
  label: string;
  value: string | number;
  delta?: string;
  icon: LucideIcon;
  /** Semantic tone. The legacy colour names are still accepted. */
  color?: Tone | "indigo" | "emerald" | "amber" | "rose";
  /** Makes the card a button, e.g. to filter a table by this metric. */
  onClick?: () => void;
  active?: boolean;
}

const LEGACY: Record<string, Tone> = { indigo: "primary", emerald: "success", amber: "warning", rose: "danger" };

const TONES: Record<Tone, { icon: string; bar: string; delta: string }> = {
  primary: { icon: "bg-primary/10 text-primary", bar: "bg-primary", delta: "text-primary" },
  success: { icon: "bg-success/10 text-success", bar: "bg-success", delta: "text-success" },
  warning: { icon: "bg-warning/10 text-warning", bar: "bg-warning", delta: "text-warning" },
  danger: { icon: "bg-destructive/10 text-destructive", bar: "bg-destructive", delta: "text-destructive" },
  info: { icon: "bg-info/10 text-info", bar: "bg-info", delta: "text-info" },
};

export function StatCard({ label, value, delta, icon: Icon, color = "primary", onClick, active }: StatCardProps) {
  const tone = TONES[LEGACY[color] ?? (color as Tone)];
  const body = (
    <>
      <span className={cn("absolute inset-x-0 top-0 h-0.5 opacity-70", tone.bar)} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-foreground tabular-nums">
            {typeof value === "number" ? value.toLocaleString() : value}
          </p>
          {delta && <p className={cn("mt-1 text-xs font-medium", tone.delta)}>{delta}</p>}
        </div>
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105", tone.icon)}>
          <Icon className="size-[21px]" strokeWidth={1.8} />
        </span>
      </div>
    </>
  );
  const classes = cn(
    "group relative block w-full overflow-hidden rounded-xl border bg-card p-4 shadow-sm transition duration-200 sm:p-5",
    active ? "border-primary ring-2 ring-primary/20" : "border-border",
    onClick && "cursor-pointer hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  );
  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={active} className={classes}>
      {body}
    </button>
  ) : (
    <div className={classes}>{body}</div>
  );
}
