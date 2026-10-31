import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useSchoolRole } from "@/components/school/school-role-switcher";
const control = "rounded-lg border border-input bg-background p-2 text-sm";
export function PeriodCloseWorkspace() {
  const { activeRole }=useSchoolRole(),client=useQueryClient();
  const [month,setMonth]=useState(""),[reason,setReason]=useState(""),[message,setMessage]=useState(""),[report,setReport]=useState<{failed:string[];canRequest:boolean;snapshot:unknown}|null>(null);
  const periods=useQuery({queryKey:['close-periods'],queryFn:()=>apiFetch<{id:string;name:string;status:string;reopenCount:number}[]>('/finance/periods')});
  const requests=useQuery({queryKey:['close-requests'],queryFn:()=>apiFetch<{id:string;entityId:string;subject:string;requestedById:string}[]>('/finance/period-controls/requests')});
  const action=useMutation({mutationFn:async(run:()=>Promise<unknown>)=>run(),onSuccess:async()=>{setMessage('Saved.');await client.invalidateQueries({queryKey:['close-periods']});await client.invalidateQueries({queryKey:['close-requests']});},onError:(error:Error)=>setMessage(error.message)});
  const [year,monthNumber]=month.split('-').map(Number);
  const post=(path:string,body:unknown)=>apiFetch('/finance/period-controls/'+path,{method:'POST',body:JSON.stringify(body)});
  return <section className="space-y-3 rounded-xl border border-border bg-card p-5"><h2 className="text-lg font-semibold">Accounting period close</h2>
    <p className="text-sm text-muted-foreground">Closing requires reconciled journal and receivables evidence, approved cash/bank reconciliations, resolved adjustments and liability checks. An owner or headteacher must independently approve. Posted snapshots remain immutable after reopening.</p>
    {message&&<p role="status">{message}</p>}{(periods.error||requests.error)&&<p role="alert" className="text-destructive">{(periods.error||requests.error)?.message}</p>}
    <label>Accounting month<input className={control+" ml-2"} type="month" value={month} onChange={event=>{setMonth(event.target.value);setReport(null);}} /></label>
    <button className={control} disabled={!month||action.isPending} onClick={()=>action.mutate(async()=>{const result=await apiFetch<{failed:string[];canRequest:boolean;snapshot:unknown}>(`/finance/period-controls/readiness?year=${year}&month=${monthNumber}`);setReport(result);})}>Check close readiness</button>
    {report&&<><p>{report.canRequest?'Checks passed; an independent approval is still required.':'Closing is blocked.'}</p><ul className="list-disc pl-5">{report.failed.map(item=><li key={item}>{item}</li>)}</ul><details><summary>Journal snapshot preview</summary><pre className="max-h-64 overflow-auto text-xs">{JSON.stringify(report.snapshot,null,2)}</pre></details></>}
    <label className="block">Request or decision reason<textarea className={control+" block w-full"} minLength={10} maxLength={1000} value={reason} onChange={event=>setReason(event.target.value)} /></label>
    {activeRole==='accountant'&&<button className={control} disabled={!report?.canRequest||reason.trim().length<10||action.isPending} onClick={()=>action.mutate(()=>post('request-close',{year,month:monthNumber,reason}))}>Request independent close approval</button>}
    <ul className="space-y-2">{periods.data?.map(period=><li key={period.id}>{period.name} · {period.status} · {period.reopenCount} reopenings {activeRole==='accountant'&&period.status==='CLOSED'&&<button className={control} disabled={reason.trim().length<10||action.isPending} onClick={()=>action.mutate(()=>post(`${period.id}/request-reopen`,{reason}))}>Request reopening</button>}</li>)}</ul>
    <h3 className="font-medium">Pending approvals</h3><ul className="space-y-2">{requests.data?.map(request=><li key={request.id}>{request.subject} · {periods.data?.find(period=>period.id===request.entityId)?.name??request.entityId}{['owner','headteacher'].includes(activeRole??'')&&[true,false].map(approve=><button key={String(approve)} className={control} disabled={reason.trim().length<10||action.isPending} onClick={()=>action.mutate(()=>post(`${request.id}/decide`,{approve,note:reason}))}>{approve?'Approve':'Reject'}</button>)}</li>)}</ul>
  </section>;
}
