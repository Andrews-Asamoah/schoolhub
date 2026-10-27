import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useState } from "react";
import { AlertCircle, CalendarDays, CheckCircle2, Clock3, LoaderCircle, Printer, RefreshCw, UserRound, XCircle } from "lucide-react";
import type { StudentProfileData } from "@/components/school/student-profile-panel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  attendanceRate: number | null; unmarkedDays?: number; eligibilityWarning?: string | null;
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
  PRESENT: "bg-success/10 text-success",
  LATE: "bg-warning/10 text-warning",
  ABSENT: "bg-destructive/10 text-destructive",
  EXCUSED: "bg-info/10 text-info",
  SICK: "bg-info/10 text-info",
  PERMISSION: "bg-info/10 text-info",
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
  return <div className="mx-auto w-full min-w-0 max-w-screen-2xl space-y-6">
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Family centre</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground">{title}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{view === "attendance" ? "Review your child's recorded attendance, punctuality and recent register entries." : "View your child's current class schedule, including lesson times, subjects, teachers and rooms."}</p></div>
        {wards.length > 0 && <div className="w-full sm:w-72"><label htmlFor="guardian-child-select" className="mb-1.5 block text-xs font-semibold text-muted-foreground">Child</label><Select value={selectedId} onValueChange={setStudentId}><SelectTrigger id="guardian-child-select" className="h-11 w-full text-sm"><SelectValue placeholder="Choose a child" /></SelectTrigger><SelectContent>{wards.map((ward) => <SelectItem key={ward.id} value={ward.id}>{wardName(ward)}</SelectItem>)}</SelectContent></Select></div>}
      </div>
      {selectedWard && <div className="mt-4 flex items-center gap-3 rounded-xl bg-muted/50 p-3"><span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><UserRound className="size-5" /></span><div><p className="text-sm font-semibold text-foreground">{wardName(selectedWard)}</p><p className="text-xs text-muted-foreground">{selectedWard.class?.name ?? "Class not assigned"}{selectedWard.admissionNumber ? ` · Admission no. ${selectedWard.admissionNumber}` : ""}</p></div></div>}
    </section>
    {wardsQuery.isPending ? <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-12 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading your linked children…</div> :
      wardsQuery.isError ? <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive"><AlertCircle className="mr-2 inline size-4" /> Your linked children could not be loaded. Please try again later.</div> :
      wards.length === 0 ? <EmptyState title="No children linked yet" message="Contact the school office to verify your guardian record and link your child or children." /> :
      view === "attendance" ? <AttendancePanel query={attendanceQuery} /> : <TimetablePanel query={timetableQuery} childName={selectedWard ? wardName(selectedWard) : ""} />}
  </div>;
}
function AttendancePanel({ query }: { query: UseQueryResult<AttendanceData, Error> }) {
  const data = query.data;
  if (query.isPending) return <LoadingState label="Loading attendance records…" />;
  if (query.isError) return <RetryState message="Attendance records could not be loaded." onRetry={() => void query.refetch()} fetching={query.isFetching} />;
  const summary = data?.summary ?? {};
  const stats = [
    { label: "Attendance rate", value: data?.attendanceRate == null ? "Incomplete" : `${data.attendanceRate}%`, icon: CheckCircle2 },
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
function TimetablePanel({ query, childName }: { query: UseQueryResult<TimetableData, Error>; childName: string }) {
  if (query.isPending) return <LoadingState label="Loading timetable…" />;
  if (query.isError) return <RetryState message="The timetable could not be loaded." onRetry={() => void query.refetch()} fetching={query.isFetching} />;
  const data = query.data;
  if (!data?.class) return <EmptyState title="No current class timetable" message="Your child does not have a current class placement, or the school has not set up the timetable for the current academic term." />;
  const entries = data.entries ?? [];
  const weekDays = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as const;
  const labels: Record<string, string> = { MONDAY: "Mon", TUESDAY: "Tue", WEDNESDAY: "Wed", THURSDAY: "Thu", FRIDAY: "Fri" };
  const periods = [...new Set(entries.map(entry => entry.startTime + "|" + entry.endTime))].sort((a,b) => a.localeCompare(b));
  const getEntry = (day: string, period: string) => entries.find(entry => entry.dayOfWeek === day && entry.startTime + "|" + entry.endTime === period);
  return <section className="guardian-timetable-print-area min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
    <style>{`@media print { html, body { width: 100% !important; height: auto !important; margin: 0 !important; padding: 0 !important; background: white !important; } body * { visibility: hidden !important; } .guardian-timetable-print-area, .guardian-timetable-print-area * { visibility: visible !important; } .guardian-timetable-print-area { position: absolute !important; top: 0 !important; left: 0 !important; width: 100% !important; max-width: none !important; margin: 0 !important; padding: 0 !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; overflow: visible !important; background: white !important; color: black !important; break-inside: avoid !important; page-break-inside: avoid !important; } .guardian-timetable-print-area table { min-width: 0 !important; width: 100% !important; table-layout: fixed !important; border-collapse: collapse !important; font-size: 6.5pt !important; } .guardian-timetable-print-area th, .guardian-timetable-print-area td { color: black !important; border-color: #bbb !important; padding: 2px 3px !important; line-height: 1.15 !important; } .guardian-timetable-print-area th:first-child { width: 15mm !important; } .guardian-timetable-print-area td > div { min-height: 0 !important; padding: 3px !important; border-radius: 2px !important; background: white !important; border-color: #bbb !important; break-inside: avoid !important; page-break-inside: avoid !important; } .guardian-timetable-print-area td p { margin: 0 !important; padding: 0 !important; font-size: 6pt !important; line-height: 1.1 !important; overflow-wrap: anywhere !important; } .guardian-timetable-print-area > div { padding: 4px 0 !important; } .guardian-timetable-print-area h3 { font-size: 10pt !important; margin: 0 !important; } .guardian-timetable-print-area p { color: black !important; } .guardian-timetable-actions { display: none !important; } @page { size: A4 landscape; margin: 5mm; } }`}</style>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3"><div><h3 className="font-semibold text-foreground">Weekly timetable</h3><p className="mt-1 text-xs text-muted-foreground">{childName ? childName + " · " : ""}{data.class.name} · {data.academicYear?.name ?? "Current academic year"}{data.term?.name ? " · " + data.term.name : ""}</p></div><div className="guardian-timetable-actions flex flex-wrap items-center gap-2"><span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{entries.length} periods</span><button type="button" onClick={() => window.print()} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground transition hover:bg-accent"><Printer className="size-3.5" /> Print / Save PDF</button></div></div>
    {!entries.length ? <EmptyState title="No lessons published yet" message="The school has not added timetable entries for this class yet." /> : <div className="overflow-x-auto"><table className="w-full min-w-[780px] border-collapse text-left text-xs"><thead><tr className="bg-muted/50 text-muted-foreground"><th className="w-32 border-b border-border px-3 py-3 font-semibold uppercase tracking-wide">Period</th>{weekDays.map(day => <th key={day} className="border-b border-border px-2 py-3 font-semibold uppercase tracking-wide">{labels[day]}</th>)}</tr></thead><tbody>{periods.map((period,index) => { const [startTime,endTime] = period.split("|"); return <tr key={period} className="border-b border-border last:border-0"><th className="align-top px-3 py-3"><p className="font-semibold text-foreground">Period {index+1}</p><p className="mt-1 whitespace-nowrap text-[10px] text-muted-foreground">{startTime}–{endTime}</p></th>{weekDays.map(day => { const entry = getEntry(day,period); const isBreak = entry ? /break|lunch/i.test((entry.label ?? "") + " " + entry.type) : false; return <td key={day} className="min-w-32 align-top px-1.5 py-1.5">{entry ? <div className={"min-h-[54px] rounded-xl border p-2 " + (isBreak ? "border-warning/20 bg-warning/10" : "border-primary/15 bg-primary/5")}><p className="font-semibold leading-4 text-foreground">{entry.subject?.name ?? entry.label ?? (entry.type === "BREAK" ? "Break" : "Lesson")}</p>{entry.teacher?.name && <p className="mt-1 leading-4 text-muted-foreground">{entry.teacher.name}</p>}{entry.classroom?.name && <p className="mt-0.5 text-[10px] text-muted-foreground">{entry.classroom.name}</p>}</div> : <div className="min-h-[54px] rounded-xl border border-dashed border-border/60 bg-muted/20" aria-label="No scheduled lesson" />}</td>})}</tr>})}</tbody></table></div>}
  </section>;
}
function LoadingState({ label }: { label: string }) { return <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-12 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{label}</div>; }
function RetryState({ message, onRetry, fetching }: { message: string; onRetry: () => void; fetching: boolean }) { return <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-6 text-center"><p className="text-sm text-destructive">{message}</p><button type="button" onClick={onRetry} disabled={fetching} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground disabled:opacity-50"><RefreshCw className={`size-3.5 ${fetching ? "animate-spin" : ""}`} />Try again</button></div>; }
