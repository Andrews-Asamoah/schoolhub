import { formatPersonName } from "@schoolhub/shared";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LabeledField } from "@/components/forms/labeled-controls";
import { useDebouncedValue } from "@/components/superadmin/use-debounced-value";
import { authClient } from "@/lib/auth-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BadgeCheck, CalendarDays, CheckCircle2, GraduationCap, HeartHandshake, LoaderCircle, Plus, Search, ShieldCheck, ToggleLeft, ToggleRight, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { FinanceReadOnlyNotice, useFinanceAccess } from "@/components/portal/finance-access";

type ValueType = "PERCENTAGE" | "FIXED";
type StudentOption = {
  id: string;
  admissionNumber?: string | null;
  studentId?: string;
  profile?: { firstName?: string | null; otherNames?: string | null; lastName?: string | null } | null;
};
type SchoolTerm = { id: string; name: string; isCurrent: boolean; startDate: string; endDate: string };
type SchoolYear = { id: string; name: string; isCurrent: boolean; terms: SchoolTerm[] };
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
type StudentSearchResponse = { students: StudentOption[]; hasMore: boolean };

const MAX_AWARD_STUDENTS = 100;
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
const personName = (student: StudentOption) => formatPersonName(student.profile) || student.admissionNumber || "Student";
const studentReference = (student: StudentOption) => student.admissionNumber
  ? `Admission no. ${student.admissionNumber}` : `Student ID ${student.studentId ?? "unavailable"}`;
