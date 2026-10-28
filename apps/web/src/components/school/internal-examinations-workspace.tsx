import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpenCheck, CheckCheck, ClipboardList, LockKeyhole, Plus } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useSchoolRole } from "@/components/school/school-role-switcher";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ExamSession = {
  id:string; name:string; mockNumber:number; status:"DRAFT"|"OPEN"|"LOCKED";
  class:{id:string;name:string;level:string};
  academicYear:{name:string};term:{name:string};
  papers:{id:string;subjectId:string;nameSnapshot:string;codeSnapshot:string;maxMarks:string|number;finalizedAt:string|null}[];
  _count:{candidates:number};
};
type MockClass = {id:string;name:string;level:string;isGraduatingClass:boolean;isActive:boolean};
type Pupil = {id:string;name:string;admissionNumber:string|null;marks:number|null;
  status:"MARKED"|"ABSENT"|null;version:number;percentage:number|null};
type Sheet = {paper:{id:string;name:string;code:string;maxMarks:number;finalizedAt:string|null};
  session:{id:string;name:string;status:"DRAFT"|"OPEN"|"LOCKED"};canEdit:boolean;candidates:Pupil[]};
type Draft = {marks:string;absent:boolean};
const style="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground";
const button="rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-40";
const primary="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40";
function failure(error:unknown){return error instanceof Error?error.message:"This action could not be completed."}

