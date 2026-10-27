import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, LoaderCircle, Users, WalletCards } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface AcademicTerm { id: string; name: string; isCurrent: boolean; }
interface AcademicYear { id: string; name: string; isCurrent: boolean; terms: AcademicTerm[]; }
interface ArrearsBill { billId?: string; billNumber: string; academicYear: string; term: string | null; balance: string; dueDate?: string | null; issuedAt?: string; }
interface ArrearsStudent { studentId: string; admissionNumber: string | null; name: string; studentStatus: string; className: string | null; formerStudent: boolean; totalArrears: string; bills: ArrearsBill[]; }
interface TermReview { target: { yearId: string; academicYear: string; termId: string; term: string; startDate: string }; studentCount: number; totalArrears: string; students: ArrearsStudent[]; }
interface FormerStudent { studentId: string; admissionNumber: string | null; name: string; status: string; className: string | null; totalBalance: string; bills: ArrearsBill[]; }
const money=(value:string|number)=>new Intl.NumberFormat("en-GH",{style:"currency",currency:"GHS",maximumFractionDigits:2}).format(Number(value)||0);
const control="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/30";
const button="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";
const primary="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

export function TermEndReviewWorkspace() {
  const client=useQueryClient();
  const [yearId,setYearId]=useState("");
  const [termId,setTermId]=useState("");
  const [selectedIds,setSelectedIds]=useState<string[]>([]);
  const [reason,setReason]=useState("");
  const [view,setView]=useState<"review"|"former">("review");
  const yearsQuery=useQuery({queryKey:["schools","academic-years"],queryFn:()=>apiFetch<AcademicYear[]>("/schools/academic-years"),retry:false});
  const years=yearsQuery.data??[];
  const currentYear=years.find((year)=>year.isCurrent)??years[0];
  const selectedYearId=yearId||currentYear?.id||"";
  const selectedYear=years.find((year)=>year.id===selectedYearId);
  const selectedTermId=termId||selectedYear?.terms.find((term)=>term.isCurrent)?.id||selectedYear?.terms[0]?.id||"";
  const reviewQuery=useQuery({
    queryKey:["finance","term-end-review",selectedYearId,selectedTermId],
    queryFn:()=>apiFetch<TermReview>(`/finance/term-end-review?yearId=${encodeURIComponent(selectedYearId)}&termId=${encodeURIComponent(selectedTermId)}`),
    enabled:view==="review"&&Boolean(selectedYearId)&&Boolean(selectedTermId),
    retry:false,
  });
  const formerQuery=useQuery({
    queryKey:["finance","former-students"],
    queryFn:()=>apiFetch<FormerStudent[]>("/finance/former-students"),
    enabled:view==="former",
    retry:false,
  });
  const activeReviewStudents=useMemo(()=>reviewQuery.data?.students.filter((student)=>!student.formerStudent)??[],[reviewQuery.data]);
  const markMutation=useMutation({
    mutationFn:()=>apiFetch<{updatedCount:number;studentIds:string[];status:string}>("/finance/term-end-review/former-students",{method:"POST",body:JSON.stringify({studentIds:selectedIds,reason:reason.trim()})}),
    onSuccess:async(result)=>{
      setSelectedIds([]);
      setReason("");
      await Promise.all([
        client.invalidateQueries({queryKey:["finance","term-end-review"]}),
        client.invalidateQueries({queryKey:["finance","former-students"]}),
        client.invalidateQueries({queryKey:["finance","summary"]}),
        client.invalidateQueries({queryKey:["finance","bills"]}),
      ]);
      window.dispatchEvent(new CustomEvent("schoolhub:toast",{detail:{type:"success",message:`${result.updatedCount} student(s) marked as former. Their unpaid bills remain open.`}}));
    },
  });
  const toggleStudent=(studentId:string,checked:boolean)=>setSelectedIds((current)=>checked?[...new Set([...current,studentId])]:current.filter((id)=>id!==studentId));

  return <section className="space-y-5">
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Finance · Term transition</p>
      <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground">Term-end arrears review</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Before generating a new term's bills, review unpaid balances from earlier terms. The brought-forward section on a new invoice is a snapshot only; old invoices stay open and payments are allocated to the oldest outstanding invoice first.</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className={view==="review"?primary:button} onClick={()=>{setView("review");setSelectedIds([]);}}><AlertTriangle className="size-4"/> Review arrears</button>
        <button type="button" className={view==="former"?primary:button} onClick={()=>{setView("former");setSelectedIds([]);}}><Users className="size-4"/> Former students with balances</button>
      </div>
      {view==="review"&&<div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-muted-foreground">Target academic year<Select value={selectedYearId || "__none__"} onValueChange={(value)=>{setYearId(value === "__none__" ? "" : value);setTermId("");setSelectedIds([]);}}><SelectTrigger aria-label="Target academic year" className={control+" mt-1"}><SelectValue /></SelectTrigger><SelectContent>{years.length ? years.map((year)=><SelectItem key={year.id} value={year.id}>{year.name}{year.isCurrent?" (current)":""}</SelectItem>) : <SelectItem value="__none__" disabled>No academic years</SelectItem>}</SelectContent></Select></label>
        <label className="text-xs font-semibold text-muted-foreground">Target term<Select value={selectedTermId || "__none__"} onValueChange={(value)=>{setTermId(value === "__none__" ? "" : value);setSelectedIds([]);}}><SelectTrigger aria-label="Target term" className={control+" mt-1"}><SelectValue /></SelectTrigger><SelectContent>{(selectedYear?.terms??[]).length ? (selectedYear?.terms??[]).map((term)=><SelectItem key={term.id} value={term.id}>{term.name}{term.isCurrent?" (current)":""}</SelectItem>) : <SelectItem value="__none__" disabled>No terms available</SelectItem>}</SelectContent></Select></label>
      </div>}
    </div>

    {view==="review" ? <>
      {reviewQuery.isPending&&<div role="status" className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-12 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin"/> Checking earlier-term balances…</div>}
      {reviewQuery.isError&&<div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">The term-end review could not be loaded. {reviewQuery.error.message}</div>}
      {reviewQuery.data&&<div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Students with arrears</p><p className="mt-2 text-2xl font-bold text-foreground">{reviewQuery.data.studentCount}</p></div>
          <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Earlier-term balances</p><p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{money(reviewQuery.data.totalArrears)}</p></div>
          <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Target term</p><p className="mt-2 text-lg font-bold text-foreground">{reviewQuery.data.target.academicYear} · {reviewQuery.data.target.term}</p></div>
        </div>
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold text-foreground">Unpaid earlier-term invoices</h3><p className="mt-1 text-sm text-muted-foreground">Select only students who have left the school and provide a reason. This marks the student Withdrawn; it does not write off the balance.</p></div><span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">Showing {reviewQuery.data.students.length} students</span></div>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="p-3">Mark left</th><th className="p-3">Student</th><th className="p-3">Class</th><th className="p-3">Status</th><th className="p-3">Open invoices</th><th className="p-3 text-right">Arrears</th></tr></thead><tbody>{reviewQuery.data.students.map((student)=><tr key={student.studentId} className="border-b border-border/70 align-top"><td className="p-3">{!student.formerStudent?<input aria-label={`Mark ${student.name} as having left`} type="checkbox" className="size-4 accent-primary" checked={selectedIds.includes(student.studentId)} onChange={(event)=>toggleStudent(student.studentId,event.target.checked)}/>:<CheckCircle2 className="size-4 text-muted-foreground"/>}</td><td className="p-3"><p className="font-semibold text-foreground">{student.name}</p><p className="text-xs text-muted-foreground">{student.admissionNumber??"No admission number"}</p></td><td className="p-3">{student.className??"—"}</td><td className="p-3">{student.studentStatus}</td><td className="p-3"><details><summary className="cursor-pointer text-primary">{student.bills.length} invoice(s)</summary><div className="mt-2 space-y-2">{student.bills.map((bill)=><div key={bill.billId??bill.billNumber} className="rounded-lg bg-muted/40 p-2"><div className="flex justify-between gap-2"><span className="font-medium">{bill.billNumber}</span><span className="tabular-nums">{money(bill.balance)}</span></div><p className="text-xs text-muted-foreground">{bill.academicYear}{bill.term?" · "+bill.term:""} · due {bill.dueDate??"not set"}</p></div>)}</div></details></td><td className="p-3 text-right font-semibold tabular-nums">{money(student.totalArrears)}</td></tr>)}{!reviewQuery.data.students.length&&<tr><td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">No earlier-term arrears were found for this school and target term.</td></tr>}</tbody></table></div>
          {selectedIds.length>0&&<div className="mt-5 space-y-3 rounded-xl border border-warning/30 bg-warning/5 p-4"><p className="text-sm font-semibold text-foreground">{selectedIds.length} student(s) selected</p><label className="block text-xs font-semibold text-muted-foreground">Reason (minimum 10 characters)<textarea className="mt-1 min-h-20 w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/30" value={reason} onChange={(event)=>setReason(event.target.value)} placeholder="e.g. Confirmed transfer to another school" /></label>{markMutation.isError&&<p role="alert" className="text-sm text-destructive">{markMutation.error.message}</p>}<button type="button" className={primary} disabled={reason.trim().length<10||markMutation.isPending} onClick={()=>markMutation.mutate()}>{markMutation.isPending?<LoaderCircle className="size-4 animate-spin"/>:<Users className="size-4"/>} Mark selected as former students</button></div>}
        </section>
      </div>}
    </> : <>
      {formerQuery.isPending&&<div role="status" className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-12 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin"/> Loading former-student balances…</div>}
      {formerQuery.isError&&<div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">Former-student balances could not be loaded. {formerQuery.error.message}</div>}
      {formerQuery.data&&<section className="rounded-2xl border border-border bg-card p-5"><h3 className="text-lg font-semibold text-foreground">Former students with open balances</h3><p className="mt-1 text-sm text-muted-foreground">These receivables remain on their original invoices until paid or corrected through an approved accounting adjustment.</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="p-3">Student</th><th className="p-3">Status</th><th className="p-3">Invoices</th><th className="p-3 text-right">Balance</th></tr></thead><tbody>{formerQuery.data.map((student)=><tr key={student.studentId} className="border-b border-border/70"><td className="p-3"><p className="font-semibold">{student.name}</p><p className="text-xs text-muted-foreground">{student.admissionNumber??"No admission number"}</p></td><td className="p-3">{student.status}</td><td className="p-3">{student.bills.map((bill)=>bill.billNumber).join(", ")}</td><td className="p-3 text-right font-semibold tabular-nums">{money(student.totalBalance)}</td></tr>)}{!formerQuery.data.length&&<tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No former-student balances were found.</td></tr>}</tbody></table></div></section>}
    </>}
  </section>;
}
