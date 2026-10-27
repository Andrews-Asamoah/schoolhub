import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Plus, Save, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";

type Year = { id: string; name: string; terms: { id: string; name: string; startDate: string; endDate: string }[] };
type Override = { date: string; label: string; isInstructional: boolean };
type Calendar = {
  term: { id: string; calendarRevision: number; startDate: string; endDate: string; instructionalWeekdays: number[] };
  days: Override[];
};
const today = new Date().toISOString().slice(0,10);

function AttendanceRolloutPolicy() {
  const client = useQueryClient();
  const policy = useQuery({
    queryKey: ["attendance", "policy"],
    queryFn: () => apiFetch<{ attendancePolicyActiveFrom: string | null }>("/attendance/policy"),
    retry: false,
  });
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!policy.data) return;
    setDate(policy.data.attendancePolicyActiveFrom ?? "");
    setEnabled(Boolean(policy.data.attendancePolicyActiveFrom));
    setReason("");
  }, [policy.data]);
  const save = useMutation({
    mutationFn: () => apiFetch("/attendance/policy", {
      method: "PATCH", body: JSON.stringify({
        attendancePolicyActiveFrom: enabled ? date : null, reason: reason.trim(),
      }),
    }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["attendance", "policy"] });
      await client.invalidateQueries({ queryKey: ["attendance", "me"] });
      await client.invalidateQueries({ queryKey: ["guardian", "attendance"] });
    },
  });
  return <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
    <h3 className="text-base font-bold">Attendance calculation rollout</h3>
    <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
      Existing schools retain the recorded-days method until an administrator activates the
      instructional-calendar policy. Set today or a future activation date. Older attendance
      registers are not automatically treated as absent. Incomplete new registers produce a
      clearly labelled provisional percentage rather than a misleading final rate.
    </p>
    {policy.isPending ? <p className="mt-3 text-xs text-muted-foreground">Loading attendance policy…</p>
      : policy.isError ? <p role="alert" className="mt-3 text-xs text-destructive">{policy.error.message}</p>
      : <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}
            className="size-4 accent-primary"/> Enable calendar-based attendance
        </label>
        <div><label className="mb-1 block text-xs font-semibold">Activation date</label>
          <DatePicker value={date} disabled={!enabled} minDate={today}
            onChange={setDate} ariaLabel="Attendance policy activation date"/>
        </div>
        <div className="md:col-span-2">
          <label htmlFor="attendance-rollout-reason" className="mb-1 block text-xs font-semibold">Reason for change</label>
          <textarea id="attendance-rollout-reason" rows={2} maxLength={400}
            value={reason} onChange={event=>setReason(event.target.value)}
            className="w-full rounded-lg border border-input bg-background p-3 text-sm"
            placeholder="Explain the decision to activate or disable calendar-based attendance"/>
        </div>
        {save.isError && <p role="alert" className="text-xs text-destructive md:col-span-2">{save.error.message}</p>}
        {save.isSuccess && <p role="status" className="text-xs text-success md:col-span-2">Attendance policy saved and audited.</p>}
        <div className="flex items-center justify-between gap-3 md:col-span-2">
          <p className="text-xs text-muted-foreground">Status: {policy.data?.attendancePolicyActiveFrom
            ? `Scheduled/active from ${policy.data.attendancePolicyActiveFrom}` : "Inactive — legacy calculation"}</p>
          <button type="button" onClick={()=>save.mutate()}
            disabled={save.isPending || reason.trim().length<8 || (enabled && (!date || date < today))
              || (enabled ? date : null) === (policy.data?.attendancePolicyActiveFrom ?? null)}
            className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-40">
            {save.isPending ? "Saving…" : "Save policy"}
          </button>
        </div>
      </div>}
  </section>;
}

const DAYS = [
  { id: 1, label: "Mon" }, { id: 2, label: "Tue" }, { id: 3, label: "Wed" },
  { id: 4, label: "Thu" }, { id: 5, label: "Fri" }, { id: 6, label: "Sat" }, { id: 7, label: "Sun" },
];

