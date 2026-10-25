import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChartColumn, FileDown, FileSpreadsheet, Printer, Search } from "lucide-react";
import type { FinanceSummaryResponse } from "@schoolhub/shared";
import { apiFetch } from "@/lib/api";
import { useSchoolRole } from "@/components/school/school-role-switcher";
import { exportPdf, exportXlsx, printTable, type ExportTable } from "@/lib/table-export";

type FormerStudentStatus = "WITHDRAWN" | "TRANSFERRED" | "GRADUATED";
interface ArrearsReviewStudent {
  studentId: string;
  status: string;
  admissionNumber: string | null;
  name: string;
  outstanding: number;
  bills: { id: string; billNumber: string; academicYear: string; term: string | null; balance: number }[];
}
interface ArrearsReviewResponse {
  currentPeriod: { academicYearId: string; academicYear: string; termId: string; term: string };
  activeWithArrears: ArrearsReviewStudent[];
  formerStudents: ArrearsReviewStudent[];
  totalOutstanding: number;
}
interface AcademicYearOption {
  id: string;
  name: string;
  isCurrent: boolean;
  startDate: string;
  endDate: string;
  terms: { id: string; name: string; isCurrent: boolean; startDate: string; endDate: string }[];
}

const money = (value: number) =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0);

export function AccountantFinanceReportingWorkspace() {
  const [scope, setScope] = useState<"term" | "year" | "all">("term");
  const [yearId, setYearId] = useState("");
  const [termId, setTermId] = useState("");
  const [classId, setClassId] = useState("ALL");
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const { activeRole } = useSchoolRole();
  const canChangeArrearsPolicy = ["owner", "admin", "headteacher"].includes(activeRole ?? "");
  const [formerChoices, setFormerChoices] = useState<Record<string, { status: FormerStudentStatus; reason: string }>>({});

  const arrearsReviewQuery = useQuery({
    queryKey: ["finance", "arrears-review"],
    queryFn: () => apiFetch<ArrearsReviewResponse>("/finance/arrears-review"),
    retry: false,
  });
  const markFormerStudent = useMutation({
    mutationFn: (input: { studentId: string; status: FormerStudentStatus; reason: string }) =>
      apiFetch(`/finance/arrears-review/${encodeURIComponent(input.studentId)}/mark-former`, {
        method: "POST",
        body: JSON.stringify({ status: input.status, reason: input.reason }),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["finance", "arrears-review"] }),
        queryClient.invalidateQueries({ queryKey: ["finance", "bills"] }),
        queryClient.invalidateQueries({ queryKey: ["finance", "summary"] }),
        queryClient.invalidateQueries({ queryKey: ["students"] }),
      ]);
    },
  });

  const arrearsPolicyQuery = useQuery({
    queryKey: ["finance", "arrears-policy"],
    queryFn: () => apiFetch<{ schoolId: string; arrearsPolicy: "SHOW_ONLY" | "BLOCK_CLEARANCE_UNTIL_PAID" }>("/finance/arrears-policy"),
    retry: false,
  });
  const updateArrearsPolicy = useMutation({
    mutationFn: (arrearsPolicy: "SHOW_ONLY" | "BLOCK_CLEARANCE_UNTIL_PAID") =>
      apiFetch("/finance/arrears-policy", { method: "PUT", body: JSON.stringify({ arrearsPolicy }) }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["finance", "arrears-policy"] }),
        queryClient.invalidateQueries({ queryKey: ["finance", "summary"] }),
        queryClient.invalidateQueries({ queryKey: ["finance", "student-statement"] }),
        queryClient.invalidateQueries({ queryKey: ["students", "me", "fee-status"] }),
      ]);
    },
  });

  const yearsQuery = useQuery({
    queryKey: ["schools", "academic-years"],
    queryFn: () => apiFetch<AcademicYearOption[]>("/schools/academic-years"),
    retry: false,
  });
  const years = yearsQuery.data ?? [];
  const activeYear = years.find((year) => year.id === yearId) ?? years.find((year) => year.isCurrent) ?? years[0];
  const activeTerm = activeYear?.terms.find((term) => term.id === termId) ?? activeYear?.terms.find((term) => term.isCurrent) ?? activeYear?.terms[0];

  const queryParams = new URLSearchParams();
  if (scope !== "all" && activeYear) queryParams.set("yearId", activeYear.id);
  if (scope === "term" && activeTerm) queryParams.set("termId", activeTerm.id);
  const summaryQuery = useQuery({
    queryKey: ["finance", "summary", "report", scope, activeYear?.id, activeTerm?.id],
    queryFn: () => apiFetch<FinanceSummaryResponse>(`/finance/summary?${queryParams.toString()}`),
    enabled: scope === "all" || Boolean(activeYear && (scope === "year" || activeTerm)),
    retry: false,
  });
  const summary = summaryQuery.data;

  const classRows = useMemo(() => (summary?.byClass ?? []).filter((row) => {
    const matchesClass = classId === "ALL" || row.classId === classId;
    const needle = search.trim().toLocaleLowerCase("en-GB");
    return matchesClass && (!needle || row.className.toLocaleLowerCase("en-GB").includes(needle));
  }), [summary?.byClass, classId, search]);

  const exportTable = useMemo<ExportTable | null>(() => {
    if (!summary) return null;
    const period = summary.scope.termName
      ? `${summary.scope.academicYearName} — ${summary.scope.termName}`
      : summary.scope.academicYearName ?? "All recorded periods";
    return {
      title: `SchoolHub finance report — ${period}`,
      headers: ["Class", "Bills", "Billed (GHS)", "Collected (GHS)", "Outstanding (GHS)"],
      rows: [
        ...classRows.map((row) => [row.className, row.billCount, row.billed, row.collected, row.outstanding]),
        ["TOTAL", classRows.reduce((sum, row) => sum + row.billCount, 0), classRows.reduce((sum, row) => sum + row.billed, 0), classRows.reduce((sum, row) => sum + row.collected, 0), classRows.reduce((sum, row) => sum + row.outstanding, 0)],
      ],
    };
  }, [summary, classRows]);

  const summaryCards = [
    { label: "Billed", value: summary?.billed ?? 0 },
    { label: "Collected", value: summary?.collected ?? 0 },
    { label: "Outstanding", value: summary?.outstanding ?? 0 },
    { label: "Overdue", value: summary?.overdue ?? 0 },
  ];

  return (
    <section className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-muted p-2"><ChartColumn className="size-5 text-primary" /></span>
          <div><h2 className="text-lg font-semibold text-foreground">Finance reporting workspace</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Reports use server-side aggregates over the selected academic term or year, not the first page of bills and payments.</p></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!exportTable} onClick={() => exportTable && printTable(exportTable)} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold disabled:opacity-50"><Printer className="size-4" /> Print</button>
          <button type="button" disabled={!exportTable} onClick={() => exportTable && void exportPdf(exportTable)} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold disabled:opacity-50"><FileDown className="size-4" /> PDF</button>
          <button type="button" disabled={!exportTable} onClick={() => exportTable && void exportXlsx(exportTable)} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold disabled:opacity-50"><FileSpreadsheet className="size-4" /> Excel</button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-semibold text-muted-foreground">Scope<select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)} className="mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"><option value="term">Academic term</option><option value="year">Academic year</option><option value="all">All recorded periods</option></select></label>
        {scope !== "all" && <label className="text-xs font-semibold text-muted-foreground">Academic year<select value={activeYear?.id ?? ""} onChange={(event) => { setYearId(event.target.value); setTermId(""); }} className="mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground" disabled={yearsQuery.isPending}>{years.map((year) => <option key={year.id} value={year.id}>{year.name}{year.isCurrent ? " (Current)" : ""}</option>)}</select></label>}
        {scope === "term" && <label className="text-xs font-semibold text-muted-foreground">Term<select value={activeTerm?.id ?? ""} onChange={(event) => setTermId(event.target.value)} className="mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground" disabled={!activeYear}>{(activeYear?.terms ?? []).map((term) => <option key={term.id} value={term.id}>{term.name}{term.isCurrent ? " (Current)" : ""}</option>)}</select></label>}
        <label className="text-xs font-semibold text-muted-foreground">Class<select value={classId} onChange={(event) => setClassId(event.target.value)} className="mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"><option value="ALL">All classes</option>{(summary?.byClass ?? []).filter((row) => row.classId).map((row) => <option key={row.classId!} value={row.classId!}>{row.className}</option>)}</select></label>
      </div>

      <section className="rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h3 className="font-semibold text-foreground">Arrears and examination clearance</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              SHOW_ONLY displays prior-term balances without automatically blocking clearance. BLOCK_CLEARANCE_UNTIL_PAID prevents fee clearance while previous-term arrears remain unpaid.
            </p>
          </div>
          <div className="min-w-64">
            <label htmlFor="arrears-policy" className="mb-1.5 block text-xs font-semibold text-muted-foreground">School arrears policy</label>
            <select
              id="arrears-policy"
              value={arrearsPolicyQuery.data?.arrearsPolicy ?? "SHOW_ONLY"}
              onChange={(event) => updateArrearsPolicy.mutate(event.target.value as "SHOW_ONLY" | "BLOCK_CLEARANCE_UNTIL_PAID")}
              disabled={!canChangeArrearsPolicy || arrearsPolicyQuery.isPending || updateArrearsPolicy.isPending}
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground disabled:opacity-60"
            >
              <option value="SHOW_ONLY">Show arrears only (default)</option>
              <option value="BLOCK_CLEARANCE_UNTIL_PAID">Block clearance until paid</option>
            </select>
            {updateArrearsPolicy.isPending && <p className="mt-1 text-xs text-muted-foreground">Saving policy…</p>}
            {updateArrearsPolicy.isError && <p role="alert" className="mt-1 text-xs text-destructive">{updateArrearsPolicy.error.message}</p>}
            {arrearsPolicyQuery.isError && <p role="alert" className="mt-1 text-xs text-destructive">The school policy could not be loaded.</p>}
            {!canChangeArrearsPolicy && <p className="mt-1 text-xs text-muted-foreground">Only an owner, administrator or headteacher may change this policy.</p>}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-foreground">Term-end arrears review</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Review unpaid previous-term invoices before generating new-term bills. Mark a student as withdrawn, transferred or graduated only when confirmed by the school; the source invoices remain open and are never deleted.
            </p>
          </div>
          {arrearsReviewQuery.data && <span className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{arrearsReviewQuery.data.currentPeriod.academicYear} · {arrearsReviewQuery.data.currentPeriod.term}</span>}
        </div>
        {arrearsReviewQuery.isPending ? <p className="mt-4 text-sm text-muted-foreground">Loading students with previous-term arrears…</p>
          : arrearsReviewQuery.isError ? <p role="alert" className="mt-4 text-sm text-destructive">Arrears review could not be loaded: {arrearsReviewQuery.error.message}</p>
            : arrearsReviewQuery.data ? (
              <div className="mt-4 space-y-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Active students with arrears</p><p className="mt-1 text-lg font-bold text-foreground">{arrearsReviewQuery.data.activeWithArrears.length}</p></div>
                  <div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Former students with arrears</p><p className="mt-1 text-lg font-bold text-foreground">{arrearsReviewQuery.data.formerStudents.length}</p></div>
                  <div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Total previous balance</p><p className="mt-1 text-lg font-bold text-foreground tabular-nums">{money(arrearsReviewQuery.data.totalOutstanding)}</p></div>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Active students</h4>
                  {arrearsReviewQuery.data.activeWithArrears.length === 0
                    ? <p className="mt-2 rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">No active students have unpaid previous-term invoices.</p>
                    : <div className="mt-2 divide-y divide-border rounded-xl border border-border">
                      {arrearsReviewQuery.data.activeWithArrears.map((student) => {
                        const choice = formerChoices[student.studentId] ?? { status: "WITHDRAWN" as FormerStudentStatus, reason: "" };
                        return <div key={student.studentId} className="space-y-3 p-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div><p className="text-sm font-semibold text-foreground">{student.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{student.admissionNumber ?? "No admission number"} · {student.bills.length} unpaid invoice(s)</p></div>
                            <p className="text-sm font-bold tabular-nums text-foreground">{money(student.outstanding)}</p>
                          </div>
                          <div className="flex flex-col gap-2 md:flex-row md:items-end">
                            <label className="text-xs font-semibold text-muted-foreground">If the student has left<select value={choice.status} disabled={!canChangeArrearsPolicy || markFormerStudent.isPending} onChange={(event) => setFormerChoices((state) => ({ ...state, [student.studentId]: { ...choice, status: event.target.value as FormerStudentStatus } }))} className="mt-1.5 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground md:w-44"><option value="WITHDRAWN">Withdrawn</option><option value="TRANSFERRED">Transferred</option><option value="GRADUATED">Graduated</option></select></label>
                            <label className="flex-1 text-xs font-semibold text-muted-foreground">Reason (required)<input value={choice.reason} disabled={!canChangeArrearsPolicy || markFormerStudent.isPending} onChange={(event) => setFormerChoices((state) => ({ ...state, [student.studentId]: { ...choice, reason: event.target.value } }))} placeholder="e.g. Transfer confirmed by school" className="mt-1.5 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" /></label>
                            {canChangeArrearsPolicy && <button type="button" disabled={markFormerStudent.isPending || choice.reason.trim().length < 10} onClick={() => markFormerStudent.mutate({ studentId: student.studentId, status: choice.status, reason: choice.reason.trim() })} className="h-9 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50">Mark former</button>}
                          </div>
                          <p className="text-xs text-muted-foreground">This changes the student status and records the reason. Unpaid invoices remain unchanged and visible in the former-student list.</p>
                        </div>;
                      })}
                    </div>}
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Former students with unpaid balances</h4>
                  <div className="mt-2 overflow-x-auto rounded-xl border border-border">
                    <table className="w-full min-w-[500px] text-left text-sm"><thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2">Student</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Outstanding</th></tr></thead><tbody>
                      {arrearsReviewQuery.data.formerStudents.map((student) => <tr key={student.studentId} className="border-t border-border"><td className="px-3 py-2">{student.name}<span className="mt-0.5 block text-xs text-muted-foreground">{student.admissionNumber ?? "No admission number"}</span></td><td className="px-3 py-2">{student.status.replaceAll("_", " ")}</td><td className="px-3 py-2 text-right tabular-nums">{money(student.outstanding)}</td></tr>)}
                      {!arrearsReviewQuery.data.formerStudents.length && <tr><td colSpan={3} className="px-3 py-5 text-center text-sm text-muted-foreground">No former students have outstanding previous-term balances.</td></tr>}
                    </tbody></table>
                  </div>
                </div>
                {!canChangeArrearsPolicy && <p className="text-xs text-muted-foreground">Only an owner, administrator or headteacher may change student status from this review.</p>}
                {markFormerStudent.isError && <p role="alert" className="text-sm text-destructive">Student status was not changed: {markFormerStudent.error.message}</p>}
              </div>
            ) : null}
      </section>

      {scope !== "all" && !activeYear ? <div className="rounded-xl border border-warning/20 bg-warning/10 p-4 text-sm text-warning">Select or configure an academic year before running a report.</div> : null}
      {summaryQuery.isPending ? <div className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">Loading server-side finance report…</div>
        : summaryQuery.error ? <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">Finance report could not be loaded: {summaryQuery.error.message}</div>
          : summary ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{summaryCards.map((card) => <div key={card.label} className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">{card.label}</p><p className="mt-2 text-xl font-bold tracking-tight text-foreground tabular-nums">{money(card.value)}</p><p className="mt-1 text-xs text-muted-foreground">{summary.scope.termName ? `${summary.scope.academicYearName} · ${summary.scope.termName}` : summary.scope.academicYearName ?? "All time"}</p></div>)}</div>

              <div className="relative max-w-md"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter class summary" className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/30" /></div>
              <section className="overflow-hidden rounded-xl border border-border">
                <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground"><tr>{["Class", "Bills", "Billed", "Collected", "Outstanding"].map((label) => <th key={label} className="px-3 py-3 font-semibold">{label}</th>)}</tr></thead>
                  <tbody>
                    {classRows.map((row) => <tr key={row.classId ?? "none"} className="border-t border-border"><td className="px-3 py-3 font-medium">{row.className}</td><td className="px-3 py-3">{row.billCount}</td><td className="px-3 py-3 tabular-nums">{money(row.billed)}</td><td className="px-3 py-3 tabular-nums">{money(row.collected)}</td><td className="px-3 py-3 tabular-nums">{money(row.outstanding)}</td></tr>)}
                    {!classRows.length && <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">No class records match the selected filters.</td></tr>}
                    <tr className="border-t border-border bg-muted/20 font-bold"><td className="px-3 py-3">Filtered total</td><td className="px-3 py-3">{classRows.reduce((sum, row) => sum + row.billCount, 0)}</td><td className="px-3 py-3 tabular-nums">{money(classRows.reduce((sum, row) => sum + row.billed, 0))}</td><td className="px-3 py-3 tabular-nums">{money(classRows.reduce((sum, row) => sum + row.collected, 0))}</td><td className="px-3 py-3 tabular-nums">{money(classRows.reduce((sum, row) => sum + row.outstanding, 0))}</td></tr>
                  </tbody>
                </table></div>
              </section>

              <div className="grid gap-4 lg:grid-cols-2">
                <section className="rounded-xl border border-border p-4"><h3 className="font-semibold text-foreground">Collections by payment method</h3><div className="mt-3 divide-y divide-border">{summary.byPaymentMethod.map((row) => <div key={row.method} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="text-muted-foreground">{row.method.replaceAll("_", " ")}</span><span className="font-semibold tabular-nums">{money(row.amount)} <span className="text-xs font-normal text-muted-foreground">({row.count})</span></span></div>)}{!summary.byPaymentMethod.length && <p className="py-3 text-sm text-muted-foreground">No completed receipts in this scope.</p>}</div></section>
                <section className="rounded-xl border border-border p-4"><h3 className="font-semibold text-foreground">Overdue ageing</h3><div className="mt-3 divide-y divide-border">{summary.ageing.map((row) => <div key={row.bucket} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="text-muted-foreground">{row.bucket} days</span><span className="font-semibold tabular-nums">{money(row.amount)} <span className="text-xs font-normal text-muted-foreground">({row.count} bills)</span></span></div>)}</div></section>
              </div>
            </>
          ) : null}
    </section>
  );
}
