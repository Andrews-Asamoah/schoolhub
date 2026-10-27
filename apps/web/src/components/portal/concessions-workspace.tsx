import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, GraduationCap, HeartHandshake, LoaderCircle, Plus, ShieldCheck, ToggleLeft, ToggleRight } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { FinanceReadOnlyNotice, useFinanceAccess } from "@/components/portal/finance-access";

type ValueType = "PERCENTAGE" | "FIXED";
type StudentOption = {
  id: string;
  admissionNumber?: string | null;
  profile?: { firstName?: string | null; lastName?: string | null } | null;
};
type SchoolYear = { id: string; name: string; isCurrent: boolean; terms: { id: string; name: string; isCurrent: boolean }[] };
type SiblingPolicy = {
  id: string; name: string; minimumWardCount: number; valueType: ValueType;
  value: number | string; isActive: boolean;
};
type Scholarship = {
  id: string; studentId: string; name: string; valueType: ValueType; value: number | string;
  reason?: string | null; isActive: boolean; academicYearId?: string | null; termId?: string | null;
  startDate?: string | null; endDate?: string | null;
  student: StudentOption;
};
type ConcessionsResponse = { siblingPolicies: SiblingPolicy[]; scholarships: Scholarship[] };
type StudentListResponse = { data: StudentOption[]; meta?: { total: number } };

const field = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/30";
const primary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const secondary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-50";
const periodLabel = (award: Scholarship, years: SchoolYear[]) => {
  if (award.termId) {
    for (const year of years) {
      const term = year.terms.find((item) => item.id === award.termId);
      if (term) return year.name + " · " + term.name;
    }
    return "Selected term";
  }
  if (award.academicYearId) return years.find((year) => year.id === award.academicYearId)?.name ?? "Selected year";
  return "All periods";
};
const personName = (student?: StudentOption) => [student?.profile?.firstName, student?.profile?.lastName].filter(Boolean).join(" ").trim() || student?.admissionNumber || "Student";
const money = (value: number | string) => new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 2 }).format(Number(value) || 0);

