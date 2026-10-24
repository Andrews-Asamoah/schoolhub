import { useQuery } from "@tanstack/react-query";
import { CreditCard, FileText, LoaderCircle, ShieldCheck, UserRound } from "lucide-react";
import { useState } from "react";
import type { StudentProfileData } from "@/components/school/student-profile-panel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/api";

function fullName(ward: StudentProfileData) {
  return [ward.profile.firstName, ward.profile.otherNames, ward.profile.lastName].filter(Boolean).join(" ");
}

export function GuardianFeesWorkspace() {
  const [wardId, setWardId] = useState("");
  const wardsQuery = useQuery({ queryKey: ["students", "my-wards"], queryFn: () => apiFetch<StudentProfileData[]>("/students/my-wards"), retry: false });
  const wards = wardsQuery.data ?? [];
  const selectedId = wards.some(ward => ward.id === wardId) ? wardId : wards[0]?.id ?? "";
  const selected = wards.find(ward => ward.id === selectedId);
  return <div className="space-y-6">
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Family centre</p>
      <div className="mt-1 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-2xl font-bold tracking-tight text-foreground">Ward fees</h2><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Check your child's school fee account and payment history when verified billing records are available.</p></div>
      {wards.length > 0 && <div className="w-full sm:w-72"><label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Child</label><Select value={selectedId} onValueChange={setWardId}><SelectTrigger className="h-11 w-full text-sm"><SelectValue placeholder="Choose a child" /></SelectTrigger><SelectContent>{wards.map(ward => <SelectItem key={ward.id} value={ward.id}>{fullName(ward)}</SelectItem>)}</SelectContent></Select></div>}</div>
      {selected && <div className="mt-4 flex items-center gap-3 rounded-xl bg-muted/50 p-3"><span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><UserRound className="size-5" /></span><div><p className="text-sm font-semibold text-foreground">{fullName(selected)}</p><p className="text-xs text-muted-foreground">{selected.class?.name ?? "Class not assigned"}</p></div></div>}
    </section>
    {wardsQuery.isPending ? <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-12 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading linked children…</div> :
    wardsQuery.isError ? <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">Your linked children could not be loaded. Please try again later.</div> :
    wards.length === 0 ? <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center"><UserRound className="mx-auto size-8 text-muted-foreground" /><h3 className="mt-3 font-semibold text-foreground">No children linked yet</h3><p className="mt-2 text-sm text-muted-foreground">Contact the school office to link your child to this guardian account.</p></div> :
    <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center"><span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><CreditCard className="size-5" /></span><h3 className="mt-4 font-semibold text-foreground">Fee records are not available here yet</h3><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Your child is selected, but SchoolHub does not yet provide a verified guardian-facing fee balance and payment history endpoint. No balances or payment statuses are being estimated.</p><p className="mt-4 inline-flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-3.5" /> Ask the school accounts office for the current statement.</p></div>}
  </div>;
}
