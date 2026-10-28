import {useEffect,useMemo,useState} from "react";
import {useMutation,useQuery,useQueryClient} from "@tanstack/react-query";
import {BookOpenCheck,LockKeyhole,ShieldCheck} from "lucide-react";
import {apiFetch} from "@/lib/api";
import {ExternalBeceImportWorkspace} from "./external-bece-import-workspace";
import {useSchoolRole} from "@/components/school/school-role-switcher";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";

type Exam={
  id:string;name:string;examYear:number;status:"DRAFT"|"OPEN"|"LOCKED";
  class:{id:string;name:string;level:string};
  academicYear:{id:string;name:string};
  _count:{candidates:number;papers:number};
  papers:{id:string;subjectId:string;codeSnapshot:string;nameSnapshot:string}[];
};
type Year={id:string;name:string};
type SchoolClass={id:string;name:string;level:string;isGraduatingClass:boolean;academicYearId:string|null};
type Status="GRADED"|"ABSENT"|"WITHHELD"|"CANCELLED";
type Candidate={
  id:string;name:string;admissionNumber:string|null;indexNumber:string|null;indexVersion:number;
  status:Status|null;grade:number|null;version:number;sourceReference:string|null;
};
type Sheet={
  paper:{id:string;name:string;code:string};
  session:{id:string;name:string;examYear:number;status:string};
  canEdit:boolean;candidates:Candidate[];
};
type Distribution={grade:number;count:number};
type Summary={
  id:string;name:string;source:"SCHOOL_ENTERED_UNVERIFIED";status:string;
  candidateCount:number;missingIndexNumbers:number;
  papers:{id:string;name:string;code:string;recorded:number;expected:number;pending:number;
    statuses:{GRADED:number;ABSENT:number;WITHHELD:number;CANCELLED:number};
    grades:Distribution[]}[];
};
type Draft={status:"UNRECORDED"|Status;grade:string;indexNumber:string};
const field="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground";
const button="rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold disabled:opacity-40";
const primary="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-40";
const label=(error:unknown)=>error instanceof Error?error.message:"Unable to complete this action.";

