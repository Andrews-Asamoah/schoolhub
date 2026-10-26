import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PortalStatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  trend?: {
    value: string;
    isPositive?: boolean;
    label?: string;
  };
  icon: LucideIcon;
  variant?: "blue" | "emerald" | "amber" | "rose" | "purple" | "indigo" | "slate";
  onClick?: () => void;
  className?: string;
}

const variantStyles = {
  blue: {
    bg: "bg-primary/10",
    border: "border-primary/20",
    iconBg: "bg-primary text-primary-foreground shadow-sm shadow-primary/20",
    accent: "text-primary",
  },
  emerald: {
    bg: "bg-success/10",
    border: "border-success/20",
    iconBg: "bg-success text-success-foreground shadow-sm shadow-success/20",
    accent: "text-success",
  },
  amber: {
    bg: "bg-warning/10",
    border: "border-warning/20",
    iconBg: "bg-warning text-warning-foreground shadow-sm shadow-warning/20",
    accent: "text-warning",
  },
  rose: {
    bg: "bg-destructive/10",
    border: "border-destructive/20",
    iconBg: "bg-destructive text-destructive-foreground shadow-sm shadow-destructive/20",
    accent: "text-destructive",
  },
  purple: {
    bg: "bg-highlight/10",
    border: "border-highlight/20",
    iconBg: "bg-highlight text-highlight-foreground shadow-sm shadow-highlight/20",
    accent: "text-highlight",
  },
  indigo: {
    bg: "bg-primary/10",
    border: "border-primary/20",
    iconBg: "bg-primary text-primary-foreground shadow-sm shadow-primary/20",
    accent: "text-primary",
  },
  slate: {
    bg: "bg-muted/70",
    border: "border-border",
    iconBg: "bg-foreground/80 text-background shadow-sm shadow-foreground/20",
    accent: "text-foreground/80",
  },
};

export function PortalStatCard({
  label,
  value,
  subValue,
  trend,
  icon: Icon,
  variant = "blue",
  onClick,
  className,
}: PortalStatCardProps) {
  const styles = variantStyles[variant];

  const cardClassName = cn(
        "group relative overflow-hidden rounded-xl border bg-card p-4 sm:p-5 shadow-[0_2px_10px_rgba(15,23,42,0.03)] transition-all duration-200",
        styles.border,
        onClick && "cursor-pointer hover:-translate-y-0.5 hover:shadow-md",
        className,
      );
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight tabular-nums text-foreground sm:text-3xl">
              {value}
            </span>
            {subValue && (
              <span className="text-xs font-medium text-muted-foreground">
                {subValue}
              </span>
            )}
          </div>
        </div>
        <div
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105",
            styles.iconBg,
          )}
        >
          <Icon className="size-5" />
        </div>
      </div>

      {trend && (
        <div className="mt-3 flex items-center gap-1.5 text-xs font-medium">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-bold",
              trend.isPositive ? "text-success" : "text-destructive",
            )}
          >
            {trend.isPositive ? (
              <ArrowUpRight className="size-3.5" />
            ) : (
              <ArrowDownRight className="size-3.5" />
            )}
            {trend.value}
          </span>
          {trend.label && (
            <span className="text-muted-foreground">
              {trend.label}
            </span>
          )}
        </div>
      )}
    </>
  );
  // A real button is keyboard operable by default; avoid clickable divs.
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(cardClassName, "w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>
      {content}
    </button>
  ) : (
    <div className={cardClassName}>{content}</div>
  );
}
