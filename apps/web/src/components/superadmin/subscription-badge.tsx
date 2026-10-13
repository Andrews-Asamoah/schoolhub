import { cn } from "@/lib/utils";

type SubscriptionStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "SUSPENDED";

interface SubscriptionBadgeProps {
  status: string;
  className?: string;
}

const statusConfig: Record<
  SubscriptionStatus,
  { label: string; dot: string; text: string; bg: string }
> = {
  TRIALING: {
    label: "Trialing",
    dot: "bg-amber-400",
    text: "text-amber-700",
    bg: "bg-amber-50 border-amber-200",
  },
  ACTIVE: {
    label: "Active",
    dot: "bg-emerald-500",
    text: "text-emerald-700",
    bg: "bg-emerald-50 border-emerald-200",
  },
  PAST_DUE: {
    label: "Past Due",
    dot: "bg-rose-400",
    text: "text-rose-700",
    bg: "bg-rose-50 border-rose-200",
  },
  CANCELLED: {
    label: "Cancelled",
    dot: "bg-slate-400",
    text: "text-slate-600",
    bg: "bg-slate-50 border-slate-200",
  },
  SUSPENDED: {
    label: "Suspended",
    dot: "bg-red-500",
    text: "text-red-700",
    bg: "bg-red-50 border-red-200",
  },
};

const fallback = {
  label: "Unknown",
  dot: "bg-slate-300",
  text: "text-slate-500",
  bg: "bg-slate-50 border-slate-200",
};

export function SubscriptionBadge({ status, className }: SubscriptionBadgeProps) {
  const config =
    statusConfig[status as SubscriptionStatus] ?? fallback;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        config.bg,
        config.text,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", config.dot)} />
      {config.label}
    </span>
  );
}