export function ExternalExaminationsWorkspace(){
  const {activeRole}=useSchoolRole();
  const manager=activeRole==="owner"||activeRole==="admin";
  const headteacher=activeRole==="headteacher";
  const client=useQueryClient();
  const [yearId,setYearId]=useState("");
  const [classId,setClassId]=useState("");
  const [examYear,setExamYear]=useState(String(new Date().getFullYear()));
  const [sessionId,setSessionId]=useState("");
  const [paperId,setPaperId]=useState("");
  const [sourceReference,setSourceReference]=useState("");
  const [drafts,setDrafts]=useState<Record<string,Draft>>({});
  const [notice,setNotice]=useState("");
  const sessions=useQuery({queryKey:["external-bece"],queryFn:()=>
    apiFetch<Exam[]>("/external-exams"),retry:false});
  const years=useQuery({queryKey:["external-bece","years"],queryFn:()=>
    apiFetch<Year[]>("/schools/academic-years"),enabled:manager,retry:false});
  const classes=useQuery({queryKey:["external-bece","classes"],queryFn:()=>
    apiFetch<SchoolClass[]>("/academics/classes"),enabled:manager,retry:false});
  const available=sessions.data??[];
  const current=available.find(x=>x.id===sessionId)??available[0];
  const paper=current?.papers.find(x=>x.id===paperId)??current?.papers[0];
  const sheet=useQuery({queryKey:["external-bece","sheet",paper?.id],queryFn:()=>
    apiFetch<Sheet>("/external-exams/papers/"+encodeURIComponent(paper!.id)),
    enabled:Boolean(paper?.id),retry:false});
  const summary=useQuery({queryKey:["external-bece","summary",current?.id],queryFn:()=>
    apiFetch<Summary>("/external-exams/"+encodeURIComponent(current!.id)+"/summary"),
    enabled:Boolean(current?.id),retry:false});
  useEffect(()=>{
    if(!sheet.data)return;
    setDrafts(Object.fromEntries(sheet.data.candidates.map(row=>[
      row.id,{status:row.status??"UNRECORDED",grade:row.grade===null?"":String(row.grade),
        indexNumber:row.indexNumber??""},
    ])));
  },[sheet.data]);
  const candidates=sheet.data?.candidates??[];
  const changes=useMemo(()=>candidates.flatMap(row=>{
    const draft=drafts[row.id];
    if(!draft||draft.status==="UNRECORDED")return [];
    const grade=draft.status==="GRADED"?(draft.grade.trim()?Number(draft.grade):null):null;
    if(row.status===draft.status&&row.grade===grade)return [];
    return [{candidateId:row.id,status:draft.status,grade,expectedVersion:row.version}];
  }),[candidates,drafts]);
  const invalid=changes.some(row=>row.status==="GRADED"&&(
    row.grade===null||!Number.isInteger(row.grade)||row.grade<1||row.grade>9));
  const refresh=async()=>{
    await client.invalidateQueries({queryKey:["external-bece"]});
  };
  const create=useMutation({mutationFn:()=>apiFetch("/external-exams/bece",{
    method:"POST",body:JSON.stringify({classId,academicYearId:yearId,examYear:Number(examYear)}),
  }),onSuccess:async()=>{setNotice("BECE register created with frozen candidates and subjects.");await refresh();}});
  const open=useMutation({mutationFn:()=>apiFetch("/external-exams/"+
    encodeURIComponent(current!.id)+"/open",{method:"PATCH"}),
    onSuccess:async()=>{setNotice("Register opened for authorised staff entry.");await refresh();}});
  const lock=useMutation({mutationFn:()=>apiFetch("/external-exams/"+
    encodeURIComponent(current!.id)+"/lock",{method:"PATCH"}),
    onSuccess:async()=>{setNotice("Headteacher attestation recorded. Register is now locked.");await refresh();}});
  const save=useMutation({mutationFn:()=>apiFetch("/external-exams/results",{
    method:"PUT",body:JSON.stringify({paperId:paper!.id,sourceReference:sourceReference.trim(),
      entries:changes}),
  }),onSuccess:async()=>{
    setNotice("BECE results recorded with source references and audit history.");
    await client.invalidateQueries({queryKey:["external-bece","sheet",paper?.id]});
    await client.invalidateQueries({queryKey:["external-bece","summary",current?.id]});
  }});
  const index=useMutation({mutationFn:({id,indexNumber,expectedVersion}:{
    id:string;indexNumber:string;expectedVersion:number})=>
      apiFetch("/external-exams/candidates/"+encodeURIComponent(id)+"/index",{
        method:"PUT",body:JSON.stringify({indexNumber,expectedVersion}),
      }),onSuccess:async()=>{
      setNotice("Candidate index number saved and audited.");
      await client.invalidateQueries({queryKey:["external-bece","sheet",paper?.id]});
      await client.invalidateQueries({queryKey:["external-bece","summary",current?.id]});
    }});
  const eligibleClasses=(classes.data??[]).filter(c=>
    (c.isGraduatingClass||/^JHS\s*3$/i.test(c.level))&&
    (!c.academicYearId||c.academicYearId===yearId));
  const completed=Boolean(summary.data&&
    summary.data.missingIndexNumbers===0&&summary.data.papers.length>0&&
    summary.data.papers.every(p=>p.pending===0));

  return <div className="space-y-5">
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start gap-3"><ShieldCheck className="size-6 text-primary"/>
        <div><h2 className="text-lg font-bold">Examinations · External (BECE)</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Authorised school staff only. These are results manually transcribed into the
            school's register, <strong>not independently verified by WAEC</strong>.
            No public BECE checker, family results or automatic national aggregate calculations.
          </p>
        </div>
      </div>
    </section>
    {manager&&<section className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <h3 className="text-sm font-bold">Create BECE year register</h3>
      <p className="text-xs text-muted-foreground">
        The graduating class's enrolled pupils and assigned subjects are frozen at creation.
        Use the intended examination year, including for historical school records.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Select value={yearId} onValueChange={v=>{setYearId(v);setClassId("");}}>
          <SelectTrigger aria-label="Academic year"><SelectValue placeholder="Academic year"/></SelectTrigger>
          <SelectContent>{years.data?.map(y=><SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={classId} onValueChange={setClassId}>
          <SelectTrigger aria-label="Graduating class"><SelectValue placeholder="JHS 3 class"/></SelectTrigger>
          <SelectContent>{eligibleClasses.map(c=><SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
        <input aria-label="BECE examination year" type="number" min="2000" max="2100"
          className={field} value={examYear} onChange={e=>setExamYear(e.target.value)}/>
      </div>
      {years.isError&&<p role="alert" className="text-xs text-destructive">{label(years.error)}</p>}
      {classes.isError&&<p role="alert" className="text-xs text-destructive">{label(classes.error)}</p>}
      <button type="button" className={primary}
        disabled={!yearId||!classId||!Number.isInteger(Number(examYear))||
          Number(examYear)<2000||Number(examYear)>2100||create.isPending}
        onClick={()=>create.mutate()}>Create staff-only BECE register</button>
      {create.isError&&<p role="alert" className="text-xs text-destructive">{label(create.error)}</p>}
    </section>}

    <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2"><BookOpenCheck className="size-5 text-primary"/>
        <h3 className="text-base font-bold">Staff BECE result register</h3></div>
      {sessions.isPending&&<p className="text-xs text-muted-foreground">Loading examination registers…</p>}
      {sessions.isError&&<p role="alert" className="text-xs text-destructive">{label(sessions.error)}</p>}
      {!sessions.isPending&&!available.length&&<p className="text-sm text-muted-foreground">
        There are no BECE registers available for your authorised school classes.</p>}
      {current&&<>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select value={current.id} onValueChange={v=>{setSessionId(v);setPaperId("");setNotice("");}}>
            <SelectTrigger aria-label="BECE register"><SelectValue placeholder="Choose register"/></SelectTrigger>
            <SelectContent>{available.map(e=><SelectItem key={e.id} value={e.id}>
              {e.name} · {e.class.name} · {e.academicYear.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={paper?.id??""} onValueChange={setPaperId}>
            <SelectTrigger aria-label="BECE subject paper"><SelectValue placeholder="Choose subject"/></SelectTrigger>
            <SelectContent>{current.papers.map(p=><SelectItem key={p.id} value={p.id}>
              {p.codeSnapshot} · {p.nameSnapshot}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/40 p-3 text-xs">
          <strong>{current.name}</strong><span>{current.class.name}</span>
          <span>{current._count.candidates} candidates</span><span>{current.status}</span>
          {manager&&current.status==="DRAFT"&&<button className={primary} type="button"
            disabled={open.isPending} onClick={()=>open.mutate()}>Open result entry</button>}
          {headteacher&&current.status==="OPEN"&&<button className={button} type="button"
            disabled={!completed||lock.isPending} onClick={()=>lock.mutate()}>
            <LockKeyhole className="mr-1 inline size-3.5"/> Attest and lock BECE register
          </button>}
        </div>
        {open.isError&&<p role="alert" className="text-xs text-destructive">{label(open.error)}</p>}
        {lock.isError&&<p role="alert" className="text-xs text-destructive">{label(lock.error)}</p>}

        {summary.data&&<div className="space-y-2">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-muted/40 p-3 text-xs">
              <strong className="block text-base">{summary.data.candidateCount}</strong> Candidates</div>
            <div className="rounded-lg bg-muted/40 p-3 text-xs">
              <strong className="block text-base">{summary.data.missingIndexNumbers}</strong> Missing index numbers</div>
            <div className="rounded-lg bg-muted/40 p-3 text-xs">
              <strong className="block text-base">{summary.data.papers.reduce((n,p)=>n+p.pending,0)}</strong>
              Unrecorded subject results</div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[650px] text-xs">
              <thead className="bg-muted text-left"><tr><th className="p-3">Subject</th>
                <th className="p-3">Recorded</th><th className="p-3">Pending</th>
                <th className="p-3">Grades 1–9 (counts)</th><th className="p-3">Other statuses</th></tr></thead>
              <tbody>{summary.data.papers.map(p=><tr key={p.id} className="border-t border-border">
                <td className="p-3 font-semibold">{p.code} · {p.name}</td>
                <td className="p-3">{p.recorded}/{p.expected}</td><td className="p-3">{p.pending}</td>
                <td className="p-3">{p.grades.map(g=>g.grade+":"+g.count).join(" · ")}</td>
                <td className="p-3">Absent {p.statuses.ABSENT} · Withheld {p.statuses.WITHHELD}
                  {" · "}Cancelled {p.statuses.CANCELLED}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Counts describe school-entered grades only. No unverified BECE aggregates, pass rates or WAEC verification claims.
          </p>
        </div>}

        {manager && paper && <ExternalBeceImportWorkspace key={current.id} sessionId={current.id}
          paperId={paper.id} status={current.status}/>}
        {sheet.isPending&&paper&&<p className="text-xs text-muted-foreground">Loading candidate sheet…</p>}
        {sheet.isError&&<p role="alert" className="text-xs text-destructive">{label(sheet.error)}</p>}
        {sheet.data&&<div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            BECE grades are whole numbers 1–9. Unrecorded differs from absence,
            withheld or cancelled. Candidate index numbers require administrator access.
          </p>
          <div className="max-h-[620px] overflow-auto rounded-lg border border-border">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="sticky top-0 bg-muted"><tr><th className="p-3">Candidate</th>
                <th className="p-3">WAEC index number</th><th className="p-3">Result status</th>
                <th className="p-3">Grade</th><th className="p-3">Saved record</th></tr></thead>
              <tbody>{candidates.map(c=>{
                const draft=drafts[c.id]??{status:"UNRECORDED",grade:"",indexNumber:c.indexNumber??""};
                return <tr key={c.id} className="border-t border-border align-top">
                  <td className="p-3"><strong>{c.name}</strong>
                    <span className="block text-muted-foreground">{c.admissionNumber??"—"}</span></td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <input aria-label={"Index number for "+c.name} className={field+" min-w-36"}
                        maxLength={60} value={draft.indexNumber}
                        disabled={!manager||sheet.data!.session.status!=="OPEN"}
                        onChange={e=>setDrafts(p=>({...p,[c.id]:{...draft,indexNumber:e.target.value}}))}/>
                      {manager&&sheet.data!.session.status==="OPEN"&&
                        <button type="button" className={button} disabled={index.isPending||
                          draft.indexNumber.trim().length<5||draft.indexNumber===c.indexNumber}
                          onClick={()=>index.mutate({id:c.id,indexNumber:draft.indexNumber.trim(),
                            expectedVersion:c.indexVersion})}>Save</button>}
                    </div>
                  </td>
                  <td className="p-3">
                    <Select value={draft.status} disabled={!sheet.data!.canEdit}
                      onValueChange={v=>setDrafts(p=>({...p,[c.id]:{...draft,status:v as Draft["status"],grade:v==="GRADED"?draft.grade:""}}))}>
                      <SelectTrigger aria-label={"Result status for "+c.name}><SelectValue/></SelectTrigger>
                      <SelectContent><SelectItem value="UNRECORDED">Unrecorded</SelectItem>
                        <SelectItem value="GRADED">Graded</SelectItem>
                        <SelectItem value="ABSENT">Absent</SelectItem>
                        <SelectItem value="WITHHELD">Withheld</SelectItem>
                        <SelectItem value="CANCELLED">Cancelled</SelectItem></SelectContent>
                    </Select>
                  </td>
                  <td className="p-3">
                    <input aria-label={"BECE grade for "+c.name} type="number" min="1" max="9" step="1"
                      className={field+" w-24"} disabled={!sheet.data!.canEdit||draft.status!=="GRADED"}
                      value={draft.grade} onChange={e=>setDrafts(p=>({...p,[c.id]:{...draft,grade:e.target.value}}))}/>
                  </td>
                  <td className="p-3">{c.status??"Unrecorded"}{c.grade!==null?" · "+c.grade:""}
                    <span className="block text-muted-foreground">v{c.version}</span></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          {sheet.data.canEdit&&<div className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1">
              <label htmlFor="bece-source-reference" className="mb-1 block text-xs font-semibold">
                Transcription source reference (required)</label>
              <input id="bece-source-reference" className={field} maxLength={200}
                placeholder="e.g. school-held 2026 result statement page 2"
                value={sourceReference} onChange={e=>setSourceReference(e.target.value)}/>
            </div>
            <button type="button" className={primary}
              disabled={save.isPending||invalid||changes.length===0||changes.length>120||
                sourceReference.trim().length<5}
              onClick={()=>save.mutate()}>Save {changes.length} result changes</button>
          </div>}
          {invalid&&<p role="alert" className="text-xs text-destructive">
            Graded candidates must have an integer grade from 1 to 9.</p>}
          {save.isError&&<p role="alert" className="text-xs text-destructive">{label(save.error)}</p>}
          {index.isError&&<p role="alert" className="text-xs text-destructive">{label(index.error)}</p>}
        </div>}
      </>}
      {notice&&<p role="status" className="rounded-lg bg-muted/40 p-3 text-xs">{notice}</p>}
    </section>
  </div>;
}
