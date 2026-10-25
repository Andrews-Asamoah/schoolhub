import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  CheckCircle2,
  Clock,
  UserCheck,
  XCircle,
  HelpCircle,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

interface AttendanceRecord {
  id: string;
  date: string;
  status: "PRESENT" | "LATE" | "ABSENT" | "EXCUSED" | "SICK" | "PERMISSION";
  remarks?: string | null;
}

interface StudentAttendanceResponse {
  summary: {
    PRESENT?: number;
    LATE?: number;
    ABSENT?: number;
    EXCUSED?: number;
    SICK?: number;
    PERMISSION?: number;
  };
  totalDays: number;
  attendanceRate: number;
  recentRecords?: AttendanceRecord[];
}

export function StudentAttendanceView() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["attendance", "me"],
    queryFn: () => apiFetch<StudentAttendanceResponse>("/attendance/me"),
    retry: false,
  });

  const summary = data?.summary ?? {};
  const totalDays = data?.totalDays ?? 0;
  const attendanceRate = data?.attendanceRate ?? 0;
  const records = data?.recentRecords ?? [];

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-xl font-black text-foreground">Attendance & Punctuality</h2>
        <p className="text-xs text-muted-foreground">
          Your personal attendance metrics and daily session logs for the current term
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Attendance Rate</span>
            <span className="flex size-9 items-center justify-center rounded-xl bg-success/10 text-success">
              <UserCheck className="size-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-success">{attendanceRate}%</p>
          <p className="mt-0.5 text-xs text-muted-foreground/70">Based on recorded attendance this term</p>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Late Arrivals</span>
            <span className="flex size-9 items-center justify-center rounded-xl bg-warning/10 text-warning">
              <Clock className="size-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-warning">{summary.LATE ?? 0}</p>
          <p className="mt-0.5 text-xs text-muted-foreground/70">Recorded late arrivals this term</p>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Days Present</span>
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CheckCircle2 className="size-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-foreground">
            {(summary.PRESENT ?? 0) + (summary.LATE ?? 0)}{" "}
            <span className="text-sm font-normal text-muted-foreground/70">/ {totalDays}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground/70">Total sessions attended</p>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Unexcused Absences</span>
            <span className="flex size-9 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <XCircle className="size-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-foreground">
            {summary.ABSENT ?? 0}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground/70">Recorded absences this term</p>
        </div>
      </div>

      {/* Attendance History Table */}
      <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-border/60">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Calendar className="size-4 text-primary" />
            Recent Roll Call Log
          </h3>
          <span className="text-[11px] text-muted-foreground/70">Current term · latest records</span>
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading your attendance records…</p>
        ) : isError ? (
          <div className="py-8 text-center">
            <p className="text-sm text-destructive">Attendance records could not be loaded.</p>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="mt-3 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground/80 disabled:opacity-50"
            >
              {isFetching ? "Retrying…" : "Try again"}
            </button>
          </div>
        ) : records.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No attendance records have been recorded for the current term.</p>
        ) : (
        <div className="divide-y divide-border/60 mt-2">
          {records.map((rec) => {
            const isPresent = rec.status === "PRESENT";
            const isLate = rec.status === "LATE";
            const isExcused = rec.status === "EXCUSED" || rec.status === "SICK" || rec.status === "PERMISSION";

            return (
              <div key={rec.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg font-bold text-xs",
                      isPresent && "bg-success/10 text-success",
                      isLate && "bg-warning/10 text-warning",
                      isExcused && "bg-primary/10 text-primary",
                      rec.status === "ABSENT" && "bg-destructive/10 text-destructive",
                    )}
                  >
                    {isPresent ? (
                      <CheckCircle2 className="size-4" />
                    ) : isLate ? (
                      <Clock className="size-4" />
                    ) : isExcused ? (
                      <HelpCircle className="size-4" />
                    ) : (
                      <XCircle className="size-4" />
                    )}
                  </span>

                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-foreground">
                        {new Date(rec.date).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.2 text-[9px] font-bold uppercase",
                          isPresent && "bg-success/15 text-success",
                          isLate && "bg-warning/15 text-warning",
                          isExcused && "bg-primary/15 text-primary",
                          rec.status === "ABSENT" && "bg-destructive/15 text-destructive",
                        )}
                      >
                        {rec.status}
                      </span>
                    </div>
                    {rec.remarks && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">{rec.remarks}</p>
                    )}
                  </div>
                </div>

              </div>
            );
          })}
        </div>
        )}
      </div>
    </div>
  );
}
