import {useState} from "react";
import {useMutation,useQuery,useQueryClient} from "@tanstack/react-query";
import {apiFetch} from "@/lib/api";
import {useSchoolRole} from "@/components/school/school-role-switcher";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";

type Report={id:string;candidateId:string;version:number;stage:string;snapshot:{
  pupil:{name:string};papers:{id:string;name:string;code:string;status:"MARKED"|"ABSENT";
    mark:number|null;maxMarks:number}[];
}};
type Correction={id:string;candidateId:string;paperId:string;status:"PENDING"|"APPLIED"|"REJECTED";
  requestedStatus:"MARKED"|"ABSENT";requestedMarks:string|null;reason:string;requestedAt:string;
  reviewedAt:string|null;reviewReason:string|null;requestedById:string|null;
  candidate:{nameSnapshot:string};paper:{nameSnapshot:string}};
const input="w-full rounded-lg border border-input bg-background p-2 text-xs";
const action="rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold disabled:opacity-50";
export function MockCorrectionWorkspace({sessionId,reports}:{sessionId:string;reports:Report[]}){
  const {activeRole}=useSchoolRole();
  const qc=useQueryClient();
  const [candidateId,setCandidateId]=useState("");
  const [paperId,setPaperId]=useState("");
  const [status,setStatus]=useState<"MARKED"|"ABSENT">("MARKED");
  const [marks,setMarks]=useState("");
  const [reason,setReason]=useState("");
  const [decisionReason,setDecisionReason]=useState<Record<string,string>>({});
  const [notice,setNotice]=useState("");
  const corrections=useQuery({queryKey:["mock-corrections",sessionId],
    queryFn:()=>apiFetch<Correction[]>("/internal-exams/"+encodeURIComponent(sessionId)+"/corrections"),
    retry:false});
  const report=reports.find(r=>r.candidateId===candidateId);
  const paper=report?.snapshot.papers.find(p=>p.id===paperId);
  const pending=corrections.data?.find(r=>r.status==="PENDING");
  const ready=reports.length>0&&reports.every(r=>r.stage==="PUBLISHED");
  const refresh=async()=>{
    await Promise.all([
      qc.invalidateQueries({queryKey:["mock-corrections",sessionId]}),
      qc.invalidateQueries({queryKey:["mock-report-review",sessionId]}),
    ]);
  };
  const submit=useMutation({mutationFn:()=>apiFetch("/internal-exams/"+
    encodeURIComponent(sessionId)+"/corrections",{method:"POST",body:JSON.stringify({
      candidateId,paperId,status,marks:status==="ABSENT"?null:marks.trim()?Number(marks):null,
      expectedVersion:report?.version,reason:reason.trim(),
    })}),onSuccess:async()=>{setReason("");setNotice("Correction request recorded for independent headteacher decision.");await refresh();}});
  const decide=useMutation({mutationFn:({id,approve,reviewReason}:{id:string;approve:boolean;reviewReason:string})=>
    apiFetch("/internal-exams/corrections/"+encodeURIComponent(id)+(approve?"/approve":"/reject"),{
      method:"POST",body:JSON.stringify({reason:reviewReason}),
    }),onSuccess:async()=>{
      setNotice("Decision recorded. If approved, the whole class receives new draft report versions for fresh approval.");
      await refresh();
    }});
  const canRequest=["owner","admin","headteacher","teacher"].includes(activeRole??"");
  const canReview=activeRole==="headteacher";
  const invalid=status==="MARKED"&&(
    !marks.trim()||!Number.isFinite(Number(marks))||Number(marks)<0||
    Number(marks)>(paper?.maxMarks??100)||
    Math.abs(Math.round(Number(marks)*100)-Number(marks)*100)>1e-7
  );
  if(!reports.length)return null;
  return <section className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
    <div><h4 className="text-sm font-bold">Controlled mock corrections and reissues</h4>
      <p className="mt-1 text-xs text-muted-foreground">
        Previously published results cannot be overwritten. A correction needs an
        audit reason, approval by a different headteacher, and fresh class-teacher
        and headteacher sign-offs on every affected class report. Ranking is
        recalculated across the whole class, and previous PDFs remain retained.
      </p></div>
    {corrections.isError&&<p role="alert" className="text-xs text-destructive">{corrections.error.message}</p>}
    {corrections.isPending&&<p className="text-xs text-muted-foreground">Loading correction history…</p>}
    {canRequest&&ready&&!pending&&<div className="space-y-3 rounded-lg border border-border bg-card p-3">
      <p className="text-xs font-bold">Propose correction to a published mock score</p>
      <Select value={candidateId} onValueChange={v=>{setCandidateId(v);setPaperId("");setMarks("");}}>
        <SelectTrigger aria-label="Pupil to correct"><SelectValue placeholder="Choose pupil"/></SelectTrigger>
        <SelectContent>{reports.map(r=><SelectItem key={r.id} value={r.candidateId}>{r.snapshot.pupil.name}</SelectItem>)}</SelectContent>
      </Select>
      {report&&<Select value={paperId} onValueChange={v=>{setPaperId(v);setMarks("");}}>
        <SelectTrigger aria-label="Subject to correct"><SelectValue placeholder="Choose subject"/></SelectTrigger>
        <SelectContent>{report.snapshot.papers.map(p=><SelectItem key={p.id} value={p.id}>
          {p.name} · {p.status==="ABSENT"?"Absent":p.mark+"/"+p.maxMarks}
        </SelectItem>)}</SelectContent>
      </Select>}
      {paper&&<div className="grid gap-3 sm:grid-cols-2">
        <div><label className="mb-1 block text-xs font-semibold">Corrected result</label>
          <Select value={status} onValueChange={v=>setStatus(v as "MARKED"|"ABSENT")}>
            <SelectTrigger><SelectValue/></SelectTrigger><SelectContent>
              <SelectItem value="MARKED">Recorded score</SelectItem><SelectItem value="ABSENT">Absent — no score</SelectItem>
            </SelectContent></Select></div>
        <div><label htmlFor="corrected-mark" className="mb-1 block text-xs font-semibold">New mark (maximum {paper.maxMarks})</label>
          <input id="corrected-mark" type="number" min="0" max={paper.maxMarks} step="0.01"
            disabled={status==="ABSENT"} value={marks} onChange={e=>setMarks(e.target.value)} className={input}/>
        </div></div>}
      <textarea aria-label="Correction request reason" value={reason}
        onChange={e=>setReason(e.target.value)} maxLength={2000} rows={2}
        className={input} placeholder="Explain the verified marking or recording error (10 characters minimum)"/>
      <button type="button" className={action}
        disabled={!paper||!report||invalid||reason.trim().length<10||submit.isPending}
        onClick={()=>submit.mutate()}>Request independent correction approval</button>
      {submit.isError&&<p role="alert" className="text-xs text-destructive">{submit.error.message}</p>}
    </div>}
    {pending&&<p className="rounded-lg border border-border bg-card p-3 text-xs">
      One correction is awaiting review. Further changes are disabled until that request is decided.</p>}
    <div className="space-y-2">
      <h5 className="text-xs font-bold">Correction history</h5>
      {!corrections.isPending&&corrections.data?.length===0&&
        <p className="text-xs text-muted-foreground">No correction requests recorded.</p>}
      {corrections.data?.map(item=><article key={item.id} className="space-y-2 rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold">{item.candidate.nameSnapshot} · {item.paper.nameSnapshot}</span>
          <span className="rounded bg-muted px-2 py-1 text-xs font-semibold">{item.status}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Proposed: {item.requestedStatus==="ABSENT"?"Absent":String(item.requestedMarks)+" marks"} · {item.reason}
        </p>
        {item.reviewReason&&<p className="text-xs text-muted-foreground">Decision reason: {item.reviewReason}</p>}
        {item.status==="PENDING"&&canReview&&<div className="space-y-2">
          <textarea aria-label={"Independent review reason for "+item.candidate.nameSnapshot}
            className={input} rows={2} maxLength={2000}
            value={decisionReason[item.id]??""}
            onChange={e=>setDecisionReason(v=>({...v,[item.id]:e.target.value}))}
            placeholder="Reason for approving or rejecting the proposed correction"/>
          <div className="flex gap-2">
            <button type="button" className={action}
              disabled={(decisionReason[item.id]??"").trim().length<10||decide.isPending}
              onClick={()=>decide.mutate({id:item.id,approve:true,reviewReason:decisionReason[item.id]!.trim()})}>
              Approve and create revised reports</button>
            <button type="button" className={action}
              disabled={(decisionReason[item.id]??"").trim().length<10||decide.isPending}
              onClick={()=>decide.mutate({id:item.id,approve:false,reviewReason:decisionReason[item.id]!.trim()})}>
              Reject request</button>
          </div></div>}
      </article>)}
    </div>
    {decide.isError&&<p role="alert" className="text-xs text-destructive">{decide.error.message}</p>}
    {notice&&<p role="status" className="text-xs text-muted-foreground">{notice}</p>}
  </section>;
}