export function ConcessionsWorkspace() {
  const { canWrite } = useFinanceAccess();
  const client = useQueryClient();
  const [studentSearch, setStudentSearch] = useState("");
  const [policyName, setPolicyName] = useState("Sibling discount");
  const [minimumWardCount, setMinimumWardCount] = useState("2");
  const [policyType, setPolicyType] = useState<ValueType>("PERCENTAGE");
  const [policyValue, setPolicyValue] = useState("5");
  const [studentId, setStudentId] = useState("");
  const [scholarshipName, setScholarshipName] = useState("");
  const [scholarshipType, setScholarshipType] = useState<ValueType>("PERCENTAGE");
  const [scholarshipValue, setScholarshipValue] = useState("");
  const [reason, setReason] = useState("");
  const [academicYearId, setAcademicYearId] = useState("");
  const [termId, setTermId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const concessionsQuery = useQuery({
    queryKey: ["finance", "concessions"],
    queryFn: () => apiFetch<ConcessionsResponse>("/finance/concessions"),
    retry: false,
  });
  const studentsQuery = useQuery({
    queryKey: ["concession-students", studentSearch],
    queryFn: () => apiFetch<StudentListResponse>("/students?limit=100&page=1&status=ACTIVE" + (studentSearch.trim() ? "&search=" + encodeURIComponent(studentSearch.trim()) : "")),
    retry: false,
  });
  const yearsQuery = useQuery({
    queryKey: ["schools", "academic-years"],
    queryFn: () => apiFetch<SchoolYear[]>("/schools/academic-years"),
    retry: false,
  });

  const createPolicy = useMutation({
    mutationFn: () => apiFetch<SiblingPolicy>("/finance/sibling-discount-policies", {
      method: "POST",
      body: JSON.stringify({ name: policyName, minimumWardCount: Number(minimumWardCount), valueType: policyType, value: Number(policyValue) }),
    }),
    onSuccess: async () => {
      setPolicyName(""); setPolicyValue(""); setFeedback({ kind: "success", text: "Sibling discount rule saved. It will apply to newly generated bills for eligible wards." });
      await client.invalidateQueries({ queryKey: ["finance", "concessions"] });
    },
    onError: (error: Error) => setFeedback({ kind: "error", text: error.message }),
  });
  const createScholarship = useMutation({
    mutationFn: () => apiFetch<Scholarship>("/finance/scholarships", {
      method: "POST",
      body: JSON.stringify({
        studentId, name: scholarshipName, valueType: scholarshipType, value: Number(scholarshipValue),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        ...(academicYearId ? { academicYearId } : {}),
        ...(termId ? { termId } : {}),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
      }),
    }),
    onSuccess: async () => {
      setScholarshipName(""); setScholarshipValue(""); setReason(""); setStartDate(""); setEndDate("");
      setFeedback({ kind: "success", text: "Scholarship saved. It will be included when new bills are generated for the student." });
      await client.invalidateQueries({ queryKey: ["finance", "concessions"] });
    },
    onError: (error: Error) => setFeedback({ kind: "error", text: error.message }),
  });
  const togglePolicy = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => apiFetch("/finance/sibling-discount-policies/" + id, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["finance", "concessions"] }),
    onError: (error: Error) => setFeedback({ kind: "error", text: error.message }),
  });
  const toggleScholarship = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => apiFetch("/finance/scholarships/" + id, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["finance", "concessions"] }),
    onError: (error: Error) => setFeedback({ kind: "error", text: error.message }),
  });

  const policies = concessionsQuery.data?.siblingPolicies ?? [];
  const scholarships = concessionsQuery.data?.scholarships ?? [];
  const students = studentsQuery.data?.data ?? [];
  const years = yearsQuery.data ?? [];
  const availableTerms = useMemo(() => years.find((year) => year.id === academicYearId)?.terms ?? [], [years, academicYearId]);

  return (
    <div className="mx-auto w-full min-w-0 max-w-screen-2xl space-y-6">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Finance & bursary</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">Scholarships & sibling discounts</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Set school-wide family discount rules and award individual scholarships. Concessions are recorded against each new bill, with a clear audit trail; existing bills are never silently rewritten.</p>
      </section>

      {feedback && <div role={feedback.kind === "error" ? "alert" : "status"} className={cn("rounded-xl border p-3 text-sm", feedback.kind === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-border bg-muted/40 text-foreground")}>{feedback.text}</div>}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><HeartHandshake className="size-4" /> Discount rules</div><p className="mt-2 text-2xl font-bold">{policies.filter((p) => p.isActive).length}</p><p className="text-xs text-muted-foreground">Active sibling rules</p></div>
        <div className="rounded-2xl border border-border bg-card p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><GraduationCap className="size-4" /> Scholarships</div><p className="mt-2 text-2xl font-bold">{scholarships.filter((s) => s.isActive).length}</p><p className="text-xs text-muted-foreground">Active student awards</p></div>
        <div className="rounded-2xl border border-border bg-card p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="size-4" /> Billing protection</div><p className="mt-2 text-sm font-semibold">Audited & capped</p><p className="text-xs text-muted-foreground">Discounts cannot reduce a bill below zero</p></div>
      </div>

      {!canWrite && <FinanceReadOnlyNotice />}
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-2 text-primary"><HeartHandshake className="size-5" /></div><div><h2 className="font-semibold">Sibling discount rules</h2><p className="mt-1 text-sm text-muted-foreground">Based on active wards linked to the same guardian account.</p></div></div>
          {canWrite && (<form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); setFeedback(null); createPolicy.mutate(); }}>
            <label className="text-sm font-medium sm:col-span-2">Rule name<input className={cn(field, "mt-1")} value={policyName} onChange={(e) => setPolicyName(e.target.value)} required maxLength={120} placeholder="e.g. Three-ward family discount" /></label>
            <label className="text-sm font-medium">Minimum linked wards<input className={cn(field, "mt-1")} type="number" min="2" max="30" value={minimumWardCount} onChange={(e) => setMinimumWardCount(e.target.value)} required /></label>
            <label className="text-sm font-medium">Discount type<Select value={policyType} onValueChange={(value) => setPolicyType(value as ValueType)}><SelectTrigger aria-label="Discount type" className={cn(field, "mt-1")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PERCENTAGE">Percentage (%)</SelectItem><SelectItem value="FIXED">Fixed amount (GHS)</SelectItem></SelectContent></Select></label>
            <label className="text-sm font-medium sm:col-span-2">Discount value<input className={cn(field, "mt-1")} type="number" min="0.01" max={policyType === "PERCENTAGE" ? "100" : "100000000"} step="0.01" value={policyValue} onChange={(e) => setPolicyValue(e.target.value)} required /><span className="mt-1 block text-xs text-muted-foreground">{policyType === "PERCENTAGE" ? "Enter a percentage from 0.01% to 100%." : "The fixed discount is capped at the remaining bill amount."}</span></label>
            <button className={cn(primary, "sm:col-span-2")} type="submit" disabled={createPolicy.isPending}>{createPolicy.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />} Save sibling rule</button>
          </form>)}
          <div className="mt-5 space-y-2">
            {concessionsQuery.isPending ? <p className="text-sm text-muted-foreground">Loading discount rules…</p> : concessionsQuery.error ? <p role="alert" className="text-sm text-destructive">{concessionsQuery.error.message}</p> : policies.length === 0 ? <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No sibling discount rules yet.</p> : policies.map((policy) => <div key={policy.id} className="flex items-center gap-3 rounded-xl border border-border p-3"><div className="min-w-0 flex-1"><p className="font-medium">{policy.name}</p><p className="text-xs text-muted-foreground">From {policy.minimumWardCount} linked wards · {policy.valueType === "PERCENTAGE" ? policy.value + "%" : money(policy.value)}</p></div>{canWrite && <button type="button" className={secondary} onClick={() => togglePolicy.mutate({ id: policy.id, isActive: !policy.isActive })} disabled={togglePolicy.isPending} aria-label={policy.isActive ? "Deactivate " + policy.name : "Activate " + policy.name}>{policy.isActive ? <ToggleRight className="size-4 text-primary" /> : <ToggleLeft className="size-4" />}{policy.isActive ? "Active" : "Inactive"}</button>}</div>)}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-2 text-primary"><GraduationCap className="size-5" /></div><div><h2 className="font-semibold">Award a scholarship</h2><p className="mt-1 text-sm text-muted-foreground">Apply a percentage or fixed amount to one student's future bills.</p></div></div>
          {canWrite && (<form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); setFeedback(null); createScholarship.mutate(); }}>
            <label className="text-sm font-medium sm:col-span-2">Find student<input className={cn(field, "mt-1")} value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="Search by name or admission number" /></label>
            <label className="text-sm font-medium sm:col-span-2">Student<Select value={studentId || "__none__"} onValueChange={(value) => setStudentId(value === "__none__" ? "" : value)} required><SelectTrigger aria-label="Student" className={cn(field, "mt-1")}><SelectValue placeholder="Select a student" /></SelectTrigger><SelectContent><SelectItem value="__none__">Select a student</SelectItem>{students.map((student) => <SelectItem key={student.id} value={student.id}>{personName(student)}{student.admissionNumber ? " · " + student.admissionNumber : ""}</SelectItem>)}</SelectContent></Select>{studentsQuery.isPending && <span className="mt-1 block text-xs text-muted-foreground">Loading students…</span>}</label>
            <label className="text-sm font-medium sm:col-span-2">Scholarship name<input className={cn(field, "mt-1")} value={scholarshipName} onChange={(e) => setScholarshipName(e.target.value)} required maxLength={120} placeholder="e.g. Academic excellence scholarship" /></label>
            <label className="text-sm font-medium">Award type<Select value={scholarshipType} onValueChange={(value) => setScholarshipType(value as ValueType)}><SelectTrigger aria-label="Award type" className={cn(field, "mt-1")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PERCENTAGE">Percentage (%)</SelectItem><SelectItem value="FIXED">Fixed amount (GHS)</SelectItem></SelectContent></Select></label>
            <label className="text-sm font-medium">Value<input className={cn(field, "mt-1")} type="number" min="0.01" max={scholarshipType === "PERCENTAGE" ? "100" : "100000000"} step="0.01" value={scholarshipValue} onChange={(e) => setScholarshipValue(e.target.value)} required /></label>
            <label className="text-sm font-medium sm:col-span-2">Reason / approval note<input className={cn(field, "mt-1")} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Optional note for the school's audit trail" /></label>
            <label className="text-sm font-medium">Academic year<Select value={academicYearId || "__all__"} onValueChange={(value) => { setAcademicYearId(value === "__all__" ? "" : value); setTermId(""); }}><SelectTrigger aria-label="Academic year" className={cn(field, "mt-1")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all__">All years</SelectItem>{years.map((year) => <SelectItem key={year.id} value={year.id}>{year.name}{year.isCurrent ? " (Current)" : ""}</SelectItem>)}</SelectContent></Select></label>
            <label className="text-sm font-medium">Term<Select value={termId || "__all__"} onValueChange={(value) => setTermId(value === "__all__" ? "" : value)} disabled={!academicYearId}><SelectTrigger aria-label="Term" className={cn(field, "mt-1")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all__">All terms</SelectItem>{availableTerms.map((term) => <SelectItem key={term.id} value={term.id}>{term.name}{term.isCurrent ? " (Current)" : ""}</SelectItem>)}</SelectContent></Select></label>
            <label className="text-sm font-medium">Start date (optional)<DatePicker buttonClassName={cn(field, "mt-1")} value={startDate} onChange={(value) => setStartDate(value)} /></label>
            <label className="text-sm font-medium">End date (optional)<DatePicker buttonClassName={cn(field, "mt-1")} min={startDate || undefined} value={endDate} onChange={(value) => setEndDate(value)} /></label>
            <button className={cn(primary, "sm:col-span-2")} type="submit" disabled={createScholarship.isPending || !studentId}>{createScholarship.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />} Save scholarship</button>
          </form>)}
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <BadgeCheck className="size-5 text-primary" />
          <div><h2 className="font-semibold">Student scholarships</h2><p className="text-sm text-muted-foreground">Existing awards and their current status.</p></div>
        </div>
        {concessionsQuery.isPending ? <p className="text-sm text-muted-foreground">Loading scholarships…</p>
          : concessionsQuery.error ? <p role="alert" className="text-sm text-destructive">{concessionsQuery.error.message}</p>
          : scholarships.length === 0 ? <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No student scholarships have been recorded.</p>
          : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
            <thead><tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground"><th className="p-3">Student</th><th className="p-3">Award</th><th className="p-3">Value</th><th className="p-3">Period</th><th className="p-3">Status</th><th className="p-3">Action</th></tr></thead>
            <tbody>{scholarships.map((award) => <tr key={award.id} className="border-b border-border/70 last:border-0">
              <td className="p-3"><p className="font-medium">{personName(award.student)}</p><p className="text-xs text-muted-foreground">{award.student.admissionNumber || "No admission number"}</p></td>
              <td className="p-3"><p>{award.name}</p><p className="max-w-xs truncate text-xs text-muted-foreground">{award.reason || "No note provided"}</p></td>
              <td className="p-3 font-medium">{award.valueType === "PERCENTAGE" ? award.value + "%" : money(award.value)}</td>
              <td className="p-3 text-muted-foreground">{periodLabel(award, years)}</td>
              <td className="p-3"><span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", award.isActive ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>{award.isActive ? "Active" : "Inactive"}</span></td>
              <td className="p-3">{canWrite && <button type="button" className={secondary} disabled={toggleScholarship.isPending} onClick={() => toggleScholarship.mutate({ id: award.id, isActive: !award.isActive })}>{award.isActive ? "Deactivate" : "Reactivate"}</button>}</td>
            </tr>)}</tbody>
          </table></div>}
      </section>
      <p className="text-xs leading-5 text-muted-foreground">These concessions apply to newly generated bills only. Bills already issued retain their original balances and audit history. The system caps combined concessions at the bill amount and applies scholarships before the sibling discount rule.</p>
    </div>
  );
}
