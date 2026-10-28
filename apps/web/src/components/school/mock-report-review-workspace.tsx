import { useState } from "react";
import { useMutation,useQuery,useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { MockCorrectionWorkspace } from "./mock-correction-workspace";
import { useSchoolRole } from "@/components/school/school-role-switcher";
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";
type GradeSystem={id:string;name:string;isSchoolDefault:boolean;isSystemDefault:boolean;
  gradeScales:{grade:string;min:number;max:number;description:string}[]};
type Snapshot={name:string;pupil:{name:string;admissionNumber:string|null};
  papers:{id:string;name:string;code:string;status:"MARKED"|"ABSENT";mark:number|null;maxMarks:number;percentage:number|null;grade:string|null}[];
  average:number|null;position:number|null;grading:{name:string}};
type Report={id:string;candidateId:string;stage:string;version:number;integrityOk:boolean;
  snapshot:Snapshot;teacherName:string|null;teacherRemark:string|null;headName:string|null;
  headRemark:string|null};
type Review={session:{id:string;name:string;status:string};expected:number;
  generated:number;reports:Report[]};
const button="rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold disabled:opacity-40";
const primary="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-40";
export function MockReportReviewWorkspace({sessionId,status}:{sessionId:string;status:string}) {
  const {activeRole}=useSchoolRole();
  const manager=["owner","admin","headteacher"].includes(activeRole??"");
  const isTeacher=activeRole==="teacher";
  const client=useQueryClient();
  const [gradingId,setGradingId]=useState("");
  const [remarks,setRemarks]=useState<Record<string,string>>({});
  const [message,setMessage]=useState("");
  const grading=useQuery({queryKey:["mock-grade-systems"],
    queryFn:()=>apiFetch<GradeSystem[]>("/internal-exams/grading-systems"),
    enabled:manager,retry:false});
  const review=useQuery({queryKey:["mock-report-review",sessionId],
    queryFn:()=>apiFetch<Review>("/internal-exams/"+encodeURIComponent(sessionId)+"/reports"),
    enabled:Boolean(sessionId),retry:false});
  const selected=gradingId||grading.data?.find(x=>x.isSchoolDefault)?.id||
    grading.data?.find(x=>x.isSystemDefault)?.id||"";
  const invalidate=async()=>{
    await client.invalidateQueries({queryKey:["mock-report-review",sessionId]});
    await client.invalidateQueries({queryKey:["internal-exams"]});
  };
  const generation=useMutation({
    mutationFn:()=>apiFetch("/internal-exams/"+encodeURIComponent(sessionId)+"/reports/generate",{
      method:"POST",body:JSON.stringify({gradingSystemId:selected}),
    }),
    onSuccess:async()=>{setMessage("Versioned mock reports generated from frozen results.");await invalidate();},
  });
  const approve=useMutation({
    mutationFn:({id,method,path,remark}:{id:string;method:"POST"|"PATCH";path:string;remark:string})=>
      apiFetch("/internal-exams/reports/"+encodeURIComponent(id)+path,{
        method,body:JSON.stringify({remark}),
      }),
    onSuccess:async()=>{setMessage("Approval recorded with an audit trail.");await invalidate();},
  });
  const publish=useMutation({
    mutationFn:()=>apiFetch("/internal-exams/"+encodeURIComponent(sessionId)+"/reports/publish",{method:"POST"}),
    onSuccess:async()=>{setMessage("Approved Mock reports released to authorised pupils and guardians.");await invalidate();},
  });
  if(!sessionId)return null;
  const rows=review.data?.reports??[];
  const approved=rows.filter(x=>x.stage==="APPROVED"||x.stage==="PUBLISHED").length;
  const ready=rows.length>0&&rows.length===review.data?.expected&&rows.every(x=>x.stage==="APPROVED"&&x.integrityOk);
  return <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
    <div><h3 className="text-base font-bold">Mock results and independent approvals</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Results are frozen from the locked mock; class teacher and headteacher recommendations are
        separate. Electronic approvals appear on school-issued PDFs after publication.
      </p>
    </div>
    {review.isPending&&<p className="text-xs text-muted-foreground">Checking mock report versions…</p>}
    {review.isError&&<p role="alert" className="text-xs text-destructive">{review.error.message}</p>}
    {manager&&status==="LOCKED"&&!rows.length&&<div className="space-y-3 rounded-xl border border-border p-3">
      <p className="text-xs font-semibold">Generate mock reports using a school-approved grade scale</p>
      <p className="text-xs text-muted-foreground">
        Bands are frozen into every report. Grade lookup rounds each subject percentage
        to the nearest whole percentage point. Position uses competition ranking
        (joint 1st, joint 1st, 3rd); incomplete/absent subject results are unranked.
      </p>
      {grading.isError&&<p role="alert" className="text-xs text-destructive">{grading.error.message}</p>}
      <Select value={selected} onValueChange={setGradingId}>
        <SelectTrigger aria-label="Mock grading policy"><SelectValue placeholder="Choose grading system"/></SelectTrigger>
        <SelectContent>{grading.data?.map(g=><SelectItem key={g.id} value={g.id}>
          {g.name}{g.isSchoolDefault?" (school default)":""}</SelectItem>)}</SelectContent>
      </Select>
      <button type="button" className={primary} disabled={!selected||generation.isPending}
        onClick={()=>generation.mutate()}>Generate frozen mock reports</button>
    </div>}
    {review.data&&rows.length>0&&<>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {review.data.generated} / {review.data.expected} pupils generated · {approved} approved
        </p>
        {manager&&status==="LOCKED"&&<button type="button" className={primary}
          disabled={!ready||publish.isPending}
          onClick={()=>publish.mutate()}>Publish all approved mock reports</button>}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">{rows.map(row=>{
        const remark=remarks[row.id]??"";
        const doTeacher=isTeacher&&row.stage==="GENERATED";
        const doHead=activeRole==="headteacher"&&row.stage==="TEACHER_REVIEWED";
        return <article key={row.id} className="space-y-2 rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">{row.snapshot.pupil.name}</h4>
            <span className="rounded bg-muted px-2 py-1 text-xs">{row.stage.replaceAll("_"," ")} · v{row.version}</span>
          </div>
          {!row.integrityOk&&<p role="alert" className="text-xs text-destructive">Source integrity check failed. Do not approve.</p>}
          <p className="text-xs text-muted-foreground">
            {row.snapshot.papers.map(p=>p.name+": "+(p.status==="ABSENT"?"Absent":p.percentage+"% ("+p.grade+")")).join(" · ")}
          </p>
          <p className="text-xs font-semibold">Average {row.snapshot.average??"Unranked"}{row.snapshot.average!==null?"%":""}
            {" · "}Position {row.snapshot.position??"—"}</p>
          {row.teacherRemark&&<p className="text-xs">Class teacher ({row.teacherName}): {row.teacherRemark}</p>}
          {row.headRemark&&<p className="text-xs">Headteacher ({row.headName}): {row.headRemark}</p>}
          {(doTeacher||doHead)&&<div className="space-y-2">
            <textarea aria-label={"Recommendation for "+row.snapshot.pupil.name}
              className="min-h-20 w-full rounded-lg border border-input bg-background p-2 text-xs"
              maxLength={2000} value={remark}
              onChange={e=>setRemarks(v=>({...v,[row.id]:e.target.value}))}
              placeholder={doTeacher?"Class-teacher recommendation":"Headteacher recommendation"}/>
            <button type="button" className={button} disabled={!row.integrityOk||remark.trim().length<10||approve.isPending}
              onClick={()=>approve.mutate({id:row.id,
                path:doTeacher?"/recommend":"/head-approve",method:doTeacher?"POST":"PATCH",
                remark:remark.trim(),
              })}>{doTeacher?"Submit class-teacher recommendation":"Approve as headteacher"}</button>
          </div>}
        </article>;
      })}</div>
    </>}
    {review.data && <MockCorrectionWorkspace sessionId={sessionId} reports={rows} />}
    {(generation.isError||approve.isError||publish.isError)&&
      <p role="alert" className="text-xs text-destructive">
        {(generation.error??approve.error??publish.error)?.message}</p>}
    {message&&<p role="status" className="text-xs text-muted-foreground">{message}</p>}
  </section>;
}
