import { useMarkDraft } from "@/hooks/use-mark-draft";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpenCheck, CheckCheck, ClipboardList, LockKeyhole, Plus } from "lucide-react";
import { BulkImportButton } from "@/components/bulk-import/bulk-import-button";
import { InternalExamMarksBulkImport } from "./internal-exam-marks-bulk-import";
import { apiFetch } from "@/lib/api";
import { MockReportReviewWorkspace } from "./mock-report-review-workspace";
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
type PaperSection = {id:string;subjectStrandId:string;name:string;code:string|null;maxMarks:number;weightPercent:number;canEdit:boolean};
type SectionMark = {sectionId:string;marks:number|null;status:"MARKED"|"ABSENT";version:number};
type Pupil = {id:string;name:string;admissionNumber:string|null;marks:number|null;
  status:"MARKED"|"ABSENT"|null;version:number;percentage:number|null;grade?:string|null;remark?:string|null;sectionMarks:SectionMark[]};
type Sheet = {paper:{id:string;name:string;code:string;maxMarks:number;finalizedAt:string|null;sections:PaperSection[]};
  session:{id:string;name:string;status:"DRAFT"|"OPEN"|"LOCKED"};canEdit:boolean;candidates:Pupil[];
  grading?:{name:string;source:"REPORT"|"SCHOOL_DEFAULT"|"SYSTEM_DEFAULT"}|null;gradingMessage?:string|null};
