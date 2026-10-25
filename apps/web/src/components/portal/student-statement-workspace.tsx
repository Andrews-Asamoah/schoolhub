import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileDown, FileSpreadsheet, LoaderCircle, Printer, Search, UserRound } from "lucide-react";
import type { FinanceSummaryResponse, StudentStatementResponse, StudentStatementScope } from "@schoolhub/shared";
import { WorkspacePageHeading } from "@/components/school/workspace-ui";
import { exportPdf, exportXlsx, printTable, type ExportTable } from "@/lib/table-export";
import { apiFetch } from "@/lib/api";

interface StudentOption {
  id: string;
  admissionNumber: string | null;
  profile?: { firstName?: string | null; lastName?: string | null; otherNames?: string | null } | null;
  class?: { id: string; name: string } | null;
}

interface AcademicYearOption {
  id: string;
  name: string;
  isCurrent: boolean;
  startDate?: string;
  endDate?: string;
  terms: { id: string; name: string; isCurrent: boolean; startDate?: string; endDate?: string }[];
}

function nameOf(student: StudentOption) {
  return [student.profile?.firstName, student.profile?.otherNames, student.profile?.lastName].filter(Boolean).join(" ") || student.admissionNumber || "Student";
}

function money(value: number) {
  return new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

const scopeLabels: Record<StudentStatementScope, string> = { term: "Term", year: "Academic year", all: "All time" };

export function StudentStatementWorkspace() {
  const [search, setSearch] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [scope, setScope] = useState<StudentStatementScope>("term");
  const yearsQuery = useQuery({
    queryKey: ["schools", "academic-years"],
    queryFn: () => apiFetch<AcademicYearOption[]>("/schools/academic-years"),
    retry: false,
  });
  const years = yearsQuery.data ?? [];
  const selectedYear = years.find((year) => year.id === yearId) ?? years.find((year) => year.isCurrent);
  const [yearId, setYearId] = useState("");
  const [termId, setTermId] = useState("");
  const currentYear = years.find((year) => year.isCurrent);
  const activeYear = years.find((year) => year.id === yearId) ?? currentYear ?? years[0];
  const activeTerm = activeYear?.terms.find((term) => term.id === termId) ?? activeYear?.terms.find((term) => term.isCurrent) ?? activeYear?.terms[0];

  const studentsQuery = useQuery({
    queryKey: ["finance", "statement-student-search", search.trim()],
    queryFn: () => apiFetch<{ data: StudentOption[]; meta: { total: number } }>(`/students?search=${encodeURIComponent(search.trim())}&limit=20`),
    enabled: search.trim().length >= 2,
    retry: false,
  });
  const students = studentsQuery.data?.data ?? [];
  const chosen = students.find((student) => student.id === selectedStudentId);

  const statementParams = new URLSearchParams({ scope });
  if (scope !== "all" && activeYear?.id) statementParams.set("yearId", activeYear.id);
  if (scope === "term" && activeTerm?.id) statementParams.set("termId", activeTerm.id);
  const statementQuery = useQuery({
    queryKey: ["finance", "student-statement", selectedStudentId, scope, activeYear?.id, activeTerm?.id],
    queryFn: () => apiFetch<StudentStatementResponse>(`/finance/students/${encodeURIComponent(selectedStudentId)}/statement?${statementParams.toString()}`),
    enabled: Boolean(selectedStudentId) && (scope === "all" || Boolean(activeYear && (scope === "year" || activeTerm))),
    retry: false,
  });
  const statement = statementQuery.data;

  const exportTable = useMemo<ExportTable | null>(() => {
    if (!statement) return null;
    const studentName = [statement.student.firstName, statement.student.lastName].filter(Boolean).join(" ") || statement.student.admissionNumber || "Student";
    return {
      title: `Statement of account - ${studentName}`,
      headers: ["Date", "Type", "Reference", "Description", "Debit (GHS)", "Credit (GHS)", "Running balance (GHS)"],
      rows: [
        ["", "", "", "Opening balance", "", "", statement.openingBalance],
        ...statement.entries.map((entry) => [new Date(entry.date).toLocaleDateString("en-GB"), entry.type, entry.reference, entry.description, entry.debit, entry.credit, entry.balance]),
        ["", "", "", "Closing balance", "", "", statement.closingBalance],
      ],
    };
  }, [statement]);

  return (
    <div className="space-y-6">
      <WorkspacePageHeading
        section="Finance"
        title="Statements of account"
        description="Review invoices, discounts, receipts, reversals and running balances for a student's account across a term, academic year or all recorded history."
        icon={Search}
      />
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="xl:col-span-2">
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Find a student</label>
            <div className="relative">
              <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <input value={search} onChange={(event) => { setSearch(event.target.value); setSelectedStudentId(""); }} placeholder="Name or admission number (at least 2 characters)" className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/30" />
            </div>
            {search.trim().length >= 2 && (
              <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-border">
                {studentsQuery.isPending ? <p className="p-3 text-sm text-muted-foreground">Searching students…</p>
                  : studentsQuery.isError ? <p role="alert" className="p-3 text-sm text-destructive">{studentsQuery.error.message}</p>
                    : students.length ? students.map((student) => (
                      <button key={student.id} type="button" onClick={() => { setSelectedStudentId(student.id); setSearch(nameOf(student)); }} className={selectedStudentId === student.id ? "flex w-full items-center justify-between gap-2 bg-primary/10 p-3 text-left text-sm" : "flex w-full items-center justify-between gap-2 p-3 text-left text-sm hover:bg-muted"}>
                        <span><span className="block font-semibold text-foreground">{nameOf(student)}</span><span className="text-xs text-muted-foreground">{student.admissionNumber ?? "No admission number"} · {student.class?.name ?? "Class not assigned"}</span></span>
                        {selectedStudentId === student.id ? <span className="text-xs text-primary">Selected</span> : null}
                      </button>
                    )) : <p className="p-3 text-sm text-muted-foreground">No students match this search.</p>}
              </div>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Statement scope</label>
            <select value={scope} onChange={(event) => setScope(event.target.value as StudentStatementScope)} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground">
              <option value="term">Term</option><option value="year">Academic year</option><option value="all">All time</option>
            </select>
          </div>
          {scope !== "all" && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Academic year</label>
              <select value={activeYear?.id ?? ""} onChange={(event) => { setYearId(event.target.value); setTermId(""); }} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground" disabled={yearsQuery.isPending}>
                {years.map((year) => <option key={year.id} value={year.id}>{year.name}{year.isCurrent ? " (Current)" : ""}</option>)}
              </select>
            </div>
          )}
          {scope === "term" && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Term</label>
              <select value={activeTerm?.id ?? ""} onChange={(event) => setTermId(event.target.value)} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground" disabled={!activeYear}>
                {(activeYear?.terms ?? []).map((term) => <option key={term.id} value={term.id}>{term.name}{term.isCurrent ? " (Current)" : ""}</option>)}
              </select>
            </div>
          )}
        </div>
      </section>

      {!selectedStudentId ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center"><UserRound className="mx-auto size-8 text-muted-foreground" /><h2 className="mt-3 font-semibold text-foreground">Select a student</h2><p className="mt-2 text-sm text-muted-foreground">Search by name or admission number to open a statement.</p></div>
      ) : statementQuery.isPending ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card py-12 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading statement…</div>
      ) : statementQuery.isError ? (
        <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">{statementQuery.error.message}</div>
      ) : statement ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Summary label="Opening balance" value={money(statement.openingBalance)} />
            <Summary label="Closing balance" value={money(statement.closingBalance)} />
            <Summary label="Unallocated credit" value={money(statement.unallocatedCredit)} />
            <Summary label="Ageing balance" value={money(statement.ageing.reduce((sum, item) => sum + item.amount, 0))} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={!exportTable} onClick={() => exportTable && printTable(exportTable)} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold disabled:opacity-50"><Printer className="size-4" /> Print</button>
            <button type="button" disabled={!exportTable} onClick={() => exportTable && void exportPdf(exportTable)} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold disabled:opacity-50"><FileDown className="size-4" /> PDF</button>
            <button type="button" disabled={!exportTable} onClick={() => exportTable && void exportXlsx(exportTable)} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold disabled:opacity-50"><FileSpreadsheet className="size-4" /> Excel</button>
            <span className="ml-auto text-xs text-muted-foreground">{statement.period.label} · {statement.entries.length} entries</span>
          </div>
          <section className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="border-b border-border p-4"><h2 className="font-semibold text-foreground">{nameOf({ id: statement.student.id, admissionNumber: statement.student.admissionNumber, profile: { firstName: statement.student.firstName, lastName: statement.student.lastName } })}</h2><p className="mt-1 text-xs text-muted-foreground">{statement.period.from ?? "Opening of record"} to {statement.period.to ?? "Current"}</p></div>
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground"><tr>{["Date", "Type", "Reference", "Description", "Debit", "Credit", "Running balance"].map((label) => <th key={label} className="px-3 py-3 font-semibold">{label}</th>)}</tr></thead>
                <tbody>
                  <tr className="border-t border-border bg-muted/20"><td className="px-3 py-3" colSpan={6}>Opening balance</td><td className="px-3 py-3 text-right font-semibold tabular-nums">{money(statement.openingBalance)}</td></tr>
                  {statement.entries.map((entry) => <tr key={entry.id} className="border-t border-border"><td className="whitespace-nowrap px-3 py-3">{new Date(entry.date).toLocaleDateString("en-GB")}</td><td className="whitespace-nowrap px-3 py-3">{entry.type}</td><td className="whitespace-nowrap px-3 py-3 font-medium">{entry.reference}</td><td className="px-3 py-3">{entry.description}</td><td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{entry.debit ? money(entry.debit) : "—"}</td><td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{entry.credit ? money(entry.credit) : "—"}</td><td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums">{money(entry.balance)}</td></tr>)}
                  <tr className="border-t border-border bg-muted/20"><td className="px-3 py-3 font-semibold" colSpan={6}>Closing balance</td><td className="px-3 py-3 text-right font-bold tabular-nums">{money(statement.closingBalance)}</td></tr>
                </tbody>
              </table>
            </div>
          </section>
          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-4"><h3 className="font-semibold text-foreground">Ageing breakdown</h3><div className="mt-3 divide-y divide-border">{statement.ageing.map((row) => <div key={row.bucket} className="flex justify-between py-2 text-sm"><span className="text-muted-foreground">{row.bucket}</span><span className="font-semibold tabular-nums">{money(row.amount)}</span></div>)}</div></div>
            <div className="rounded-2xl border border-border bg-card p-4"><h3 className="font-semibold text-foreground">Arrears policy</h3><p className="mt-2 text-sm text-muted-foreground">{statement.arrearsPolicy === "BLOCK_CLEARANCE_UNTIL_PAID" ? "Exam clearance is blocked while eligible previous-term arrears remain unpaid." : "Previous-term arrears are displayed for transparency. Review the statement to understand outstanding fees."}</p></div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-lg font-bold tracking-tight text-foreground tabular-nums">{value}</p></div>;
}