export function AcademicCalendarPolicyWorkspace({ years }: { years: Year[] }) {
  const queryClient = useQueryClient();
  const terms = useMemo(() => years.flatMap(year => year.terms.map(term => ({
    ...term, yearName: year.name,
  }))), [years]);
  const [chosenTerm, setChosenTerm] = useState("");
  const termId = terms.some(term => term.id === chosenTerm) ? chosenTerm : (terms[0]?.id ?? "");
  const term = terms.find(item => item.id === termId);
  const [weekdays, setWeekdays] = useState<number[]>([1,2,3,4,5]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [reason, setReason] = useState("");
  const [loadedRevision, setLoadedRevision] = useState<number | null>(null);
  const query = useQuery({
    queryKey: ["attendance-calendar",termId],
    queryFn: () => apiFetch<Calendar>("/attendance/calendar/"+encodeURIComponent(termId)),
    enabled: Boolean(termId),
    retry: false,
  });
  const data = query.data;
  useEffect(() => {
    if (!data) return;
    setWeekdays(data.term.instructionalWeekdays);
    setOverrides(data.days.map(item => ({
      date: item.date.slice(0,10), label: item.label, isInstructional: item.isInstructional,
    })));
    setLoadedRevision(data.term.calendarRevision);
    setReason("");
  }, [data]);
  const mutation = useMutation({
    mutationFn: (payload: { weekdays: number[]; overrides: Override[]; reason: string }) =>
      apiFetch("/attendance/calendar/"+encodeURIComponent(termId),{
        method:"PUT", body:JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["attendance-calendar",termId] });
      await queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
  });
  const save = () => {
    if (!termId) return;
    const uniqueDates = overrides.map(item=>item.date);
    if (!weekdays.length || !reason.trim() || reason.trim().length < 8
      || overrides.some(item=>!item.date || item.label.trim().length < 2)
      || new Set(uniqueDates).size !== uniqueDates.length) return;
    mutation.mutate({ weekdays:[...weekdays].sort((a,b)=>a-b),
      overrides:overrides.map(item=>({ ...item,label:item.label.trim() })), reason:reason.trim() });
  };
  const buttonClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-40";
  return <>
    <AttendanceRolloutPolicy />
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
    <div className="mb-4 flex items-start gap-3">
      <span className="rounded-lg bg-primary/10 p-2 text-primary"><CalendarDays className="size-5"/></span>
      <div><h3 className="text-base font-bold">Instructional days, holidays & make-up days</h3>
        <p className="mt-1 text-xs text-muted-foreground">Choose the working days for each term. A holiday or closure excludes a date; a make-up day includes it even on a weekend. Every change requires an audit reason.</p>
      </div>
    </div>
    <div className="mb-4 max-w-sm">
      <label className="mb-1 block text-xs font-semibold">Academic term</label>
      <Select value={termId} onValueChange={setChosenTerm}>
        <SelectTrigger aria-label="Select academic term"><SelectValue placeholder="Choose a term"/></SelectTrigger>
        <SelectContent>{terms.map(item=><SelectItem key={item.id} value={item.id}>{item.yearName} · {item.name}</SelectItem>)}</SelectContent>
      </Select>
    </div>
    {query.isPending ? <p className="text-sm text-muted-foreground">Loading calendar…</p>
      : query.isError ? <p role="alert" className="text-sm text-destructive">Calendar could not be loaded: {query.error.message}</p>
      : <div className="space-y-4">
        <p className="text-xs text-muted-foreground">Term dates: {term?.startDate.slice(0,10)} to {term?.endDate.slice(0,10)} · Calendar revision {loadedRevision ?? "—"}</p>
        <div><p className="mb-2 text-xs font-bold">Weekly instructional days</p>
          <div className="flex flex-wrap gap-2">{DAYS.map(day=><label key={day.id}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs">
            <input type="checkbox" checked={weekdays.includes(day.id)}
              onChange={event=>setWeekdays(prev=>event.target.checked?[...prev,day.id]:prev.filter(n=>n!==day.id))}
              className="accent-primary"/>{day.label}</label>)}</div>
        </div>
        <div><div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-bold">Date-specific overrides</p>
          <button type="button" className={buttonClass} onClick={()=>setOverrides(prev=>[...prev,{date:"",label:"",isInstructional:false}])}>
            <Plus className="size-3.5"/> Add date
          </button>
        </div>
        {!overrides.length&&<p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">No exceptions. The weekly policy applies to every date in this term.</p>}
        <div className="space-y-2">{overrides.map((entry,index)=><div key={index} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-center">
          <DatePicker value={entry.date} onChange={v=>setOverrides(prev=>prev.map((row,i)=>i===index?{...row,date:v}:row))}/>
          <input aria-label="Reason or holiday name" placeholder="e.g. Founders' Day" maxLength={160}
            value={entry.label} onChange={e=>setOverrides(prev=>prev.map((row,i)=>i===index?{...row,label:e.target.value}:row))}
            className="min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-xs"/>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={entry.isInstructional}
            onChange={e=>setOverrides(prev=>prev.map((row,i)=>i===index?{...row,isInstructional:e.target.checked}:row))}
            className="accent-primary"/> Make-up instructional day</label>
          <button type="button" title="Remove override" aria-label="Remove override" className={buttonClass}
            onClick={()=>setOverrides(prev=>prev.filter((_,i)=>i!==index))}><Trash2 className="size-4"/></button>
        </div>)}</div></div>
        <div><label htmlFor="calendar-change-reason" className="mb-1 block text-xs font-bold">Reason for change (required)</label>
          <textarea id="calendar-change-reason" rows={2} maxLength={400}
            value={reason} onChange={e=>setReason(e.target.value)} placeholder="Explain the timetable or holiday adjustment"
            className="w-full rounded-lg border border-input bg-background p-3 text-sm"/></div>
        {mutation.isError&&<p role="alert" className="text-xs text-destructive">{mutation.error.message}</p>}
        {mutation.isSuccess&&<p role="status" className="text-xs text-success">Calendar changes saved and audited.</p>}
        <div className="flex justify-end"><button type="button" onClick={save}
          disabled={mutation.isPending||query.isFetching||!weekdays.length||reason.trim().length<8||overrides.some(o=>!o.date||o.label.trim().length<2)||new Set(overrides.map(x=>x.date)).size!==overrides.length}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
          <Save className="size-4"/>{mutation.isPending?"Saving…":"Save instructional calendar"}</button></div>
        <p className="text-xs text-muted-foreground">Approved reports lock this term against direct calendar changes. Individual pupil exclusions are handled by the authorised attendance administration workflow.</p>
      </div>}
  </section></>;
}
