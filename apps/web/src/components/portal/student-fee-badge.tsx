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
          "inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 shadow-2xs dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
          className,
        )}
      >
        <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
        <span>Fee Status: {currentLabel}</span>
      </span>
    );
  }

  if (currentStatus === "PARTIALLY_PAID") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800 shadow-2xs dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
          className,
        )}
      >
        <Clock className="size-3.5 text-amber-600 dark:text-amber-400" />
        <span>Fee Status: {currentLabel}</span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-bold text-rose-800 shadow-2xs dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
        className,
      )}
    >
      <AlertTriangle className="size-3.5 text-rose-600 dark:text-rose-400" />
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
          "flex items-center justify-between rounded-2xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 via-emerald-50/50 to-white p-4 text-xs dark:border-emerald-900/40 dark:bg-slate-900",
          className,
        )}
      >
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-emerald-950 dark:text-emerald-200">
                School Fees: Fully Paid
              </span>
              <span className="rounded-md bg-emerald-200/60 px-1.5 py-0.2 text-[10px] font-bold text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-200">
                Cleared
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-emerald-800/90 dark:text-emerald-300">
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
          "flex items-center justify-between rounded-2xl border border-amber-200/80 bg-gradient-to-r from-amber-50 via-amber-50/50 to-white p-4 text-xs dark:border-amber-900/40 dark:bg-slate-900",
          className,
        )}
      >
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-xs">
            <Clock className="size-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-amber-950 dark:text-amber-200">
                School Fees: Partially Paid
              </span>
              <span className="rounded-md bg-amber-200/60 px-1.5 py-0.2 text-[10px] font-bold text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
                Pending Balance
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-amber-800/90 dark:text-amber-300">
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
        "flex items-center justify-between rounded-2xl border border-rose-200/80 bg-gradient-to-r from-rose-50 via-rose-50/50 to-white p-4 text-xs dark:border-rose-900/40 dark:bg-slate-900",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white shadow-xs">
          <AlertTriangle className="size-5" />
        </span>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-black text-rose-950 dark:text-rose-200">
              School Fees: Yet to Make Payment
            </span>
            <span className="rounded-md bg-rose-200/60 px-1.5 py-0.2 text-[10px] font-bold text-rose-900 dark:bg-rose-900/60 dark:text-rose-200">
              Action Required by Guardian
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-rose-800/90 dark:text-rose-300">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}
