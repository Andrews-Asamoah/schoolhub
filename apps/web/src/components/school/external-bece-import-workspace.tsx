import {useState} from "react";
import {useMutation,useQuery,useQueryClient} from "@tanstack/react-query";
import {FileSpreadsheet,ShieldCheck} from "lucide-react";
import {apiFetch,downloadPrivateExcel} from "@/lib/api";

type PreviewRow={rowNumber:number;candidate:string;indexNumber:string;subjectCode:string;
  status:string;grade:number|null;decision:"ready"|"unchanged"|"skipped"|"rejected";errors:string[]};
type Preview={filename:string;sha256:string;sessionId:string;ready:number;unchanged:number;
  skipped:number;rejected:number;canApply:boolean;rows:PreviewRow[];note:string};
type History={id:string;sha256:string;originalFilename:string;rowsCommitted:number;
  importedAt:string;importedBy:{name:string}|null};
const button="rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold disabled:opacity-40";
const primary="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40";
const msg=(e:unknown)=>e instanceof Error?e.message:"This Excel operation failed.";

export function ExternalBeceImportWorkspace({sessionId,paperId,status}:{
  sessionId:string;paperId:string;status:string;
}){
  const client=useQueryClient();
  const [file,setFile]=useState<File|null>(null);
  const [preview,setPreview]=useState<Preview|null>(null);
  const [success,setSuccess]=useState("");
  const [downloadError,setDownloadError]=useState("");
  const history=useQuery({queryKey:["bece-import-history",sessionId],
    queryFn:()=>apiFetch<History[]>("/external-exams/"+encodeURIComponent(sessionId)+"/import/history"),
    retry:false,enabled:Boolean(sessionId)});
  const inspect=useMutation({mutationFn:async()=>{
    if(!file)throw new Error("Select a workbook first.");
    const form=new FormData();form.append("file",file);
    return apiFetch<Preview>("/external-exams/"+encodeURIComponent(sessionId)+"/import/preview",{
      method:"POST",body:form,
    });
  },onSuccess:data=>{setPreview(data);setSuccess("");}});
  const apply=useMutation({mutationFn:async()=>{
    if(!file||!preview)throw new Error("Preview a workbook first.");
    const form=new FormData();form.append("file",file);form.append("sha256",preview.sha256);
    return apiFetch<{committed:number;importId:string}>(
      "/external-exams/"+encodeURIComponent(sessionId)+"/import/commit",{
        method:"POST",body:form,
      });
  },onSuccess:async(result)=>{
    setSuccess(result.committed+" BECE result entries committed with an immutable import record. Other rows were not changed.");
    setPreview(null);setFile(null);
    await Promise.all([
      client.invalidateQueries({queryKey:["external-bece"]}),
      client.invalidateQueries({queryKey:["bece-import-history",sessionId]}),
    ]);
  }});
  const download=async()=>{
    setDownloadError("");
    try{
      await downloadPrivateExcel("/external-exams/"+encodeURIComponent(sessionId)+
        "/import/template/"+encodeURIComponent(paperId),"bece-"+sessionId+"-template.xlsx");
    }catch(e){setDownloadError(msg(e));}
  };
  return <section className="space-y-3 rounded-xl border border-border bg-card p-4">
    <div className="flex items-start gap-3">
      <FileSpreadsheet className="size-5 text-primary"/>
      <div><h4 className="text-sm font-semibold">Excel import — BECE results</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          Administrators only. Download a subject template, fill the status and grade,
          then run a complete dry-run preview before committing. The server blocks all rows
          if any submitted row is invalid. An upload never creates a public result checker.
        </p>
      </div>
    </div>
    {status==="OPEN"?<>
      <button type="button" className={button} onClick={()=>void download()}>
        Download selected subject Excel template
      </button>
      <div className="space-y-2">
        <label htmlFor="bece-xlsx-file" className="block text-xs font-semibold">
          Choose completed Excel workbook (.xlsx, max 3 MB, 600 rows)
        </label>
        <input id="bece-xlsx-file" type="file" accept=".xlsx" className="block w-full text-xs"
          onChange={e=>{setFile(e.target.files?.[0]??null);setPreview(null);setSuccess("");}}/>
      </div>
      <button type="button" className={button} disabled={!file||inspect.isPending||apply.isPending}
        onClick={()=>inspect.mutate()}>
        {inspect.isPending?"Checking workbook…":"Preview rows — no changes"}
      </button>
      {inspect.isError&&<p role="alert" className="text-xs text-destructive">{msg(inspect.error)}</p>}
      {preview&&<div className="space-y-3">
        <p className="text-xs font-semibold">
          {preview.ready} ready · {preview.unchanged} unchanged · {preview.skipped} blank-status skipped
          {" · "}{preview.rejected} rejected
        </p>
        <p className="break-all text-xs text-muted-foreground">
          Workbook SHA-256: {preview.sha256}
        </p>
        <div className="max-h-80 overflow-auto rounded-lg border border-border">
          <table className="w-full min-w-[630px] text-left text-xs">
            <thead className="sticky top-0 bg-muted"><tr>
              <th className="p-2">Excel row</th><th className="p-2">Candidate / index</th>
              <th className="p-2">Subject</th><th className="p-2">Proposed</th>
              <th className="p-2">Decision / issues</th>
            </tr></thead>
            <tbody>{preview.rows.map(row=><tr key={row.rowNumber} className="border-t border-border">
              <td className="p-2">{row.rowNumber}</td>
              <td className="p-2">{row.candidate||"Unknown"}<span className="block font-mono">{row.indexNumber}</span></td>
              <td className="p-2">{row.subjectCode}</td>
              <td className="p-2">{row.status||"Skipped"}{row.grade===null?"":": "+row.grade}</td>
              <td className="p-2"><strong className={row.decision==="rejected"?"text-destructive":""}>{row.decision}</strong>
                {row.errors.length>0&&<span className="block text-destructive">{row.errors.join("; ")}</span>}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {preview.canApply&&<button type="button" className={primary}
          disabled={apply.isPending||inspect.isPending} onClick={()=>apply.mutate()}>
          <ShieldCheck className="mr-1 inline size-3.5"/>
          {apply.isPending?"Committing…":`Commit ${preview.ready} validated rows`}
        </button>}
        {!preview.canApply&&<p role="alert" className="text-xs text-destructive">
          Import blocked. Fix rejected rows, save the Excel file and preview again.
          The existing register has not been changed.</p>}
        {apply.isError&&<p role="alert" className="text-xs text-destructive">{msg(apply.error)}</p>}
      </div>}
    </>:<p className="text-xs text-muted-foreground">
      This register is {status.toLowerCase()}. Excel uploads are available only while the examination is open.
    </p>}
    {downloadError&&<p role="alert" className="text-xs text-destructive">{downloadError}</p>}
    {success&&<p role="status" className="text-xs">{success}</p>}
    <div className="space-y-2">
      <h5 className="text-xs font-bold">Committed import history</h5>
      {history.isPending&&<p className="text-xs text-muted-foreground">Loading import provenance…</p>}
      {history.isError&&<p role="alert" className="text-xs text-destructive">{msg(history.error)}</p>}
      {!history.isPending&&history.data?.length===0&&<p className="text-xs text-muted-foreground">No Excel batches committed.</p>}
      <div className="space-y-2">{history.data?.map(item=><div key={item.id}
        className="rounded-lg border border-border p-2 text-xs">
        <strong>{item.rowsCommitted} rows · {item.originalFilename}</strong>
        <span className="ml-2 text-muted-foreground">{new Date(item.importedAt).toLocaleString()} · {item.importedBy?.name??"Former staff"}</span>
        <span className="block break-all font-mono text-muted-foreground">SHA-256 {item.sha256}</span>
      </div>)}</div>
    </div>
    <p className="text-xs text-muted-foreground">
      Files are processed in memory and discarded after validation; the file digest,
      importer, row numbers, source references and before/after changes are recorded
      for audit. School-entered results are not WAEC-verified.
    </p>
  </section>;
}
