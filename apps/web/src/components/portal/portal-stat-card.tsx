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
    bg: "bg-blue-50/60 dark:bg-blue-950/20",
    border: "border-blue-100 dark:border-blue-900/30",
    iconBg: "bg-blue-600 text-white shadow-sm shadow-blue-500/20",
    accent: "text-blue-600 dark:text-blue-400",
  },
  emerald: {
    bg: "bg-emerald-50/60 dark:bg-emerald-950/20",
    border: "border-emerald-100 dark:border-emerald-900/30",
    iconBg: "bg-emerald-600 text-white shadow-sm shadow-emerald-500/20",
    accent: "text-emerald-600 dark:text-emerald-400",
  },
  amber: {
    bg: "bg-amber-50/60 dark:bg-amber-950/20",
    border: "border-amber-100 dark:border-amber-900/30",
    iconBg: "bg-amber-600 text-white shadow-sm shadow-amber-500/20",
    accent: "text-amber-600 dark:text-amber-400",
  },
  rose: {
    bg: "bg-rose-50/60 dark:bg-rose-950/20",
    border: "border-rose-100 dark:border-rose-900/30",
    iconBg: "bg-rose-600 text-white shadow-sm shadow-rose-500/20",
    accent: "text-rose-600 dark:text-rose-400",
  },
  purple: {
    bg: "bg-purple-50/60 dark:bg-purple-950/20",
    border: "border-purple-100 dark:border-purple-900/30",
    iconBg: "bg-purple-600 text-white shadow-sm shadow-purple-500/20",
    accent: "text-purple-600 dark:text-purple-400",
  },
  indigo: {
    bg: "bg-indigo-50/60 dark:bg-indigo-950/20",
    border: "border-indigo-100 dark:border-indigo-900/30",
    iconBg: "bg-indigo-600 text-white shadow-sm shadow-indigo-500/20",
    accent: "text-indigo-600 dark:text-indigo-400",
  },
  slate: {
    bg: "bg-slate-50/70 dark:bg-slate-900/40",
    border: "border-slate-200 dark:border-slate-800",
    iconBg: "bg-slate-700 text-white shadow-sm shadow-slate-700/20",
    accent: "text-slate-700 dark:text-slate-300",
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

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-white p-5 shadow-[0_2px_10px_rgba(15,23,42,0.03)] transition-all duration-200 dark:bg-slate-900",
        styles.border,
        onClick && "cursor-pointer hover:-translate-y-0.5 hover:shadow-md",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {label}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              {value}
            </span>
            {subValue && (
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
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
              trend.isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
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
            <span className="text-slate-500 dark:text-slate-400">
              {trend.label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
