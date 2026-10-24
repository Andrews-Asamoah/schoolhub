import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useState } from "react";
import { AlertCircle, CalendarDays, CheckCircle2, Clock3, LoaderCircle, RefreshCw, UserRound, XCircle } from "lucide-react";
import type { StudentProfileData } from "@/components/school/student-profile-panel";
import { apiFetch } from "@/lib/api";

type View = "attendance" | "timetable";
interface AttendanceRecord {
  id: string;
  date: string;
  status: "PRESENT" | "LATE" | "ABSENT" | "EXCUSED" | "SICK" | "PERMISSION";
  remarks?: string | null;
}
interface AttendanceData {
  summary: Record<string, number>;
  totalDays: number;
  attendanceRate: number;
  recentRecords: AttendanceRecord[];
}
interface Lesson {
  id: string;
  type: string;
  label?: string | null;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  subject?: { id: string; name: string; code?: string } | null;
  teacher?: { id: string; name: string } | null;
  classroom?: { id: string; name: string } | null;
}
interface TimetableData {
  class: { id: string; name: string; level: string } | null;
  academicYear: { id: string; name: string } | null;
  term: { id: string; name: string } | null;
  entries: Lesson[];
}
const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;
const dayLabels: Record<string, string> = { MONDAY: "Monday", TUESDAY: "Tuesday", WEDNESDAY: "Wednesday", THURSDAY: "Thursday", FRIDAY: "Friday", SATURDAY: "Saturday", SUNDAY: "Sunday" };
const statusStyles: Record<string, string> = {
  PRESENT: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  LATE: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  ABSENT: "bg-destructive/10 text-destructive",
  EXCUSED: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  SICK: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  PERMISSION: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
};
function wardName(ward: StudentProfileData) {
  return [ward.profile.firstName, ward.profile.otherNames, ward.profile.lastName].filter(Boolean).join(" ");
}
function EmptyState({ title, message }: { title: string; message: string }) {
  return <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center"><CalendarDays className="mx-auto size-8 text-muted-foreground" /><h3 className="mt-3 font-semibold text-foreground">{title}</h3><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{message}</p></div>;
}
export function GuardianChildRecordsWorkspace({ view }: { view: View }) {
  const [studentId, setStudentId] = useState("");
  const wardsQuery = useQuery({ queryKey: ["students", "my-wards"], queryFn: () => apiFetch<StudentProfileData[]>("/students/my-wards"), retry: false });
  const wards = wardsQuery.data ?? [];
  const selectedId = wards.some((ward) => ward.id === studentId) ? studentId : wards[0]?.id ?? "";
  const selectedWard = wards.find((ward) => ward.id === selectedId);
  const attendanceQuery = useQuery({
    queryKey: ["guardian", "attendance", selectedId],
    queryFn: () => apiFetch<AttendanceData>(`/attendance/guardian/${encodeURIComponent(selectedId)}`),
    enabled: view === "attendance" && Boolean(selectedId),
    retry: false,
  });
  const timetableQuery = useQuery({
    queryKey: ["guardian", "timetable", selectedId],
    queryFn: () => apiFetch<TimetableData>(`/timetable/guardian/${encodeURIComponent(selectedId)}`),
    enabled: view === "timetable" && Boolean(selectedId),
    retry: false,
  });
  const title = view === "attendance" ? "Attendance" : "Timetable";
  return <div className="space-y-6">
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Family centre</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground">{title}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{view === "attendance" ? "Review your child's recorded attendance, punctuality and recent register entries." : "View your child's current class schedule, including lesson times, subjects, teachers and rooms."}</p></div>
        {wards.length > 0 && <div className="w-full sm:w-72"><label htmlFor="guardian-child-select" className="mb-1.5 block text-xs font-semibold text-muted-foreground">Child</label><select id="guardian-child-select" value={selectedId} onChange={(event) => setStudentId(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/30">{wards.map((ward) => <option key={ward.id} value={ward.id}>{wardName(ward)}</option>)}</select></div>}
      </div>
      {selectedWard && <div className="mt-4 flex items-center gap-3 rounded-xl bg-muted/50 p-3"><span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><UserRound className="size-5" /></span><div><p className="text-sm font-semibold text-foreground">{wardName(selectedWard)}</p><p className="text-xs text-muted-foreground">{selectedWard.class?.name ?? "Class not assigned"}{selectedWard.admissionNumber ? ` · Admission no. ${selectedWard.admissionNumber}` : ""}</p></div></div>}
    </section>
    {wardsQuery.isPending ? <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-12 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading your linked children…</div> :
      wardsQuery.isError ? <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive"><AlertCircle className="mr-2 inline size-4" /> Your linked children could not be loaded. Please try again later.</div> :
      wards.length === 0 ? <EmptyState title="No children linked yet" message="Contact the school office to verify your guardian record and link your child or children." /> :
      view === "attendance" ? <AttendancePanel query={attendanceQuery} /> : <TimetablePanel query={timetableQuery} />}
  </div>;
}
function AttendancePanel({ query }: { query: UseQueryResult<AttendanceData, Error> }) {
  const data = query.data;
  if (query.isPending) return <LoadingState label="Loading attendance records…" />;
  if (query.isError) return <RetryState message="Attendance records could not be loaded." onRetry={() => void query.refetch()} fetching={query.isFetching} />;
  const summary = data?.summary ?? {};
  const stats = [
    { label: "Attendance rate", value: `${data?.attendanceRate ?? 0}%`, icon: CheckCircle2 },
    { label: "Days present", value: String((summary.PRESENT ?? 0) + (summary.LATE ?? 0)), icon: CheckCircle2 },
    { label: "Late arrivals", value: String(summary.LATE ?? 0), icon: Clock3 },
    { label: "Absences", value: String(summary.ABSENT ?? 0), icon: XCircle },
  ];
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{stats.map(({ label, value, icon: Icon }) => <div key={label} className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-muted-foreground">{label}</p><Icon className="size-4 text-primary" /></div><p className="mt-3 text-2xl font-bold text-foreground">{value}</p></div>)}</div>
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="mb-4"><h3 className="font-semibold text-foreground">Recent register entries</h3><p className="mt-1 text-xs text-muted-foreground">Current term · latest recorded entries</p></div>
      {!data?.recentRecords?.length ? <p className="py-8 text-center text-sm text-muted-foreground">No attendance records have been recorded for the current term.</p> : <div className="divide-y divide-border">{data.recentRecords.map((record) => <div key={record.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-foreground">{new Date(record.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</p>{record.remarks && <p className="mt-1 text-xs text-muted-foreground">{record.remarks}</p>}</div><span className={`w-fit rounded-full px-2.5 py-1 text-[11px] font-bold ${statusStyles[record.status] ?? "bg-muted text-muted-foreground"}`}>{record.status.toLowerCase()}</span></div>)}</div>}
    </section>
  </div>;
}
function TimetablePanel({ query }: { query: UseQueryResult<TimetableData, Error> }) {
  if (query.isPending) return <LoadingState label="Loading timetable…" />;
  if (query.isError) return <RetryState message="The timetable could not be loaded." onRetry={() => void query.refetch()} fetching={query.isFetching} />;
  const data = query.data;
  if (!data?.class) return <EmptyState title="No current class timetable" message="Your child does not have a current class placement, or the school has not set up the timetable for the current academic term." />;
  const entries = data.entries ?? [];
  const visibleDays = [...days, ...(entries.some((entry) => entry.dayOfWeek === "SUNDAY") ? ["SUNDAY"] : [])];
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"><div><p className="text-sm font-semibold text-foreground">{data.class.name}</p><p className="text-xs text-muted-foreground">{data.academicYear?.name ?? "Current academic year"}{data.term?.name ? ` · ${data.term.name}` : ""}</p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{entries.length} scheduled items</span></div>
    {entries.length === 0 ? <EmptyState title="No lessons published yet" message="The school has not added timetable entries for this class yet." /> : <div className="space-y-4">{visibleDays.filter((day) => entries.some((entry) => entry.dayOfWeek === day)).map((day) => <section key={day} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"><h3 className="border-b border-border bg-muted/40 px-4 py-3 text-sm font-semibold text-foreground">{dayLabels[day] ?? day}</h3><div className="divide-y divide-border">{entries.filter((entry) => entry.dayOfWeek === day).sort((a,b) => a.startTime.localeCompare(b.startTime)).map((entry) => <div key={entry.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center"><div className="flex w-36 shrink-0 items-center gap-2 text-xs font-semibold text-muted-foreground"><Clock3 className="size-3.5" />{entry.startTime}–{entry.endTime}</div><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-foreground">{entry.subject?.name ?? entry.label ?? (entry.type === "BREAK" ? "Break" : "School activity")}</p><p className="mt-1 text-xs text-muted-foreground">{entry.teacher?.name ? `Teacher: ${entry.teacher.name}` : "Teacher not assigned"}{entry.classroom?.name ? ` · Room ${entry.classroom.name}` : ""}</p></div><span className="w-fit rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold uppercase text-muted-foreground">{entry.type.toLowerCase()}</span></div>)}</div></section>)}</div>}
  </div>;
}
function LoadingState({ label }: { label: string }) { return <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-12 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{label}</div>; }
function RetryState({ message, onRetry, fetching }: { message: string; onRetry: () => void; fetching: boolean }) { return <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-6 text-center"><p className="text-sm text-destructive">{message}</p><button type="button" onClick={onRetry} disabled={fetching} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground disabled:opacity-50"><RefreshCw className={`size-3.5 ${fetching ? "animate-spin" : ""}`} />Try again</button></div>; }
