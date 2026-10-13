import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  delta?: string;
  icon: LucideIcon;
  color: "indigo" | "emerald" | "amber" | "rose";
}

const colorMap = {
  indigo: {
    icon: "bg-indigo-50 text-indigo-600",
    delta: "text-indigo-600",
    glow: "bg-indigo-500",
  },
  emerald: {
    icon: "bg-emerald-50 text-emerald-600",
    delta: "text-emerald-600",
    glow: "bg-emerald-500",
  },
  amber: {
    icon: "bg-amber-50 text-amber-600",
    delta: "text-amber-600",
    glow: "bg-amber-500",
  },
  rose: {
    icon: "bg-rose-50 text-rose-600",
    delta: "text-rose-600",
    glow: "bg-rose-500",
  },
};

export function StatCard({ label, value, delta, icon: Icon, color }: StatCardProps) {
  const colors = colorMap[color];

  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.025)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)] sm:p-6"
    >
      <span className={cn("absolute inset-x-0 top-0 h-0.5 opacity-70", colors.glow)} />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
            {typeof value === "number" ? value.toLocaleString() : value}
          </p>
          {delta && (
            <p className={cn("mt-1 text-xs font-medium", colors.delta)}>
              {delta}
            </p>
          )}
        </div>
        <span className={cn("flex size-11 items-center justify-center rounded-xl transition-transform group-hover:scale-105", colors.icon)}>
          <Icon className="size-[21px]" strokeWidth={1.8} />
        </span>
      </div>
    </div>
  );
}
