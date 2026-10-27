import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Download, FileUp, X } from "lucide-react";

type Kind = "teacher" | "staff";
type PreviewRow = { rowNumber: number; name: string; status: "ready" | "duplicate" | "error"; errors: string[]; row: Record<string, unknown> | null };
type Preview = { file: { name: string; format: string; rows: number }; summary: { total: number; ready: number; duplicate: number; error: number }; rows: PreviewRow[] };
type Result = { rowNumber: number; name: string; status: "created" | "failed"; message?: string; credentials?: { loginEmail: string; temporaryPassword: string } | null };
const teacherHeaders = ["firstName","lastName","email","phone","gender","dateOfBirth","department","qualification","specialization","experience","staffNumber","employmentType","hireDate"];
const staffHeaders = ["firstName","lastName","email","phone","gender","dateOfBirth","staffType","jobTitle","department","staffId","staffNumber","employmentType","hireDate"];

export function StaffBulkImport({ kind, onClose, onComplete }: { kind: Kind; onClose: () => void; onComplete: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const [progress, setProgress] = useState("");
  const title = kind === "teacher" ? "Teachers" : "Non-teaching staff";
  const template = () => {
    const headers = kind === "teacher" ? teacherHeaders : staffHeaders;
    const examples = kind === "teacher"
      ? ["Ama","Mensah","ama@example.com","0240000000","FEMALE","1995-04-12","Mathematics","B.Ed","Mathematics","4","TCH-001","FULL_TIME",new Date().toISOString().slice(0,10)]
      : ["Kojo","Owusu","kojo@example.com","0240000000","MALE","1990-03-08","LIBRARIAN","Librarian","Library","STF-001","STF-001","FULL_TIME",new Date().toISOString().slice(0,10)];
    const csv = [headers, examples].map(row => row.map(v => `"${String(v).replaceAll('"','""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF"+csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `${kind}-import-template.csv`; a.click(); URL.revokeObjectURL(url);
  };
  const inspect = async () => {
    if (!file) return;
    setLoading(true); setError(null); setResults(null);
    try {
      const form = new FormData(); form.append("file", file);
      const data = await apiFetch<Preview>(`/people/import/preview?kind=${kind}`, { method: "POST", body: form });
      setPreview(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to read this file."); }
    finally { setLoading(false); }
  };
  const runImport = async () => {
    if (!preview) return;
    const ready = preview.rows.filter((r): r is PreviewRow & { row: Record<string, unknown> } => r.status === "ready" && r.row !== null);
    if (!ready.length) return;
    setLoading(true); setError(null);
    const all: Result[] = [];
    try {
      for (let i=0; i<ready.length; i+=25) {
        const batch = ready.slice(i, i+25);
        setProgress(`Creating ${Math.min(i+batch.length, ready.length)} of ${ready.length}…`);
        const response = await apiFetch<{ results: Result[] }>(`/people/import`, { method: "POST", body: JSON.stringify({ kind, batchId: crypto.randomUUID(), rows: batch.map(r => ({ rowNumber: r.rowNumber, row: r.row })) }) });
        all.push(...response.results);
      }
      setResults(all); onComplete();
    } catch (e) {
      setResults(all);
      setError(e instanceof Error ? e.message : "Import stopped. Upload the same file again; existing accounts will be flagged as duplicates.");
    } finally { setLoading(false); setProgress(""); }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4" role="dialog" aria-modal="true" aria-labelledby="staff-import-title">
    <section className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-border bg-card p-5 text-foreground shadow-xl sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div><h2 id="staff-import-title" className="text-lg font-bold">Bulk upload {title.toLowerCase()}</h2><p className="mt-1 text-sm text-muted-foreground">Upload CSV or Excel, review every row, then create accounts. Existing email or staff identifiers are flagged before import.</p></div>
        <button type="button" onClick={onClose} aria-label="Close bulk upload" className="rounded-lg p-2 hover:bg-muted"><X className="size-4"/></button>
      </div>
      {!results && <div className="mt-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={template} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted"><Download className="size-4"/> Download CSV template</button><span className="text-xs text-muted-foreground">Dates use YYYY-MM-DD. Gender: MALE, FEMALE, OTHER. Employment type: FULL_TIME, PART_TIME, CONTRACT, TEMPORARY, INTERN.</span></div>
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 p-7 text-center"><FileUp className="size-7 text-primary"/><span className="text-sm font-semibold">{file?.name ?? "Choose a .csv or .xlsx file"}</span><span className="text-xs text-muted-foreground">Maximum 2 MB; up to 1,000 rows</span><input type="file" accept=".csv,.xlsx" className="sr-only" onChange={e => {setFile(e.target.files?.[0] ?? null);setPreview(null);setError(null);}}/></label>
        <div className="flex justify-end"><button type="button" disabled={!file || loading} onClick={() => void inspect()} className="rounded-lg bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-50">{loading ? "Checking…" : "Validate file"}</button></div>
        {preview && <div className="space-y-3 rounded-xl border border-border p-4">
          <div className="grid grid-cols-3 gap-2 text-center">{[["Ready",preview.summary.ready],["Duplicates",preview.summary.duplicate],["Errors",preview.summary.error]].map(([label,value])=><div key={String(label)} className="rounded-lg bg-muted p-3"><div className="text-xl font-bold">{value}</div><div className="text-xs text-muted-foreground">{label}</div></div>)}</div>
          <div className="max-h-64 overflow-auto rounded-lg border border-border"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-muted"><tr><th className="p-2">Row</th><th className="p-2">Name</th><th className="p-2">Status</th><th className="p-2">Details</th></tr></thead><tbody>{preview.rows.map(row=><tr key={row.rowNumber} className="border-t border-border"><td className="p-2">{row.rowNumber}</td><td className="p-2">{row.name}</td><td className="p-2">{row.status}</td><td className="p-2">{row.errors.join(" ") || "Ready to create"}</td></tr>)}</tbody></table></div>
          <div className="flex justify-end"><button type="button" disabled={loading || preview.summary.ready===0} onClick={() => void runImport()} className="rounded-lg bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-50">{loading ? progress || "Importing…" : `Create ${preview.summary.ready} records`}</button></div>
        </div>}
      </div>}
      {error && <p role="alert" className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {results && <div className="mt-5 space-y-3"><h3 className="font-semibold">Import results</h3><p className="text-sm text-muted-foreground">{results.filter(r=>r.status==="created").length} created · {results.filter(r=>r.status==="failed").length} failed. Save any newly issued credentials now; passwords are only shown in this response.</p><div className="max-h-72 overflow-auto rounded-lg border border-border"><table className="w-full text-left text-xs"><thead className="bg-muted"><tr><th className="p-2">Name</th><th className="p-2">Status</th><th className="p-2">Login</th><th className="p-2">Temporary password</th><th className="p-2">Message</th></tr></thead><tbody>{results.map(r=><tr key={r.rowNumber} className="border-t border-border"><td className="p-2">{r.name}</td><td className="p-2">{r.status}</td><td className="p-2">{r.credentials?.loginEmail ?? ""}</td><td className="p-2">{r.credentials?.temporaryPassword ?? ""}</td><td className="p-2">{r.message ?? ""}</td></tr>)}</tbody></table></div><div className="flex justify-end"><button type="button" onClick={onClose} className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">Done</button></div></div>}
    </section>
  </div>;
}
