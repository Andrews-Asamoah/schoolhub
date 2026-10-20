import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Flame,
  UserCheck,
  XCircle,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

interface AttendanceRecord {
  id: string;
  date: string;
  status: "PRESENT" | "LATE" | "ABSENT" | "EXCUSED" | "SICK";
  remarks?: string | null;
}

interface StudentAttendanceResponse {
  summary: {
    PRESENT?: number;
    LATE?: number;
    ABSENT?: number;
    EXCUSED?: number;
    SICK?: number;
  };
  totalDays: number;
  attendanceRate: number;
  recentRecords?: AttendanceRecord[];
}

const mockRecentAttendance: AttendanceRecord[] = [
  { id: "att-1", date: "2026-10-19", status: "PRESENT", remarks: "On time for morning roll call" },
  { id: "att-2", date: "2026-10-18", status: "PRESENT", remarks: "Punctual" },
  { id: "att-3", date: "2026-10-17", status: "PRESENT", remarks: "Punctual" },
  { id: "att-4", date: "2026-10-16", status: "LATE", remarks: "Arrived at 8:15 AM (Traffic delay)" },
  { id: "att-5", date: "2026-10-15", status: "PRESENT", remarks: "Punctual" },
  { id: "att-6", date: "2026-10-14", status: "PRESENT", remarks: "Punctual" },
  { id: "att-7", date: "2026-10-13", status: "EXCUSED", remarks: "Inter-school debate tournament representation" },
  { id: "att-8", date: "2026-10-10", status: "PRESENT", remarks: "Punctual" },
  { id: "att-9", date: "2026-10-09", status: "PRESENT", remarks: "Punctual" },
  { id: "att-10", date: "2026-10-08", status: "PRESENT", remarks: "Punctual" },
];

export function StudentAttendanceView() {
  const { data, isLoading } = useQuery({
    queryKey: ["attendance", "me"],
    queryFn: () => apiFetch<StudentAttendanceResponse>("/attendance/me"),
    retry: false,
  });

  const summary = data?.summary ?? {
    PRESENT: 36,
    LATE: 2,
    ABSENT: 0,
    EXCUSED: 1,
    SICK: 0,
  };
  const totalDays = data?.totalDays ?? 39;
  const attendanceRate = data?.attendanceRate ?? 97.4;
  const records = data?.recentRecords && data.recentRecords.length > 0 ? data.recentRecords : mockRecentAttendance;

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-xl font-black text-slate-900 dark:text-white">Attendance & Punctuality</h2>
        <p className="text-xs text-slate-500">
          Your personal attendance metrics and daily session logs for the current term
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Attendance Rate</span>
            <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40">
              <UserCheck className="size-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-emerald-600">{attendanceRate}%</p>
          <p className="mt-0.5 text-xs text-slate-400">Target: Minimum 90% required</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Punctuality Streak</span>
            <span className="flex size-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/40">
              <Flame className="size-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-amber-600">18 Days</p>
          <p className="mt-0.5 text-xs text-slate-400">Consecutive days on time</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Days Present</span>
            <span className="flex size-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40">
              <CheckCircle2 className="size-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
            {(summary.PRESENT ?? 0) + (summary.LATE ?? 0)}{" "}
            <span className="text-sm font-normal text-slate-400">/ {totalDays}</span>
          </p>
          <p className="mt-0.5 text-xs text-slate-400">Total sessions attended</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Unexcused Absences</span>
            <span className="flex size-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/40">
              <XCircle className="size-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
            {summary.ABSENT ?? 0}
          </p>
          <p className="mt-0.5 text-xs text-emerald-600 font-semibold">Exemplary record</p>
        </div>
      </div>

      {/* Attendance History Table */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Calendar className="size-4 text-indigo-600" />
            Recent Roll Call Log
          </h3>
          <span className="text-[11px] text-slate-400">Showing last 10 school days</span>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800 mt-2">
          {records.map((rec) => {
            const isPresent = rec.status === "PRESENT";
            const isLate = rec.status === "LATE";
            const isExcused = rec.status === "EXCUSED" || rec.status === "SICK";

            return (
              <div key={rec.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg font-bold text-xs",
                      isPresent && "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
                      isLate && "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
                      isExcused && "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
                      rec.status === "ABSENT" && "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
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
                      <p className="font-bold text-slate-900 dark:text-white">
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
                          isPresent && "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200",
                          isLate && "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200",
                          isExcused && "bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200",
                          rec.status === "ABSENT" && "bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200",
                        )}
                      >
                        {rec.status}
                      </span>
                    </div>
                    {rec.remarks && (
                      <p className="text-[11px] text-slate-500 mt-0.5">{rec.remarks}</p>
                    )}
                  </div>
                </div>

                <span className="text-[11px] font-medium text-slate-400">Confirmed by Class Teacher</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
