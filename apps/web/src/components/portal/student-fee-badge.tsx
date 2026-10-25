import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, AlertTriangle, ShieldCheck, CircleHelp } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

export type StudentFeeStatusCode =
  | "FULLY_PAID"
  | "PARTIALLY_PAID"
  | "YET_TO_PAY"
  | "BLOCKED_BY_ARREARS"
  | "UNKNOWN";

export interface StudentFeeStatus {
  status: StudentFeeStatusCode;
  label: string;
  description: string;
  academicYear?: string | null;
  term?: string | null;
  arrearsPolicy?: "SHOW_ONLY" | "BLOCK_CLEARANCE_UNTIL_PAID";
  clearanceAllowed?: boolean;
}

interface StudentFeeBadgeProps {
  status?: StudentFeeStatusCode;
  label?: string;
  className?: string;
}

export function useStudentFeeStatus() {
  return useQuery({
    queryKey: ["students", "me", "fee-status"],
    queryFn: () => apiFetch<StudentFeeStatus>("/students/me/fee-status"),
    retry: false,
    staleTime: 60_000,
  });
}

export function StudentFeeBadge({ status, label, className }: StudentFeeBadgeProps) {
  const query = useStudentFeeStatus();
  const currentStatus = status ?? query.data?.status ?? "UNKNOWN";
  const currentLabel = label ?? query.data?.label ?? ({
    FULLY_PAID: "Fully Paid",
    PARTIALLY_PAID: "Partially Paid",
    YET_TO_PAY: "Yet to Make Payment",
    BLOCKED_BY_ARREARS: "Clearance Blocked",
    UNKNOWN: "Unknown",
  } satisfies Record<StudentFeeStatusCode, string>)[currentStatus];

  const classes = currentStatus === "FULLY_PAID"
    ? "border-success/30 bg-success/10 text-success"
    : currentStatus === "PARTIALLY_PAID"
      ? "border-warning/30 bg-warning/10 text-warning"
      : currentStatus === "UNKNOWN"
        ? "border-border bg-muted text-muted-foreground"
        : "border-destructive/30 bg-destructive/10 text-destructive";
  const Icon = currentStatus === "FULLY_PAID"
    ? CheckCircle2
    : currentStatus === "PARTIALLY_PAID"
      ? Clock
      : currentStatus === "UNKNOWN"
        ? CircleHelp
        : AlertTriangle;

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold shadow-2xs", classes, className)}>
      <Icon className="size-3.5" />
      <span>Fee Status: {currentLabel}</span>
    </span>
  );
}

/** Shows clearance state without treating loading or errors as paid. */
export function StudentFeeAlertBanner({ className }: { className?: string }) {
  const query = useStudentFeeStatus();
  const currentStatus = query.data?.status ?? "UNKNOWN";
  const title = ({
    FULLY_PAID: "School Fees: Fully Paid",
    PARTIALLY_PAID: "School Fees: Partially Paid",
    YET_TO_PAY: "School Fees: Yet to Make Payment",
    BLOCKED_BY_ARREARS: "School Fees: Clearance Blocked",
    UNKNOWN: "School Fees: Status Unknown",
  } satisfies Record<StudentFeeStatusCode, string>)[currentStatus];
  const description = query.data?.description ?? (
    currentStatus === "UNKNOWN"
      ? "Fee clearance could not be verified. Please refresh or contact the school accounts office."
      : currentStatus === "FULLY_PAID"
        ? "All required school fees have been cleared."
        : currentStatus === "PARTIALLY_PAID"
          ? "A partial school fee payment has been recorded. Please ask your parent or guardian to review the remaining balance."
          : currentStatus === "BLOCKED_BY_ARREARS"
            ? "Previous-term fees remain unpaid. Examination clearance is currently blocked."
            : "Term fee payment is pending. Please ask your parent or guardian to review the fee account."
  );

  const tone = currentStatus === "FULLY_PAID"
    ? "success"
    : currentStatus === "UNKNOWN"
      ? "neutral"
      : currentStatus === "PARTIALLY_PAID"
        ? "warning"
        : "destructive";
  const Icon = currentStatus === "FULLY_PAID"
    ? ShieldCheck
    : currentStatus === "PARTIALLY_PAID"
      ? Clock
      : currentStatus === "UNKNOWN"
        ? CircleHelp
        : AlertTriangle;
  const toneClass = tone === "success"
    ? "border-success/20 bg-success/10 text-success"
    : tone === "warning"
      ? "border-warning/20 bg-warning/10 text-warning"
      : tone === "neutral"
        ? "border-border bg-muted text-muted-foreground"
        : "border-destructive/20 bg-destructive/10 text-destructive";

  return (
    <div className={cn("flex items-center gap-3 rounded-2xl border p-4 text-xs", toneClass, className)}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-background/70">
        <Icon className="size-5" />
      </span>
      <div>
        <p className="font-black">{title}</p>
        <p className="mt-1 text-[11px] leading-5 opacity-90">{description}</p>
      </div>
    </div>
  );
}
