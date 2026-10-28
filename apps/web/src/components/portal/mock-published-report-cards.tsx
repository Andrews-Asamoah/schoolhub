import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch,downloadAcademicReport } from "@/lib/api";
type Mock={id:string;version:number;publishedAt:string;snapshot:{
  name:string;school:{name:string};year:string;term:string;className:string;
  pupil:{name:string};average:number|null;position:number|null;papers:{
    name:string;code:string;status:string;percentage:number|null;grade:string|null}[];
}};
export function MockPublishedReportCards({audience}:{audience:"student"|"guardian"}){
  const [error,setError]=useState("");
  const reports=useQuery({
    queryKey:["internal-exams","published",audience],
    queryFn:()=>apiFetch<Mock[]>(audience==="student"?
      "/internal-exams/published/me":"/internal-exams/published/guardian"),
    retry:false,
  });
  const download=(id:string)=>{
    setError("");
    void downloadAcademicReport("/internal-exams/published/"+(audience==="student"?"me":"guardian")+
      "/"+encodeURIComponent(id)+"/pdf","mock-examination-"+id+".pdf")
      .catch(e=>setError(e instanceof Error?e.message:"Mock report download failed."));
  };
  return <section className="space-y-3 rounded-2xl border border-border bg-card p-5 print:hidden">
    <div><h3 className="text-base font-semibold">Published internal mock examinations</h3>
      <p className="text-xs text-muted-foreground">School-issued Mock 1, Mock 2 and later reports
        appear only after both recommendations and formal publication. These are not WAEC BECE results.</p>
    </div>
    {reports.isPending&&<p className="text-xs text-muted-foreground">Loading mock reports…</p>}
    {reports.isError&&<p role="alert" className="text-xs text-destructive">{reports.error.message}</p>}
    {reports.data?.length===0&&<p className="text-xs text-muted-foreground">
      No mock reports have been published for {audience==="student"?"you":"your linked wards"}.</p>}
    {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
    <div className="grid gap-3 md:grid-cols-2">{reports.data?.map(r=><article key={r.id}
      className="space-y-2 rounded-xl border border-border p-3">
      <h4 className="text-sm font-bold">{r.snapshot.name} · {r.snapshot.pupil.name}</h4>
      <p className="text-xs text-muted-foreground">{r.snapshot.year} · {r.snapshot.term} · {r.snapshot.className}</p>
      <p className="text-xs">Average: {r.snapshot.average===null?"Not calculated":r.snapshot.average+"%"}
        {" · "}Position: {r.snapshot.position??"Unranked"}</p>
      <p className="text-xs text-muted-foreground">
        {r.snapshot.papers.map(p=>p.code+": "+(p.status==="ABSENT"?"Absent":p.grade??"Ungraded")).join(" · ")}
      </p>
      <button type="button" onClick={()=>download(r.id)}
        className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
        Download approved PDF
      </button>
    </article>)}</div>
  </section>;
}