/** Internal examinations are deliberately separate from SBA and BECE results. */
export function InternalExaminationsWorkspace() {
  const {activeRole} = useSchoolRole();
  const manager = ["owner","admin","headteacher"].includes(activeRole??"");
  const client=useQueryClient();
  const sessions=useQuery({queryKey:["internal-exams"],queryFn:()=>apiFetch<ExamSession[]>("/internal-exams"),retry:false});
  const classes=useQuery({queryKey:["internal-exams","classes"],
    queryFn:()=>apiFetch<MockClass[]>("/academics/classes"),enabled:manager,retry:false});
  const [selectedSession,setSelectedSession]=useState("");
  const [selectedPaper,setSelectedPaper]=useState("");
  const [selectedClass,setSelectedClass]=useState("");
  const [drafts,setDrafts]=useState<Record<string,Draft>>({});
  const [notice,setNotice]=useState<string|null>(null);
  const exams=sessions.data??[];
  const current=exams.find(v=>v.id===selectedSession)??exams[0];
  const papers=current?.papers??[];
  const paper=papers.find(v=>v.id===selectedPaper)??papers[0];
  const sheet=useQuery({queryKey:["internal-exams","paper",paper?.id],
    queryFn:()=>apiFetch<Sheet>("/internal-exams/papers/"+encodeURIComponent(paper!.id)),
    enabled:Boolean(paper?.id),retry:false});
  useEffect(()=>{
    if(!sheet.data)return;
    setDrafts(Object.fromEntries(sheet.data.candidates.map(row=>[row.id,{
      marks:row.marks===null?"":String(row.marks),
      absent:row.status==="ABSENT",
    }])));
  },[sheet.data]);
  const refresh=async()=>{
    await client.invalidateQueries({queryKey:["internal-exams"]});
  };
  const create=useMutation({
    mutationFn:(classId:string)=>apiFetch<{name:string}>("/internal-exams/mocks",{
      method:"POST",body:JSON.stringify({classId}),
    }),
    onSuccess:async(result)=>{setNotice(result.name+" was created. Open it to allow assigned subject teachers to enter marks.");await refresh();},
  });
  const updateSession=useMutation({
    mutationFn:({id,operation}:{id:string;operation:"open"|"lock"})=>
      apiFetch("/internal-exams/"+encodeURIComponent(id)+"/"+operation,{method:"PATCH"}),
    onSuccess:async()=>{setNotice("Mock examination status updated.");await refresh();},
  });
  const candidates=sheet.data?.candidates??[];
  const changes=useMemo(()=>{
    return candidates.flatMap(row=>{
      const item=drafts[row.id];
      if(!item)return [];
      const mark=item.absent?null:item.marks.trim()?Number(item.marks):null;
      if(!item.absent&&mark===null)return [];
      const status=item.absent?"ABSENT" as const:"MARKED" as const;
      if(row.status===status && row.marks===mark)return [];
      return [{candidateId:row.id,status,marks:mark,expectedVersion:row.version}];
    });
  },[candidates,drafts]);
  const invalid=changes.some(item=>item.marks!==null&&(
    !Number.isFinite(item.marks)||item.marks<0||item.marks>(sheet.data?.paper.maxMarks??100)
    ||Math.abs(Math.round(item.marks*100)-item.marks*100)>1e-7));
  const save=useMutation({
    mutationFn:()=>apiFetch("/internal-exams/marks",{
      method:"PUT",body:JSON.stringify({paperId:sheet.data!.paper.id,entries:changes}),
    }),
    onSuccess:async()=>{setNotice("Mock marks saved with an audit history.");await client.invalidateQueries({
      queryKey:["internal-exams","paper",paper?.id],
    });},
  });
  const finalize=useMutation({
    mutationFn:()=>apiFetch("/internal-exams/papers/"+encodeURIComponent(paper!.id)+"/finalize",{
      method:"PATCH",
    }),
    onSuccess:async()=>{setNotice("Subject paper finalised and locked.");await refresh();await client.invalidateQueries({
      queryKey:["internal-exams","paper",paper?.id],
    });},
  });

  return <div className="space-y-5">
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-primary/10 p-3 text-primary"><BookOpenCheck className="size-5"/></span>
        <div><h2 className="text-xl font-bold">Examinations · Internal</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Individually numbered JHS 3 mock examinations. Scores here are independent
            of termly SBA and official external BECE records. Absent pupils are recorded
            explicitly and are never given an invented zero mark.
          </p>
        </div>
      </div>
    </section>
    {manager && <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <h3 className="flex items-center gap-2 text-sm font-bold"><Plus className="size-4"/> Prepare next mock</h3>
      <p className="text-xs text-muted-foreground">Creating a mock freezes this term's
        JHS 3 candidate list and assigned subject papers. The next number is allocated automatically,
        avoiding duplicated Mock 1 or Mock 2 sessions.</p>
      {classes.isError&&<p role="alert" className="text-xs text-destructive">{failure(classes.error)}</p>}
      <div className="flex flex-wrap gap-2">
        <div className="min-w-52 flex-1"><Select value={selectedClass} onValueChange={setSelectedClass}>
          <SelectTrigger aria-label="Choose graduating class"><SelectValue placeholder="Choose JHS 3 class"/></SelectTrigger>
          <SelectContent>{(classes.data??[]).filter(row=>row.isActive&&(row.isGraduatingClass||/^JHS\s*3$/i.test(row.level)))
            .map(row=><SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>)}</SelectContent>
        </Select></div>
        <button type="button" className={primary} disabled={!selectedClass||create.isPending}
          onClick={()=>create.mutate(selectedClass)}>{create.isPending?"Creating…":"Create next mock"}</button>
      </div>
      {create.isError&&<p role="alert" className="text-xs text-destructive">{failure(create.error)}</p>}
    </section>}
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start gap-2"><ClipboardList className="size-5 text-primary"/>
        <div><h3 className="text-base font-bold">Mock examination register</h3>
          <p className="text-xs text-muted-foreground">Subject teachers enter and finalise
            their assigned papers. Management can open a draft or lock a fully finalised session.</p>
        </div></div>
      {sessions.isPending&&<p className="text-sm text-muted-foreground">Loading mock examinations…</p>}
      {sessions.isError&&<p role="alert" className="text-sm text-destructive">{failure(sessions.error)}</p>}
      {!sessions.isPending&&!exams.length&&<p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        No mock examinations are available for your classes.</p>}
      {exams.length>0&&<>
        <div className="grid gap-2 md:grid-cols-2">
          <div><label className="mb-1 block text-xs font-semibold">Examination session</label>
            <Select value={current?.id??""} onValueChange={v=>{setSelectedSession(v);setSelectedPaper("");setNotice(null)}}>
              <SelectTrigger><SelectValue placeholder="Choose mock"/></SelectTrigger>
              <SelectContent>{exams.map(s=><SelectItem key={s.id} value={s.id}>
                {s.name} · {s.class.name} · {s.academicYear.name}</SelectItem>)}</SelectContent>
            </Select></div>
          <div><label className="mb-1 block text-xs font-semibold">Subject paper</label>
            <Select value={paper?.id??""} onValueChange={setSelectedPaper}>
              <SelectTrigger><SelectValue placeholder="Choose subject"/></SelectTrigger>
              <SelectContent>{papers.map(p=><SelectItem key={p.id} value={p.id}>
                {p.codeSnapshot} · {p.nameSnapshot}{p.finalizedAt?" (Finalised)":""}</SelectItem>)}</SelectContent>
            </Select></div>
        </div>
        {current&&<div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/40 p-3 text-xs">
          <span className="font-bold">{current.name} · {current.class.name}</span>
          <span>{current._count.candidates} candidates</span>
          <span>{papers.filter(p=>p.finalizedAt).length}/{papers.length} finalised papers</span>
          <span className="font-semibold">{current.status}</span>
          {manager&&current.status==="DRAFT"&&<button type="button" className={primary}
            disabled={updateSession.isPending}
            onClick={()=>updateSession.mutate({id:current.id,operation:"open"})}>Open mark entry</button>}
          {manager&&current.status==="OPEN"&&<button type="button" className={button}
            disabled={updateSession.isPending||!papers.length||papers.some(p=>!p.finalizedAt)}
            onClick={()=>updateSession.mutate({id:current.id,operation:"lock"})}>
            <LockKeyhole className="mr-1 inline size-3.5"/> Lock completed mock</button>}
        </div>}
      </>}
      {sheet.isPending&&paper&&<p className="text-sm text-muted-foreground">Loading pupil marks…</p>}
      {sheet.isError&&<p role="alert" className="text-xs text-destructive">{failure(sheet.error)}</p>}
      {sheet.data&&<div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Maximum {sheet.data.paper.maxMarks} marks ·
          {sheet.data.canEdit?" Entry open for your assigned subject.":" Read-only subject paper."}
        </p>
        <div className="max-h-[600px] overflow-auto rounded-xl border border-border">
          <table className="w-full min-w-[540px] text-left text-xs">
            <thead className="sticky top-0 bg-muted"><tr>
              <th className="p-3">Pupil</th><th className="p-3">Marks</th><th className="p-3">Absent</th>
              <th className="p-3">Percentage</th><th className="p-3">Saved</th>
            </tr></thead>
            <tbody>{candidates.map(row=>{
              const draft=drafts[row.id]??{marks:"",absent:false};
              return <tr key={row.id} className="border-t border-border">
                <td className="p-3"><div className="font-semibold">{row.name}</div>
                  <div className="text-muted-foreground">{row.admissionNumber??"—"}</div></td>
                <td className="p-3"><input aria-label={`Marks for ${row.name}`}
                  className={style+" max-w-28"} type="number" min="0" max={sheet.data!.paper.maxMarks}
                  step="0.01" disabled={!sheet.data!.canEdit||draft.absent}
                  value={draft.marks} onChange={e=>setDrafts(prev=>({
                    ...prev,[row.id]:{...draft,marks:e.target.value},
                  }))}/></td>
                <td className="p-3"><input type="checkbox" aria-label={`Absent: ${row.name}`}
                  checked={draft.absent} disabled={!sheet.data!.canEdit}
                  onChange={e=>setDrafts(prev=>({
                    ...prev,[row.id]:{marks:e.target.checked?"":draft.marks,absent:e.target.checked},
                  }))}/></td>
                <td className="p-3">{draft.absent?"Absent":
                  draft.marks.trim()? `${(Number(draft.marks)/sheet.data!.paper.maxMarks*100).toFixed(1)}%` : "—"}</td>
                <td className="p-3">{row.status==="ABSENT"?"Absent":row.marks===null?"Unmarked":row.marks}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        {sheet.data.canEdit&&<div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {changes.length} changes · {candidates.filter(row=>row.status===null).length} pupils not yet recorded.
          </div>
          <div className="flex gap-2">
            <button type="button" className={button} disabled={finalize.isPending||save.isPending||
              changes.length>0||candidates.some(row=>row.status===null)}
              onClick={()=>finalize.mutate()}>
              <CheckCheck className="mr-1 inline size-3"/> Finalise subject paper
            </button>
            <button type="button" className={primary}
              disabled={save.isPending||finalize.isPending||invalid||!changes.length||changes.length>120}
              onClick={()=>save.mutate()}>{save.isPending?"Saving…":"Save mock marks"}</button>
          </div>
        </div>}
        {invalid&&<p role="alert" className="text-xs text-destructive">
          Every recorded score must be between zero and the paper maximum, with at most two decimals.</p>}
        {save.isError&&<p role="alert" className="text-xs text-destructive">{failure(save.error)}</p>}
        {finalize.isError&&<p role="alert" className="text-xs text-destructive">{failure(finalize.error)}</p>}
      </div>}
      {updateSession.isError&&<p role="alert" className="text-xs text-destructive">{failure(updateSession.error)}</p>}
      {notice&&<p role="status" className="rounded-lg bg-muted p-3 text-xs">{notice}</p>}
    </section>
    <p className="text-xs text-muted-foreground">This phase records and locks mock scores.
      Publishing signed Mock 1/Mock 2 reports requires the separate report-approval and release workflow;
      locked marks are not automatically visible to pupils or guardians.</p>
  </div>;
}
