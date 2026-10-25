import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, AlertTriangle, ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface StudentFeeStatus {
  status: "FULLY_PAID" | "PARTIALLY_PAID" | "YET_TO_PAY";
  label: string;
  description: string;
  academicYear?: string | null;
  term?: string | null;
}

interface StudentFeeBadgeProps {
  status?: "FULLY_PAID" | "PARTIALLY_PAID" | "YET_TO_PAY";
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

/**
 * Compact fee status badge for headers, profile cards, and student overviews.
 * Exposes ONLY payment clearance status and never numerical balances or invoices.
 */
export function StudentFeeBadge({ status, label, className }: StudentFeeBadgeProps) {
  const { data } = useStudentFeeStatus();
  const currentStatus = status ?? data?.status ?? "FULLY_PAID";
  const currentLabel = label ?? data?.label ?? (
    currentStatus === "FULLY_PAID"
      ? "Fully Paid"
      : currentStatus === "PARTIALLY_PAID"
        ? "Partially Paid"
        : "Yet to Make Payment"
  );

  if (currentStatus === "FULLY_PAID") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-bold text-success shadow-2xs",
          className,
        )}
      >
        <CheckCircle2 className="size-3.5 text-success" />
        <span>Fee Status: {currentLabel}</span>
      </span>
    );
  }

  if (currentStatus === "PARTIALLY_PAID") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs font-bold text-warning shadow-2xs",
          className,
        )}
      >
        <Clock className="size-3.5 text-warning" />
        <span>Fee Status: {currentLabel}</span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1 text-xs font-bold text-destructive shadow-2xs",
        className,
      )}
    >
      <AlertTriangle className="size-3.5 text-destructive" />
      <span>Fee Status: {currentLabel}</span>
    </span>
  );
}

/**
 * Notice banner displayed on the student portal.
 * Informs the student of their clearance state while directing detailed billing
 * enquiries to parents/guardians.
 */
export function StudentFeeAlertBanner({ className }: { className?: string }) {
  const { data } = useStudentFeeStatus();
  const currentStatus = data?.status ?? "FULLY_PAID";
  const description =
    data?.description ??
    (currentStatus === "FULLY_PAID"
      ? "All required school fees have been cleared. Examination hall pass is active."
      : currentStatus === "PARTIALLY_PAID"
        ? "Partial school fee payment recorded. Remind parent or guardian to clear the remainder on their portal."
        : "Term fee payment is pending. Please remind your parent or guardian to settle term fees via the parent portal.");

  if (currentStatus === "FULLY_PAID") {
    return (
      <div
        className={cn(
          "flex items-center justify-between rounded-2xl border border-success/20 bg-gradient-to-r from-success/10 via-success/10 to-card p-4 text-xs dark:bg-card",
          className,
        )}
      >
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-success text-success-foreground shadow-xs">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-success">
                School Fees: Fully Paid
              </span>
              <span className="rounded-md bg-success/20 px-1.5 py-0.2 text-[10px] font-bold text-success">
                Cleared
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-success/90">
              {description}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (currentStatus === "PARTIALLY_PAID") {
    return (
      <div
        className={cn(
          "flex items-center justify-between rounded-2xl border border-warning/20 bg-gradient-to-r from-warning/10 via-warning/10 to-card p-4 text-xs dark:bg-card",
          className,
        )}
      >
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-warning text-warning-foreground shadow-xs">
            <Clock className="size-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-warning">
                School Fees: Partially Paid
              </span>
              <span className="rounded-md bg-warning/20 px-1.5 py-0.2 text-[10px] font-bold text-warning">
                Pending Balance
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-warning/90">
              {description}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-2xl border border-destructive/20 bg-gradient-to-r from-destructive/10 via-destructive/10 to-card p-4 text-xs dark:bg-card",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-destructive text-destructive-foreground shadow-xs">
          <AlertTriangle className="size-5" />
        </span>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-black text-destructive">
              School Fees: Yet to Make Payment
            </span>
            <span className="rounded-md bg-destructive/20 px-1.5 py-0.2 text-[10px] font-bold text-destructive">
              Action Required by Guardian
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-destructive/90">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}
