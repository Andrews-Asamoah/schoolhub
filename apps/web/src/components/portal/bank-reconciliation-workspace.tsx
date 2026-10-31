import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiDownload } from "@/lib/api";
import { useSchoolRole } from "@/components/school/school-role-switcher";
type Reconciliation = { id: string; accountId: string; periodEnd: string; status: string; contentHash: string | null; snapshot: unknown; statement: { lines: { id: string; date: string; amount: string; description: string; matches: { id: string; amount: string }[] }[] } };
const field = "rounded-lg border border-input bg-background p-2 text-sm";
export function BankReconciliationWorkspace() {
  const client = useQueryClient();
  const { activeRole } = useSchoolRole();
  const [selected, select] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState(1);
  const [values, setValues] = useState({ accountId: "", startDate: "", endDate: "", openingBalance: "", closingBalance: "", duplicateReviewReason: "", date: "Date", description: "Description", reference: "", amount: "Amount", debit: "", credit: "" });
  const [preview, setPreview] = useState<unknown>(null);
  const [lineId, setLineId] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const accounts = useQuery({ queryKey: ["reconciliation-accounts"], queryFn: () => apiFetch<{id:string;name:string;code:string}[]>("/finance/reconciliations/accounts") });
  const records = useQuery({ queryKey: ["reconciliations"], queryFn: () => apiFetch<Reconciliation[]>("/finance/reconciliations") });
  const detail = useQuery({ queryKey: ["reconciliations", selected], enabled: !!selected, queryFn: () => apiFetch<Reconciliation>(`/finance/reconciliations/${selected}`) });
  const candidates = useQuery({ queryKey: ["reconciliations", selected, "candidates", page], enabled: !!selected, queryFn: () => apiFetch<{id:string;transactionNumber:string;description:string;amount:string;debitAccountId:string}[]>(`/finance/reconciliations/${selected}/candidates?page=${page}`) });
  const action = useMutation({ mutationFn: async (run: () => Promise<unknown>) => run(), onSuccess: async () => { setNotice("Saved."); await client.invalidateQueries({ queryKey: ["reconciliations"] }); }, onError: (error: Error) => setNotice(error.message) });
  const post = (path: string, body?: unknown) => apiFetch(`/finance/reconciliations/${selected}/${path}`, { method: "POST", body: body ? JSON.stringify(body) : undefined });
  async function upload(commit: boolean) {
    if (!file) throw new Error("Choose a statement file.");
    const body = new FormData(); body.append("file", file);
    const { date, description, reference, amount, debit, credit, ...input } = values;
    body.append("input", JSON.stringify({ ...input, mapping: { date, description, reference: reference || undefined, amount: amount || undefined, debit: debit || undefined, credit: credit || undefined } }));
    const result = await apiFetch<{ id: string }>(`/finance/reconciliations/${commit ? "import" : "preview"}`, { method: "POST", body });
    if (commit) { select(result.id); setPreview(null); } else setPreview(result);
  }
  const canPrepare = activeRole === "accountant";
  const canApprove = activeRole === "owner" || activeRole === "headteacher";
  return <section className="space-y-4 rounded-xl border border-border bg-card p-5">
    <h2 className="text-lg font-semibold">Bank and cash reconciliation</h2>
    <p className="text-sm text-muted-foreground">Import statement evidence, match existing ledger postings and submit a zero-difference bridge for independent approval. Imports never create receipts or journals.</p>
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {[accounts.error,records.error,detail.error,candidates.error].filter(Boolean).map((error,index) => <p role="alert" key={index} className="text-destructive">{(error as Error).message}</p>)}
    {canPrepare && <details><summary className="cursor-pointer font-medium">Import a statement</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">
      <label>Account<select className={field+" block w-full"} value={values.accountId} onChange={event=>setValues({...values,accountId:event.target.value})}><option value="">Choose an account</option>{accounts.data?.map(account=><option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>
      <label>CSV/XLSX file<input className="block" type="file" accept=".csv,.xlsx" onChange={event=>{setFile(event.target.files?.[0]??null);setPreview(null);}} /></label>
      {([['startDate','Statement start'],['endDate','Statement end'],['openingBalance','Opening balance'],['closingBalance','Closing balance'],['date','Date column'],['description','Description column'],['reference','Reference column (optional)'],['amount','Signed amount column (blank for debit/credit)'],['debit','Debit column (withdrawals)'],['credit','Credit column (deposits)'],['duplicateReviewReason','Duplicate-line review reason']] as const).map(([key,label])=><label key={key}>{label}<input className={field+" block w-full"} type={key.endsWith('Date')?'date':'text'} value={values[key]} onChange={event=>{setValues({...values,[key]:event.target.value});setPreview(null);}} /></label>)}
      <p className="text-xs text-muted-foreground">Use ISO dates (YYYY-MM-DD), decimal amounts without currency symbols, and either a signed amount column or debit/credit columns with the unused cell blank. One visible Excel worksheet.</p>
      <button disabled={action.isPending} className={field} onClick={()=>action.mutate(()=>upload(false))}>Preview</button>
      {preview !== null && <><pre className="max-h-64 overflow-auto text-xs">{JSON.stringify(preview,null,2)}</pre><button disabled={action.isPending} className={field} onClick={()=>action.mutate(()=>upload(true))}>Confirm import</button></>}
    </div></details>}
    <label className="block">Reconciliation<select className={field+" ml-2"} value={selected} onChange={event=>{select(event.target.value);setPage(1);}}><option value="">Choose a statement</option>{records.data?.map(record=><option key={record.id} value={record.id}>{record.periodEnd.slice(0,10)} · {accounts.data?.find(account=>account.id===record.accountId)?.name??record.accountId} · {record.status}</option>)}</select></label>
    {detail.data && <><p>Status: {detail.data.status}</p><button className={field} onClick={()=>action.mutate(()=>apiDownload(`/finance/reconciliations/${selected}/source`))}>Download original statement</button>
    {canPrepare && detail.data.status==='APPROVED' && <button className={field} disabled={action.isPending} onClick={()=>action.mutate(async()=>{const next=await post('amend') as {id:string};select(next.id);})}>Create amendment after reopening</button>}<div className="max-h-80 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Matches</th></tr></thead><tbody>{detail.data.statement.lines.map(line=><tr key={line.id}><td>{line.date.slice(0,10)}</td><td>{line.description}</td><td>{line.amount}</td><td>{line.matches.map(match=><span key={match.id} className="mr-2">{match.amount}{canPrepare&&detail.data?.status==='DRAFT'&&<button disabled={action.isPending} onClick={()=>action.mutate(()=>post(`matches/${match.id}/remove`))}> Remove</button>}</span>)}</td></tr>)}</tbody></table></div>
    {canPrepare && detail.data.status==='REJECTED' && <button className={field} disabled={action.isPending} onClick={()=>action.mutate(()=>post('revise'))}>Revise rejected reconciliation</button>}
    {canPrepare && detail.data.status==='DRAFT'  && <div className="grid gap-3 sm:grid-cols-2"><label>Statement line<select className={field+" block w-full"} value={lineId} onChange={event=>setLineId(event.target.value)}><option value="">Choose a line</option>{detail.data.statement.lines.map(line=><option key={line.id} value={line.id}>{line.date.slice(0,10)} · {line.description} · {line.amount}</option>)}</select></label><label>Ledger posting<select className={field+" block w-full"} value={transactionId} onChange={event=>setTransactionId(event.target.value)}><option value="">Choose a posting</option>{candidates.data?.map(row=><option key={row.id} value={row.id}>{row.transactionNumber} · {row.description} · {row.debitAccountId===detail.data?.accountId?'+':'-'}{row.amount}</option>)}</select></label><div><button className={field} disabled={page===1} onClick={()=>setPage(page-1)}>Previous postings</button><button className={field} disabled={(candidates.data?.length??0)<50} onClick={()=>setPage(page+1)}>Next postings</button></div><label>Match amount<input className={field+" block w-full"} value={amount} onChange={event=>setAmount(event.target.value)} /></label><button className={field} disabled={action.isPending} onClick={()=>action.mutate(()=>post('matches',{statementLineId:lineId,transactionId,amount}))}>Save match</button><button className={field} disabled={action.isPending} onClick={()=>action.mutate(()=>post('submit'))}>Submit for independent review</button></div>}
    {detail.data.snapshot!==null&&<pre className="max-h-80 overflow-auto text-xs">{JSON.stringify(detail.data.snapshot,null,2)}</pre>}
    {canApprove&&detail.data.status==='PENDING'&&<div className="space-y-2"><label>Decision reason<textarea className={field+" block w-full"} value={note} onChange={event=>setNote(event.target.value)} /></label>{[true,false].map(approve=><button key={String(approve)} className={field} disabled={action.isPending||note.trim().length<10} onClick={()=>action.mutate(()=>post('decide',{approve,note}))}>{approve?'Approve':'Reject'}</button>)}</div>}
    </>}
  </section>;
}
