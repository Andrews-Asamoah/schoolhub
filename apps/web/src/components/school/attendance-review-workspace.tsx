import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarOff, CheckCheck, ClipboardList, ShieldCheck, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface GapDay { date: string; expected: number; marked: number; missing: number; coverageRate: number; historical: boolean }
interface GapResponse {
  class: { id: string; name: string };
  term: { id: string; name: string; startDate: string; endDate: string; calendarRevision: number };
  policyMode: "ACTIVE" | "PREVIEW";
  policyActiveFrom: string | null;
  days: GapDay[];
  incompleteDays: number;
  expectedMarks: number;
  recordedMarks: number;
  missingMarks: number;
  coverageRate: number | null;
}
interface RosterRow {
  studentId: string; admissionNumber: string | null; name: string;
  attendance: { status: string } | null;
}
interface ApprovedExclusion {
  id: string; studentId: string; date: string; reason: string;
  studentName: string; approvedById: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);
const styles = {
  input: "w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground",
  button: "inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50",
  primary: "inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50",
};

export function AttendanceReviewWorkspace({ classId, canManage }: {
  classId: string; canManage: boolean;
}) {
  const qc = useQueryClient();
  const [dateSelection, setDateSelection] = useState("");
  const [studentId, setStudentId] = useState("");
  const [exclusionReason, setExclusionReason] = useState("");
  const [revokeId, setRevokeId] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [closureDate, setClosureDate] = useState("");
  const [closureLabel, setClosureLabel] = useState("");
  const [closureReason, setClosureReason] = useState("");
  const [confirmSchoolWide, setConfirmSchoolWide] = useState(false);

  const gapQuery = useQuery({
    queryKey: ["attendance", "register-gaps", classId],
    queryFn: () => apiFetch<GapResponse>(`/attendance/class/${encodeURIComponent(classId)}/gaps`),
    enabled: Boolean(classId),
    retry: false,
  });
  const gaps = gapQuery.data;
  const termId = gaps?.term.id ?? "";
  const defaultDate = gaps?.term
    ? (today() < gaps.term.startDate ? gaps.term.startDate
      : today() > gaps.term.endDate ? gaps.term.endDate : today())
    : today();
  const date = dateSelection || gaps?.days[0]?.date || defaultDate;
  const roster = useQuery({
    queryKey: ["attendance", "class", classId, date],
    queryFn: () => apiFetch<RosterRow[]>(
      `/attendance/class/${encodeURIComponent(classId)}?date=${encodeURIComponent(date)}`),
    enabled: canManage && Boolean(termId) && Boolean(date),
    retry: false,
  });
  const exclusions = useQuery({
    queryKey: ["attendance", "exclusions", classId, termId],
    queryFn: () => apiFetch<ApprovedExclusion[]>(
      `/attendance/calendar/${encodeURIComponent(termId)}/exclusions?classId=${encodeURIComponent(classId)}`),
    enabled: canManage && Boolean(termId),
    retry: false,
  });
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["attendance"] });
    await qc.invalidateQueries({ queryKey: ["attendance-calendar"] });
  };
  const approve = useMutation({
    mutationFn: () => apiFetch("/attendance/calendar/exclusions", {
      method: "POST", body: JSON.stringify({
        studentId, termId, date, reason: exclusionReason.trim(),
      }),
    }),
    onSuccess: async () => {
      setStudentId(""); setExclusionReason("");
      await refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: () => apiFetch(`/attendance/calendar/exclusions/${encodeURIComponent(revokeId)}`, {
      method: "DELETE", body: JSON.stringify({ reason: revokeReason.trim() }),
    }),
    onSuccess: async () => {
      setRevokeId(""); setRevokeReason("");
      await refresh();
    },
  });
  const closure = useMutation({
    mutationFn: () => apiFetch(`/attendance/calendar/${encodeURIComponent(termId)}/closures`, {
      method: "POST", body: JSON.stringify({
        date: closureDate, label: closureLabel.trim(),
        reason: closureReason.trim(), expectedRevision: gaps?.term.calendarRevision,
      }),
    }),
    onSuccess: async () => {
      setClosureDate(""); setClosureLabel(""); setClosureReason(""); setConfirmSchoolWide(false);
      setDateSelection("");
      await refresh();
    },
  });
  const students = (roster.data ?? []).filter(row =>
    !row.attendance && !exclusions.data?.some(e => e.studentId === row.studentId && e.date === date));
  const selectedExclusion = exclusions.data?.find(item => item.id === revokeId);

  return <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <ClipboardList className="size-5 text-primary"/> Register completeness
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Missing marks are not absences. Counts honour school days, pupil entry dates,
          effective enrolment and authorised exclusions.
        </p>
      </div>
      {gaps && <span className="rounded-lg bg-muted px-3 py-2 text-xs font-semibold">
        {gaps.policyMode === "ACTIVE" ? "Calendar policy active" : "Historical preview"}
      </span>}
    </div>
    {gapQuery.isPending && <p className="text-sm text-muted-foreground">Checking class registers…</p>}
    {gapQuery.isError && <p role="alert" className="text-sm text-destructive">
      Unable to review registers: {gapQuery.error.message}
    </p>}
    {gaps && <>
      {gaps.policyMode === "PREVIEW" && <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        The calendar-based attendance policy is inactive or scheduled for the future.
        These dates are diagnostics only; historical percentages remain unchanged.
      </p>}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted-foreground">Days requiring register attention</p>
          <p className="mt-1 text-2xl font-bold">{gaps.incompleteDays}</p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted-foreground">Missing pupil marks</p>
          <p className="mt-1 text-2xl font-bold">{gaps.missingMarks}</p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted-foreground">Register coverage</p>
          <p className="mt-1 text-2xl font-bold">{gaps.coverageRate == null ? "—" : `${gaps.coverageRate}%`}</p>
        </div>
      </div>
      {!gaps.days.length ? <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
        No incomplete instructional registers in this class for the current term.
      </p> : <div className="space-y-2">
        <h4 className="text-xs font-bold">Unmarked register days</h4>
        <div className="max-h-64 overflow-y-auto rounded-xl border border-border">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-muted">
              <tr><th className="p-2">Date</th><th className="p-2">Recorded / expected</th><th className="p-2">Missing</th><th className="p-2">Action</th></tr>
            </thead>
            <tbody>{gaps.days.map(day => <tr key={day.date} className="border-t border-border">
              <td className="p-2">{day.date}{day.historical && <span className="ml-1 text-muted-foreground">(historical)</span>}</td>
              <td className="p-2">{day.marked} / {day.expected}</td>
              <td className="p-2 font-semibold">{day.missing}</td>
              <td className="p-2">
                {canManage
                  ? <button type="button" className="text-primary underline" onClick={() => {
                    setDateSelection(day.date); setStudentId("");
                  }}>Review pupils</button>
                  : <span className="text-muted-foreground">Class teacher to complete</span>}
              </td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>}
    </>}
    {canManage && gaps && <div className="grid gap-4 border-t border-border pt-4 xl:grid-cols-2">
      <div className="space-y-3 rounded-xl border border-border p-4">
        <h4 className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="size-4"/> Authorised pupil exclusion</h4>
        <p className="text-xs text-muted-foreground">
          Exclude a pupil from the possible-days denominator only when management has approved
          a genuine non-attendance obligation. Ordinary excused absences remain in the denominator.
        </p>
        <div>
          <label className="mb-1 block text-xs font-semibold">Instructional date</label>
          <DatePicker value={date} minDate={gaps.term.startDate} maxDate={gaps.term.endDate}
            onChange={value => { setDateSelection(value); setStudentId(""); }} />
        </div>
        <div><label className="mb-1 block text-xs font-semibold">Pupil</label>
          <Select value={studentId} onValueChange={setStudentId}>
            <SelectTrigger aria-label="Choose an unmarked pupil"><SelectValue placeholder="Choose unmarked pupil"/></SelectTrigger>
            <SelectContent>{students.map(row => <SelectItem key={row.studentId} value={row.studentId}>
              {row.name}{row.admissionNumber ? ` · ${row.admissionNumber}` : ""}
            </SelectItem>)}</SelectContent>
          </Select>
          {roster.isError && <p role="alert" className="mt-1 text-xs text-destructive">{roster.error.message}</p>}
          {roster.isPending && <p className="mt-1 text-xs text-muted-foreground">Loading pupils…</p>}
          {!roster.isPending && !students.length && <p className="mt-1 text-xs text-muted-foreground">
            No unmarked pupils available on this date.
          </p>}
        </div>
        <div><label htmlFor="exclusion-reason" className="mb-1 block text-xs font-semibold">Approval reason</label>
          <textarea id="exclusion-reason" rows={2} maxLength={400} className={styles.input}
            value={exclusionReason} onChange={e => setExclusionReason(e.target.value)}
            placeholder="Record the authorised exclusion and supporting reason"/>
        </div>
        {approve.isError && <p role="alert" className="text-xs text-destructive">{approve.error.message}</p>}
        {approve.isSuccess && <p role="status" className="text-xs text-success">Exclusion approved and audited.</p>}
        <button type="button" className={styles.primary} onClick={()=>approve.mutate()}
          disabled={!studentId || exclusionReason.trim().length < 8 || approve.isPending}>
          <CheckCheck className="size-4"/>{approve.isPending ? "Approving…" : "Approve exclusion"}
        </button>
        <div className="space-y-2 border-t border-border pt-3">
          <h5 className="text-xs font-bold">Approved exclusions for this class</h5>
          {exclusions.isError && <p role="alert" className="text-xs text-destructive">{exclusions.error.message}</p>}
          {exclusions.isPending && <p className="text-xs text-muted-foreground">Loading approvals…</p>}
          {!exclusions.isPending && exclusions.data?.length === 0 && <p className="text-xs text-muted-foreground">No approvals recorded.</p>}
          <div className="max-h-44 space-y-1 overflow-auto">{exclusions.data?.map(row =>
            <div key={row.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2 py-2 text-xs">
              <span>{row.date} · {row.studentName} — {row.reason}</span>
              <button type="button" className={styles.button} onClick={()=>{setRevokeId(row.id);setRevokeReason("");}}>
                <Trash2 className="size-3"/> Revoke
              </button>
            </div>)}</div>
          {selectedExclusion && <div className="space-y-2 rounded-lg border border-warning/40 p-3">
            <p className="text-xs font-semibold">Revoke {selectedExclusion.studentName}'s exclusion on {selectedExclusion.date}?</p>
            <textarea aria-label="Reason to revoke approved exclusion" rows={2} maxLength={400}
              className={styles.input} value={revokeReason} onChange={e=>setRevokeReason(e.target.value)}
              placeholder="Reason for revocation"/>
            {revoke.isError && <p role="alert" className="text-xs text-destructive">{revoke.error.message}</p>}
            <div className="flex gap-2">
              <button type="button" className={styles.button} onClick={()=>setRevokeId("")}>Cancel</button>
              <button type="button" className={styles.primary} disabled={revokeReason.trim().length<8 || revoke.isPending}
                onClick={()=>revoke.mutate()}>Confirm revocation</button>
            </div>
          </div>}
          </div>
      </div>
      <div className="space-y-3 rounded-xl border border-border p-4">
        <h4 className="flex items-center gap-2 text-sm font-bold"><CalendarOff className="size-4"/> Declare a school closure</h4>
        <p className="text-xs text-muted-foreground">
          An unscheduled holiday applies to <strong>every class in the school</strong>,
          not just this class. It cannot be declared if any pupil's attendance
          was recorded on the date or if term reports have already been published.
        </p>
        {!closureDate ? <>
          <p className="text-xs text-muted-foreground">Select an unmarked register day to propose a school-wide closure.</p>
          <div className="flex flex-wrap gap-2">{gaps.days.filter(day => day.marked === 0).slice(0, 20).map(day =>
            <button key={day.date} type="button" className={styles.button} onClick={()=> {
              setClosureDate(day.date); setClosureLabel(""); setClosureReason(""); setConfirmSchoolWide(false);
            }}>{day.date}</button>)}</div>
        </> : <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/5 p-3">
          <p className="flex items-center gap-2 text-xs font-bold"><AlertTriangle className="size-4"/> School-wide closure: {closureDate}</p>
          <div><label htmlFor="closure-label" className="mb-1 block text-xs font-semibold">Closure name</label>
            <input id="closure-label" className={styles.input} maxLength={160}
              value={closureLabel} onChange={e=>setClosureLabel(e.target.value)} placeholder="e.g. Emergency school closure"/>
          </div>
          <div><label htmlFor="closure-reason" className="mb-1 block text-xs font-semibold">Audit reason</label>
            <textarea id="closure-reason" className={styles.input} rows={2} maxLength={400}
              value={closureReason} onChange={e=>setClosureReason(e.target.value)}
              placeholder="Explain why the whole school did not hold classes"/>
          </div>
          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" checked={confirmSchoolWide}
              onChange={e=>setConfirmSchoolWide(e.target.checked)} className="mt-0.5 accent-primary"/>
            I confirm this was a non-instructional day for the entire school, not only the selected class.
          </label>
          {closure.isError && <p role="alert" className="text-xs text-destructive">{closure.error.message}</p>}
          <div className="flex gap-2">
            <button type="button" className={styles.button} onClick={()=>setClosureDate("")}>Cancel</button>
            <button type="button" className={styles.primary}
              disabled={!confirmSchoolWide || closureLabel.trim().length < 2
                || closureReason.trim().length < 8 || closure.isPending}
              onClick={()=>closure.mutate()}>Declare school closure</button>
          </div>
        </div>}
      </div>
    </div>}
  </section>;
}