const termDates = new Intl.DateTimeFormat("en-GH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const money = (value: number | string) => new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 2 }).format(Number(value) || 0);

export function ConcessionsWorkspace() {
  const { canWrite } = useFinanceAccess();
  const client = useQueryClient();
  const [policyName, setPolicyName] = useState("Sibling discount");
  const [minimumWardCount, setMinimumWardCount] = useState("2");
  const [policyType, setPolicyType] = useState<ValueType>("PERCENTAGE");
  const [policyValue, setPolicyValue] = useState("5");
  const [selectedStudents, setSelectedStudents] = useState<StudentOption[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
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
    mutationFn: (studentIds: string[]) => apiFetch<{ awardedCount: number }>("/finance/scholarships/bulk", {
      method: "POST",
      body: JSON.stringify({
        studentIds, name: scholarshipName, valueType: scholarshipType, value: Number(scholarshipValue),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        ...(academicYearId ? { academicYearId } : {}),
        ...(termId ? { termId } : {}),
        ...(!termId && startDate ? { startDate } : {}),
        ...(!termId && endDate ? { endDate } : {}),
      }),
    }),
    onSuccess: async ({ awardedCount }) => {
      setSelectedStudents([]);
      setStudentSearch("");
      setScholarshipName("");
      setScholarshipValue("");
      setReason("");
      setStartDate("");
      setEndDate("");
      setFeedback({ kind: "success", text: `Scholarship awarded to ${awardedCount} ${awardedCount === 1 ? "student" : "students"}. It will apply to eligible new bills.` });
      await client.invalidateQueries({ queryKey: ["finance", "concessions"] });
    },
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
  const years = yearsQuery.data ?? [];
  const availableTerms = years.find(year => year.id === academicYearId)?.terms ?? [];
  const selectedTerm = availableTerms.find(term => term.id === termId);

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

        {canWrite && (
          <section aria-labelledby="award-scholarship" className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex items-start gap-3 border-b border-border bg-primary/5 px-5 py-4 sm:px-6">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <GraduationCap className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h2 id="award-scholarship" className="font-semibold text-foreground">Award a scholarship</h2>
                <p className="mt-1 text-sm text-muted-foreground">Apply the same award to one or more students.</p>
              </div>
            </div>
            <form onSubmit={event => {
              event.preventDefault();
              if (!selectedStudents.length || createScholarship.isPending) return;
              setFeedback(null);
              createScholarship.mutate(selectedStudents.map(student => student.id));
            }}>
              <fieldset className="space-y-5 px-5 py-5 sm:px-6" disabled={createScholarship.isPending}>
                <ScholarshipStudentSearch
                  search={studentSearch}
                  onSearchChange={setStudentSearch}
                  selected={selectedStudents}
                  onToggle={student => setSelectedStudents(current => {
                    if (current.some(item => item.id === student.id)) return current.filter(item => item.id !== student.id);
                    return current.length < MAX_AWARD_STUDENTS ? [...current, student] : current;
                  })}
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <LabeledField label="Scholarship name">
                      <input className={field} value={scholarshipName}
                        onChange={event => setScholarshipName(event.target.value)} required minLength={2} maxLength={120}
                        placeholder="e.g. Academic excellence" />
                    </LabeledField>
                  </div>
                  <LabeledField label="Award type">
                    <Select value={scholarshipType} onValueChange={value => setScholarshipType(value as ValueType)} disabled={createScholarship.isPending}>
                      <SelectTrigger aria-label="Award type" className={field}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                        <SelectItem value="FIXED">Fixed amount</SelectItem>
                      </SelectContent>
                    </Select>
                  </LabeledField>
                  <LabeledField label={scholarshipType === "PERCENTAGE" ? "Award value (%)" : "Award value (GHS)"}>
                    <input className={field} type="number" min="0.01" max={scholarshipType === "PERCENTAGE" ? "100" : "100000000"}
                      step="0.01" value={scholarshipValue} onChange={event => setScholarshipValue(event.target.value)} required />
                  </LabeledField>
                  <div className="sm:col-span-2">
                    <LabeledField label="Approval note (optional)">
                      <textarea className={cn(field, "h-auto min-h-16 resize-y py-2")} value={reason}
                        onChange={event => setReason(event.target.value)} maxLength={500} />
                    </LabeledField>
                  </div>
                </div>

                <div className="space-y-3 border-t border-border pt-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <CalendarDays className="size-4 text-primary" aria-hidden="true" /> Billing period
                  </h3>
                  {yearsQuery.error && <p role="alert" className="text-sm text-destructive">{yearsQuery.error.message}</p>}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <LabeledField label="Academic year">
                      <Select value={academicYearId || "__all__"} disabled={yearsQuery.isPending || yearsQuery.isError || createScholarship.isPending}
                        onValueChange={value => {
                          setAcademicYearId(value === "__all__" ? "" : value);
                          setTermId("");
                        }}>
                        <SelectTrigger aria-label="Academic year" className={field}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">All years</SelectItem>
                          {years.map(year => <SelectItem key={year.id} value={year.id}>{year.name}{year.isCurrent ? " (Current)" : ""}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </LabeledField>
                    <LabeledField label="Term">
                      <Select value={termId || "__all__"} disabled={!academicYearId || createScholarship.isPending}
                        onValueChange={value => {
                          setTermId(value === "__all__" ? "" : value);
                          if (value !== "__all__") {
                            setStartDate("");
                            setEndDate("");
                          }
                        }}>
                        <SelectTrigger aria-label="Term" className={field}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">All terms</SelectItem>
                          {availableTerms.map(term => <SelectItem key={term.id} value={term.id}>{term.name}{term.isCurrent ? " (Current)" : ""}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </LabeledField>
                  </div>
                  {selectedTerm ? (
                    <p role="status" className="rounded-lg bg-primary/5 px-3 py-2 text-sm text-foreground">
                      <span className="font-medium">{selectedTerm.name}</span>
                      <span className="text-muted-foreground"> · {termDates.formatRange(new Date(selectedTerm.startDate), new Date(selectedTerm.endDate))}</span>
                    </p>
                  ) : (
                    <details open={startDate || endDate ? true : undefined} className="rounded-lg border border-border px-3 py-2">
                      <summary className="cursor-pointer text-sm font-medium text-muted-foreground">Custom dates (optional)</summary>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <LabeledField label="Start date">
                          <DatePicker ariaLabel="Start date" buttonClassName={field} value={startDate} onChange={setStartDate} />
                        </LabeledField>
                        <LabeledField label="End date">
                          <DatePicker ariaLabel="End date" buttonClassName={field} min={startDate || undefined} value={endDate} onChange={setEndDate} />
                        </LabeledField>
                      </div>
                    </details>
                  )}
                </div>
              </fieldset>
              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border bg-muted/20 px-5 py-4 sm:px-6">
                {createScholarship.error && <p role="alert" className="mr-auto text-sm text-destructive">{createScholarship.error.message}</p>}
                <Button type="submit" loading={createScholarship.isPending} disabled={!selectedStudents.length || (!!termId && !selectedTerm)}>
                  {selectedStudents.length > 1 ? `Award to ${selectedStudents.length} students` : "Save scholarship"}
                </Button>
              </div>
            </form>
          </section>
        )}
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


function ScholarshipStudentSearch({ search, onSearchChange, selected, onToggle }: {
  search: string;
  onSearchChange: (value: string) => void;
  selected: StudentOption[];
  onToggle: (student: StudentOption) => void;
}) {
  const queryText = search.trim();
  const debounced = useDebouncedValue(queryText, 220);
  const { data: organization } = authClient.useActiveOrganization();
  const ready = !!queryText && queryText === debounced;
  const selectedIds = new Set(selected.map(student => student.id));
  const atLimit = selected.length >= MAX_AWARD_STUDENTS;
  const query = useQuery({
    queryKey: ["finance", "scholarship-students", organization?.id, debounced],
    queryFn: ({ signal }) => apiFetch<StudentSearchResponse>(`/finance/scholarships/students?search=${encodeURIComponent(debounced)}`, { signal }),
    enabled: ready,
    retry: false,
  });
  const matches = ready && !query.isError ? query.data?.students ?? [] : [];
  return (
    <div className="space-y-2">
      <label htmlFor="scholarship-student-search" className="block text-sm font-medium text-foreground">Find students</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden="true" />
        <input id="scholarship-student-search" type="search" autoComplete="off" maxLength={100}
          className={cn(field, "pl-9")} placeholder="Search by name or admission number" value={search}
          onChange={event => onSearchChange(event.target.value)}
          onKeyDown={event => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            const [match] = matches;
            if (!atLimit && matches.length === 1 && match && !selectedIds.has(match.id)) onToggle(match);
          }} />
      </div>
      {queryText && (
        !ready || query.isPending ? (
          <p role="status" className="flex items-center gap-2 px-1 py-1 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Searching active students…
          </p>
        ) : query.isError ? (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
            <span>Student search could not be loaded.</span>
            <Button type="button" variant="outline" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>Retry</Button>
          </div>
        ) : matches.length ? (
          <div>
            <p className="sr-only" role="status">{matches.length} matching students</p>
            <ul aria-label="Matching students" className="max-h-52 divide-y divide-border overflow-auto rounded-xl border border-border">
              {matches.map(match => {
                const isSelected = selectedIds.has(match.id);
                return (
                  <li key={match.id}>
                    <button type="button" aria-pressed={isSelected} disabled={atLimit && !isSelected}
                      className={cn("flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50", isSelected && "bg-primary/5")}
                      onClick={() => onToggle(match)}>
                      <span className="min-w-0">
                        <span className="block break-words text-sm font-medium text-foreground">{personName(match)}</span>
                        <span className="block break-words text-xs text-muted-foreground">{studentReference(match)}</span>
                      </span>
                      {isSelected
                        ? <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
                        : <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
            </ul>
            {query.data?.hasMore && <p className="mt-2 text-xs text-muted-foreground">Refine your search to see more matches.</p>}
          </div>
        ) : <p role="status" className="px-1 py-1 text-sm text-muted-foreground">No active students match this search.</p>
      )}

      {selected.length > 0 && (
        <div className="rounded-xl border border-primary/25 bg-primary/5 p-3">
          <p role="status" className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
            {selected.length} {selected.length === 1 ? "student selected" : "students selected"}
          </p>
          <ul aria-label="Selected students" className="flex max-h-40 flex-wrap gap-2 overflow-auto">
            {selected.map(student => (
              <li key={student.id} className="flex max-w-full items-center gap-1 rounded-lg border border-border bg-card py-1 pl-2.5 pr-1">
                <div className="min-w-0">
                  <p className="break-words text-xs font-medium text-foreground">{personName(student)}</p>
                  <p className="break-words text-xs text-muted-foreground">{studentReference(student)}</p>
                </div>
                <Button type="button" variant="ghost" size="sm" className="h-8 w-8 px-0" onClick={() => onToggle(student)}
                  aria-label={`Remove ${personName(student)}, ${studentReference(student)}`}>
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
          {atLimit && <p className="mt-2 text-xs text-muted-foreground">You can award up to {MAX_AWARD_STUDENTS} students at a time.</p>}
        </div>
      )}
    </div>
  );
}
