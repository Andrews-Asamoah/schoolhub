import { evaluateSubscriptionAccess } from "@schoolhub/shared";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "muted" | "info";

const STATUS: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Active", tone: "success" },
  TRIALING: { label: "Trial", tone: "info" },
  PAST_DUE: { label: "Past due", tone: "warning" },
  CANCELLED: { label: "Cancelled", tone: "muted" },
  CANCELED: { label: "Cancelled", tone: "muted" },
  SUSPENDED: { label: "Suspended", tone: "danger" },
};

const TONE_CLASSES: Record<Tone, { chip: string; dot: string }> = {
  success: { chip: "border-success/25 bg-success/10 text-success", dot: "bg-success" },
  info: { chip: "border-info/25 bg-info/10 text-info", dot: "bg-info" },
  warning: { chip: "border-warning/30 bg-warning/10 text-warning", dot: "bg-warning" },
  danger: { chip: "border-destructive/25 bg-destructive/10 text-destructive", dot: "bg-destructive" },
  muted: { chip: "border-border bg-muted text-muted-foreground", dot: "bg-muted-foreground/60" },
};

interface SubscriptionBadgeProps {
  status: string;
  /** When given, a lapsed school shows "Grace period" / "Expired" instead of its stored status. */
  expiresAt?: string | null;
  className?: string;
}

export function SubscriptionBadge({ status, expiresAt, className }: SubscriptionBadgeProps) {
  let entry = STATUS[status] ?? { label: "Unknown", tone: "muted" as Tone };
  if (expiresAt !== undefined) {
    const access = evaluateSubscriptionAccess(status, expiresAt);
    if (access.reason === "GRACE_PERIOD") entry = { label: "Grace period", tone: "warning" };
    if (access.reason === "EXPIRED") entry = { label: "Expired", tone: "danger" };
  }
  const tone = TONE_CLASSES[entry.tone];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold", tone.chip, className)}>
      <span className={cn("size-1.5 rounded-full", tone.dot)} aria-hidden />
      {entry.label}
    </span>
  );
}
