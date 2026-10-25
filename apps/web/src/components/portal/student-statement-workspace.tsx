import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Download, FileSpreadsheet, FileText, LoaderCircle, Printer, Search, UserRound } from "lucide-react";
import type { StudentStatementResponse } from "@schoolhub/shared";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

interface StudentOption {
  id: string;
  studentId?: string;
  admissionNumber?: string | null;
  profile?: { firstName?: string | null; otherNames?: string | null; lastName?: string | null };
  class?: { name?: string | null } | null;
}

interface AcademicTerm {
  id: string;
  name: string;
  isCurrent: boolean;
}
interface AcademicYear {
  id: string;
  name: string;
  isCurrent: boolean;
  terms: AcademicTerm[];
}
interface StudentPage {
  data: StudentOption[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

type Scope = "term" | "year" | "all";

const money = (value: string | number) =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);

const inputClass = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/30";
const secondaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";
const primaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

function nameOf(student: StudentOption) {
  return [student.profile?.firstName, student.profile?.otherNames, student.profile?.lastName].filter(Boolean).join(" ").trim()
    || student.admissionNumber || student.studentId || "Student";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function StudentStatementWorkspace() {
  const [search, setSearch] = useState("");
  const [studentId, setStudentId] = useState(() => new URLSearchParams(window.location.search).get("studentId") ?? "");
  const [scope, setScope] = useState<Scope>("term");
  const [yearId, setYearId] = useState("");
  const [termId, setTermId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);

  const yearsQuery = useQuery({
    queryKey: ["schools", "academic-years"],
    queryFn: () => apiFetch<AcademicYear[]>("/schools/academic-years"),
    retry: false,
  });
  const years = yearsQuery.data ?? [];
  const currentYear = years.find((year) => year.isCurrent) ?? years[0];
  const selectedYearId = yearId || currentYear?.id || "";
  const selectedYear = years.find((year) => year.id === selectedYearId);
  const selectedTermId = termId || selectedYear?.terms.find((term) => term.isCurrent)?.id || selectedYear?.terms[0]?.id || "";

  const studentsQuery = useQuery({
    queryKey: ["finance", "statement-student-search", search.trim()],
    queryFn: () => apiFetch<StudentPage>(`/students?search=${encodeURIComponent(search.trim())}&page=1&limit=50`),
    enabled: search.trim().length >= 2,
    retry: false,
  });

  const statementQuery = useQuery({
    queryKey: ["finance", "student-statement", studentId, scope, selectedYearId, selectedTermId, from, to],
    queryFn: () => {
      const params = new URLSearchParams({ scope });
      if (scope !== "all" && selectedYearId) params.set("yearId", selectedYearId);
      if (scope === "term" && selectedTermId) params.set("termId", selectedTermId);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      return apiFetch<StudentStatementResponse>(`/finance/students/${encodeURIComponent(studentId)}/statement?${params.toString()}`);
    },
    enabled: Boolean(studentId),
    retry: false,
  });

  const statement = statementQuery.data;
  const statementRows = useMemo(() => statement?.entries ?? [], [statement?.entries]);
  const filenamePart = (statement?.student.admissionNumber || statement?.student.id || "student").replace(/[^a-zA-Z0-9_-]/g, "-");

  const printStatement = () => window.print();

  const exportPdf = async () => {
    if (!statement) return;
    setExporting("pdf");
    try {
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      pdf.setFontSize(16);
      pdf.text("Student Statement of Account", 14, 18);
      pdf.setFontSize(10);
      pdf.text(statement.student.name, 14, 26);
      pdf.text(`Admission number: ${statement.student.admissionNumber ?? "—"}`, 14, 32);
      pdf.text(`Period: ${statement.period.academicYear ?? "All years"} ${statement.period.term ? "· " + statement.period.term : ""}`, 14, 38);
      pdf.text(`Opening balance: GHS ${statement.openingBalance}`, 14, 44);
      autoTable(pdf, {
        startY: 50,
        head: [["Date", "Type", "Reference", "Description", "Amount (GHS)", "Balance (GHS)"]],
        body: statementRows.map((row) => [
          row.date,
          row.type,
          row.reference,
          row.description,
          row.amount,
          row.runningBalance,
        ]),
        styles: { fontSize: 7, cellPadding: 2, overflow: "linebreak" },
        columnStyles: { 3: { cellWidth: 48 }, 4: { halign: "right" }, 5: { halign: "right" } },
        didDrawPage: () => {
          const pageNumber = pdf.getNumberOfPages();
          pdf.setFontSize(8);
          pdf.text("Confidential · SchoolHub statement", 14, 287);
          pdf.text(`Page ${pageNumber}`, 194, 287, { align: "right" });
        },
      });
      const finalY = (pdf as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 55;
      pdf.setFontSize(10);
      pdf.text(`Closing balance: GHS ${statement.closingBalance}`, 14, Math.min(280, finalY + 8));
      pdf.save(`student-statement-${filenamePart}.pdf`);
    } finally {
      setExporting(null);
    }
  };

  const exportExcel = async () => {
    if (!statement) return;
    setExporting("excel");
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "SchoolHub";
      workbook.created = new Date();
      const info = workbook.addWorksheet("Report info");
      info.addRows([
        ["Report", "Student statement of account"],
        ["Student", statement.student.name],
        ["Admission number", statement.student.admissionNumber ?? "—"],
        ["Scope", statement.scope],
        ["Academic year", statement.period.academicYear ?? "All years"],
        ["Term", statement.period.term ?? "All terms"],
        ["From", statement.period.from ?? "—"],
        ["To", statement.period.to ?? "—"],
        ["Opening balance (GHS)", Number(statement.openingBalance)],
        ["Closing balance (GHS)", Number(statement.closingBalance)],
        ["Unallocated credit (GHS)", Number(statement.unallocatedCredit)],
        ["Generated at", new Date().toISOString()],
      ]);
      info.getColumn(1).width = 28;
      info.getColumn(2).width = 40;
      for (const rowNumber of [9, 10, 11]) {
        info.getCell(rowNumber, 2).numFmt = "#,##0.00";
      }

      const sheet = workbook.addWorksheet("Statement", { views: [{ state: "frozen", ySplit: 1 }] });
      sheet.columns = [
        { header: "Date", key: "date", width: 14 },
        { header: "Type", key: "type", width: 14 },
        { header: "Reference", key: "reference", width: 20 },
        { header: "Description", key: "description", width: 48 },
        { header: "Amount (GHS)", key: "amount", width: 18, style: { numFmt: "#,##0.00" } },
        { header: "Running balance (GHS)", key: "balance", width: 22, style: { numFmt: "#,##0.00" } },
      ];
      statementRows.forEach((row) => sheet.addRow({
        date: row.date,
        type: row.type,
        reference: row.reference,
        description: row.description,
        amount: Number(row.amount),
        balance: Number(row.runningBalance),
      }));
      sheet.getRow(1).font = { bold: true };
      sheet.autoFilter = { from: "A1", to: "F1" };
      const output = await workbook.xlsx.writeBuffer();
      downloadBlob(new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `student-statement-${filenamePart}.xlsx`);
    } finally {
      setExporting(null);
    }
  };

  const selectStudent = (student: StudentOption) => {
    setStudentId(student.id);
    setSearch(nameOf(student));
    const url = new URL(window.location.href);
    url.searchParams.set("studentId", student.id);
    window.history.replaceState({}, "", url);
  };

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Finance</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground">Student statement of account</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Review invoices, discounts, receipts, reversals and the running receivable balance across a term, academic year or the student's account history.</p>
          </div>
          <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">School-scoped records</span>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(260px,1.4fr)_180px_220px_220px]">
          <div className="relative">
            <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
            <input className={cn(inputClass, "pl-9")} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student name or admission number" aria-label="Search student" />
            {studentsQuery.data?.data?.length ? (
              <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-lg">
                {studentsQuery.data.data.map((student) => (
                  <button key={student.id} type="button" onClick={() => selectStudent(student)} className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left hover:bg-muted">
                    <UserRound className="mt-0.5 size-4 text-muted-foreground" />
                    <span><span className="block text-sm font-medium text-foreground">{nameOf(student)}</span><span className="block text-xs text-muted-foreground">{student.admissionNumber ?? "No admission number"}{student.class?.name ? ` · ${student.class.name}` : ""}</span></span>
                  </button>
                ))}
              </div>
            ) : null}
            {studentsQuery.isError && <p role="alert" className="mt-1 text-xs text-destructive">{studentsQuery.error.message}</p>}
          </div>
          <select className={inputClass} value={scope} onChange={(event) => setScope(event.target.value as Scope)} aria-label="Statement scope">
            <option value="term">Current / selected term</option><option value="year">Academic year</option><option value="all">All time</option>
          </select>
          {scope !== "all" ? (
            <select className={inputClass} value={selectedYearId} onChange={(event) => { setYearId(event.target.value); setTermId(""); }} aria-label="Academic year">
              {years.map((year) => <option key={year.id} value={year.id}>{year.name}{year.isCurrent ? " (current)" : ""}</option>)}
            </select>
          ) : <div />}
          {scope === "term" ? (
            <select className={inputClass} value={selectedTermId} onChange={(event) => setTermId(event.target.value)} aria-label="Academic term">
              {(selectedYear?.terms ?? []).map((term) => <option key={term.id} value={term.id}>{term.name}{term.isCurrent ? " (current)" : ""}</option>)}
            </select>
          ) : <div />}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block text-xs font-semibold text-muted-foreground">From (optional)<input className={cn(inputClass, "mt-1")} type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label className="block text-xs font-semibold text-muted-foreground">To (optional)<input className={cn(inputClass, "mt-1")} type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <button className={secondaryButton} type="button" onClick={() => { setFrom(""); setTo(""); }} disabled={!from && !to}>Clear dates</button>
        </div>
      </div>

      {!studentId ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center"><UserRound className="mx-auto size-8 text-muted-foreground" /><h3 className="mt-3 font-semibold text-foreground">Select a student</h3><p className="mt-2 text-sm text-muted-foreground">Search by name or admission number to view the statement.</p></div>
      ) : statementQuery.isPending ? (
        <div role="status" className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-12 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading statement…</div>
      ) : statementQuery.isError ? (
        <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">The statement could not be loaded. {statementQuery.error.message}</div>
      ) : statement ? (
        <div className="student-statement-print space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Opening balance", statement.openingBalance],
              ["Closing balance", statement.closingBalance],
              ["Overdue 90+ days", statement.ageing.days90Plus],
              ["Unallocated credit", statement.unallocatedCredit],
            ].map(([label, value]) => <div key={label} className="rounded-2xl border border-border bg-card p-4"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-2 text-xl font-bold tabular-nums text-foreground">{money(value ?? "0.00")}</p></div>)}
          </div>
          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-foreground">{statement.student.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">Admission no. {statement.student.admissionNumber ?? "—"} · {statement.period.academicYear ?? "All academic years"}{statement.period.term ? ` · ${statement.period.term}` : ""}</p>
                <p className="mt-1 text-xs text-muted-foreground">{statement.period.from ?? "Earliest record"} to {statement.period.to ?? "Today"}</p>
              </div>
              <div className="statement-actions flex flex-wrap gap-2">
                <button type="button" className={secondaryButton} onClick={printStatement}><Printer className="size-4" /> Print</button>
                <button type="button" className={secondaryButton} onClick={exportPdf} disabled={exporting !== null}><FileText className="size-4" /> {exporting === "pdf" ? "Preparing PDF…" : "PDF"}</button>
                <button type="button" className={primaryButton} onClick={exportExcel} disabled={exporting !== null}><FileSpreadsheet className="size-4" /> {exporting === "excel" ? "Preparing Excel…" : "Excel"}</button>
              </div>
            </div>
            <p className="mt-4 rounded-xl border border-border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">This statement is currently reconstructed from existing bills and receipt allocations. The receivables-ledger implementation will become the permanent accounting source of truth in a later phase. Previous-balance snapshots are not treated as a second charge.</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-sm">
                <thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="p-3">Date</th><th className="p-3">Type</th><th className="p-3">Reference</th><th className="p-3">Description</th><th className="p-3 text-right">Amount</th><th className="p-3 text-right">Running balance</th></tr></thead>
                <tbody>
                  {statementRows.length ? statementRows.map((row) => <tr key={row.id} className="border-b border-border/70 last:border-0"><td className="whitespace-nowrap p-3">{row.date}</td><td className="p-3">{row.type}</td><td className="p-3 font-medium">{row.reference}</td><td className="p-3">{row.description}</td><td className={cn("p-3 text-right tabular-nums", Number(row.amount) < 0 ? "text-success" : "text-foreground")}>{money(row.amount)}</td><td className="p-3 text-right font-semibold tabular-nums">{money(row.runningBalance)}</td></tr>) : <tr><td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">No statement activity in this scope.</td></tr>}
                </tbody>
                <tfoot><tr className="border-t-2 border-border font-bold"><td className="p-3" colSpan={4}>Closing balance</td><td className="p-3 text-right">—</td><td className="p-3 text-right tabular-nums">{money(statement.closingBalance)}</td></tr></tfoot>
              </table>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {[
                ["0–30 days", statement.ageing.days0To30],
                ["31–60 days", statement.ageing.days31To60],
                ["61–90 days", statement.ageing.days61To90],
                ["90+ days", statement.ageing.days90Plus],
                ["Not due / no due date", statement.ageing.notDue],
              ].map(([label, value]) => <div key={label} className="rounded-xl bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold tabular-nums">{money(value ?? "0.00")}</p></div>)}
            </div>
          </section>
        </div>
      ) : null}
      <style>{`@media print { body * { visibility: hidden !important; } .student-statement-print, .student-statement-print * { visibility: visible !important; } .student-statement-print { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; padding: 8mm !important; background: white !important; color: black !important; } .statement-actions { display: none !important; } @page { size: A4 landscape; margin: 8mm; } }`}</style>
    </section>
  );
}