type Draft = {marks:string;absent:boolean;expectedVersion:number};
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
  const [selectedSectionId,setSelectedSectionId]=useState("");
  const [showImport,setShowImport]=useState(false);
  const [notice,setNotice]=useState<string|null>(null);
  const exams=sessions.data??[];
  const current=exams.find(v=>v.id===selectedSession)??exams[0];
  const papers=current?.papers??[];
  const paper=papers.find(v=>v.id===selectedPaper)??papers[0];
  const sheet=useQuery({queryKey:["internal-exams","paper",paper?.id],
    queryFn:()=>apiFetch<Sheet>("/internal-exams/papers/"+encodeURIComponent(paper!.id)),
    enabled:Boolean(paper?.id),retry:false});
  const [drafts,setDrafts]=useMarkDraft<Draft>("mock:"+(paper?.id??""), (value): value is Draft => {
    const row=value as Partial<Draft>|null;
    return !!row&&typeof row.marks==="string"&&typeof row.absent==="boolean"&&Number.isInteger(row.expectedVersion);
  });
  useEffect(()=>{
    if(!sheet.data)return;
    if(sheet.data.paper.sections.length){
      setSelectedSectionId(current=>sheet.data!.paper.sections.some(section=>section.id===current)
        ?current:(sheet.data!.paper.sections.find(section=>section.canEdit)?.id??sheet.data!.paper.sections[0]?.id??""));
    }else{
      setSelectedSectionId("");
    }
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
  const sections=sheet.data?.paper.sections??[];
  const sectionMode=sections.length>0;
  const selectedSection=sections.find(section=>section.id===selectedSectionId)??sections.find(section=>section.canEdit)??sections[0];
  const canEditSelected=sectionMode?Boolean(selectedSection?.canEdit):Boolean(sheet.data?.canEdit);
  const maximum=selectedSection?.maxMarks??sheet.data?.paper.maxMarks??100;
  const changes=useMemo(()=>{
    return candidates.flatMap(row=>{
      const key=sectionMode&&selectedSection?`${row.id}:${selectedSection.id}`:row.id;
      const item=drafts[key];
      if(!item)return [];
      const saved=sectionMode&&selectedSection
        ?row.sectionMarks.find(mark=>mark.sectionId===selectedSection.id)
        :undefined;
      const beforeStatus=sectionMode?(saved?.status??null):row.status;
      const beforeMarks=sectionMode?(saved?.marks??null):row.marks;
      const beforeVersion=sectionMode?(saved?.version??0):row.version;
      const mark=item.absent?null:item.marks.trim()?Number(item.marks):null;
      if(!item.absent&&mark===null)return [];
      const status=item.absent?"ABSENT" as const:"MARKED" as const;
      if(beforeStatus===status && beforeMarks===mark)return [];
      return [{candidateId:row.id,status,marks:mark,expectedVersion:item.expectedVersion??beforeVersion}];
    });
  },[candidates,drafts,sectionMode,selectedSection]);
  const invalid=changes.some(item=>item.marks!==null&&(
    !Number.isFinite(item.marks)||item.marks<0||item.marks>maximum
    ||Math.abs(Math.round(item.marks*100)-item.marks*100)>1e-7));
  const save=useMutation({
    mutationFn:()=>sectionMode
      ?apiFetch("/internal-exams/section-marks",{
        method:"PUT",body:JSON.stringify({sectionId:selectedSection!.id,entries:changes}),
      })
      :apiFetch("/internal-exams/marks",{
        method:"PUT",body:JSON.stringify({paperId:sheet.data!.paper.id,entries:changes}),
      }),
    onSuccess:async()=>{setDrafts({});setNotice(sectionMode?"Teaching-area marks saved. The single subject result is recalculated when all sections are complete.":"Mock marks saved with an audit history.");await client.invalidateQueries({
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
            <Select value={current?.id??""} onValueChange={v=>{if(Object.keys(drafts).length&&!window.confirm("Keep your unsaved draft and switch examination?"))return;setSelectedSession(v);setSelectedPaper("");setNotice(null)}}>
              <SelectTrigger><SelectValue placeholder="Choose mock"/></SelectTrigger>
              <SelectContent>{exams.map(s=><SelectItem key={s.id} value={s.id}>
                {s.name} · {s.class.name} · {s.academicYear.name}</SelectItem>)}</SelectContent>
            </Select></div>
          <div><label className="mb-1 block text-xs font-semibold">Subject paper</label>
            <Select value={paper?.id??""} disabled={!papers.length} onValueChange={v=>{if(Object.keys(drafts).length&&!window.confirm("Keep your unsaved draft and switch paper?"))return;setSelectedPaper(v)}}>
              <SelectTrigger><SelectValue placeholder="Choose subject"/></SelectTrigger>
              <SelectContent>{papers.map(p=><SelectItem key={p.id} value={p.id}>
                {p.codeSnapshot} · {p.nameSnapshot}{p.finalizedAt?" (Finalised)":""}</SelectItem>)}</SelectContent>
            </Select></div>
        </div>
        {current&&<div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/40 p-3 text-xs">
          <span className="font-bold">{current.name} · {current.class.name}</span>
          <span>{current._count.candidates} candidates</span>
          <span>{papers.filter(p=>p.finalizedAt).length}/{papers.length} {manager?"finalised papers":"of your papers finalised"}</span>
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
      {!manager&&current&&!papers.length&&<p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        You are not assigned to any subject in {current.class.name}, so there is no paper for you to mark.</p>}
      {sheet.isPending&&paper&&<p className="text-sm text-muted-foreground">Loading pupil marks…</p>}
      {sheet.isError&&<p role="alert" className="text-xs text-destructive">{failure(sheet.error)}</p>}
      {sheet.data&&<div className="space-y-3">
        {sectionMode&&(
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3">
            <div>
              <p className="text-xs font-semibold">Teaching area</p>
              <p className="text-[11px] text-muted-foreground">Each specialist enters only their own section. SchoolHub combines the sections into one subject mark.</p>
            </div>
            <Select value={selectedSection?.id??"__none__"} onValueChange={setSelectedSectionId}>
              <SelectTrigger aria-label="Teaching area section" className="min-w-52"><SelectValue placeholder="Choose section"/></SelectTrigger>
              <SelectContent>
                {sections.map(section=><SelectItem key={section.id} value={section.id}>
                  {section.name} · {section.weightPercent}%{section.canEdit?" · Assigned to you":""}
                </SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {selectedSection? `${selectedSection.name} · contributes ${selectedSection.weightPercent}% · `:""}
          Maximum {maximum} marks · {canEditSelected?"Entry open for your assigned teaching area.":"Read-only section."}
        </p>
        <p className="text-xs leading-5 text-muted-foreground">
          Totals, grades and remarks reflect the saved whole-subject result{sectionMode?", after every teaching-area section is recorded":""}.
          {sheet.data.grading ? <> Scale: <span className="font-semibold">{sheet.data.grading.name}</span>.
            {sheet.data.grading.source==="REPORT" ? " Uses the frozen report scale." : " Preview using the default scale; school management selects the final scale when generating reports."}
            {" Grades use the nearest whole percentage, matching mock reports."}</> : ` ${sheet.data.gradingMessage??"No grading scale is available for preview."}`}
        </p>
        <div className="max-h-[600px] overflow-auto rounded-xl border border-border">
          <table className="w-full min-w-[540px] text-left text-xs">
            <thead className="sticky top-0 bg-muted"><tr>
              <th scope="col" className="p-3">Pupil</th><th scope="col" className="p-3">Marks</th><th scope="col" className="p-3">Absent</th>
              <th scope="col" className="p-3">Total (%)</th><th scope="col" className="p-3">Grade</th><th scope="col" className="p-3">Remarks</th>
            </tr></thead>
            <tbody>{candidates.map(row=>{
              const key=sectionMode&&selectedSection?`${row.id}:${selectedSection.id}`:row.id;
              const saved=sectionMode&&selectedSection?row.sectionMarks.find(mark=>mark.sectionId===selectedSection.id):undefined;
              const savedStatus=sectionMode?(saved?.status??null):row.status;
              const savedMarks=sectionMode?(saved?.marks??null):row.marks;
              const draft=drafts[key]??{marks:savedMarks===null?"":String(savedMarks),absent:savedStatus==="ABSENT",expectedVersion:sectionMode?(saved?.version??0):row.version};
              return <tr key={row.id} className="border-t border-border">
                <td className="p-3"><div className="font-semibold">{row.name}</div>
                  <div className="text-muted-foreground">{row.admissionNumber??"—"}</div></td>
                <td className="p-3"><input aria-label={`Marks for ${row.name}`}
                  className={style+" max-w-28"} type="number" min="0" max={maximum}
                  step="0.01" disabled={!canEditSelected||draft.absent}
                  value={draft.marks} onChange={e=>setDrafts(prev=>({
                    ...prev,[key]:{...draft,marks:e.target.value},
                  }))}/></td>
                <td className="p-3"><input type="checkbox" aria-label={`Absent: ${row.name}`}
                  checked={draft.absent} disabled={!canEditSelected}
                  onChange={e=>setDrafts(prev=>({
                    ...prev,[key]:{...draft,marks:e.target.checked?"":draft.marks,absent:e.target.checked},
                  }))}/></td>
                <td className="p-3 font-semibold tabular-nums">{row.status==="ABSENT"?"Absent":row.percentage===null?"—":`${row.percentage}%`}</td>
                <td className="p-3 font-semibold">{row.grade??"—"}</td>
                <td className="p-3 text-muted-foreground">{row.status==="ABSENT"?"Absent":row.remark||"—"}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        {canEditSelected&&<div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {changes.length} unsaved changes · {candidates.filter(row=>
              sectionMode&&selectedSection
                ?row.sectionMarks.some(mark=>mark.sectionId===selectedSection.id)
                :row.status!==null
            ).length} pupils recorded in this section.
          </div>
          <div className="flex flex-wrap gap-2">
            <BulkImportButton disabled={Object.keys(drafts).length>0||save.isPending||finalize.isPending}
              title={Object.keys(drafts).length?"Save or discard your typed draft first":undefined}
              onClick={()=>setShowImport(true)} />
            <button type="button" className={button} disabled={finalize.isPending||save.isPending||
              Object.keys(drafts).length>0||candidates.some(row=>row.status===null)}
              onClick={()=>finalize.mutate()}>
              <CheckCheck className="mr-1 inline size-3"/> Finalise subject paper
            </button>
            {Object.keys(drafts).length>0&&<button type="button" className={button}
              disabled={save.isPending||finalize.isPending}
              onClick={()=>{if(window.confirm("Discard your unsaved mock marks for this paper, including other teaching-area sections?"))setDrafts({});}}>Discard draft</button>}
            <button type="button" className={primary}
              disabled={save.isPending||finalize.isPending||invalid||!changes.length||changes.length>120}
              onClick={()=>save.mutate()}>{save.isPending?"Saving…":sectionMode?"Save section marks":"Save mock marks"}</button>
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
    {showImport && sheet.data && canEditSelected && <InternalExamMarksBulkImport
      sheet={{
        paperId:sheet.data.paper.id,paperName:sheet.data.paper.name,
        sessionName:`${sheet.data.session.name}${current?.class.name?` · ${current.class.name}`:""}`,
        ...(sectionMode&&selectedSection?{sectionId:selectedSection.id,sectionName:selectedSection.name}:{}),
        maxMarks:maximum,
        candidates:candidates.map(row=>{
          const mark=sectionMode&&selectedSection?row.sectionMarks.find(item=>item.sectionId===selectedSection.id):undefined;
          return {id:row.id,name:row.name,admissionNumber:row.admissionNumber,
            marks:sectionMode?(mark?.marks??null):row.marks,
            status:sectionMode?(mark?.status??null):row.status,
            version:sectionMode?(mark?.version??0):row.version};
        }),
      }}
      onClose={()=>setShowImport(false)}
      onComplete={()=>{setNotice("Mock marks uploaded. Saved results and remarks have been refreshed.");void client.invalidateQueries({queryKey:["internal-exams","paper",paper?.id]});}}
    />}
    {current && (manager || activeRole==="teacher") &&
      <MockReportReviewWorkspace key={current.id} sessionId={current.id} status={current.status} />}
    <p className="text-xs text-muted-foreground">Internal mock examination marks are recorded separately and locked before report generation.
      Mock 1/Mock 2 reports require independent teacher and headteacher recommendations and
      explicit publication; locked marks alone are never visible to pupils or guardians.</p>
  </div>;
}
