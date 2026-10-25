import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Download, LoaderCircle, Printer, Search, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

interface StatementStudent {
  id: string;
  admissionNumber?: string | null;
  profile?: { firstName?: string | null; lastName?: string | null } | null;
}

interface StatementSchool {
  name: string;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  logo?: string | null;
}

interface StatementBill {
  id: string;
  billNumber: string;
  billType: "INVOICE" | "PROFORMA";
  status: string;
  totalAmount: number | string;
  paidAmount: number | string;
  balanceAmount: number | string;
  issuedAt: string;
  dueDate?: string | null;
  academicYear?: { id: string; name: string } | null;
  term?: { id: string; name: string } | null;
  feeStructure?: { name: string } | null;
  class?: { id: string; name: string } | null;
}

interface StatementPayment {
  id: string;
  paymentNumber: string;
  amount: number | string;
  paymentMethod: string;
  paymentDate: string;
  status: string;
  referenceNumber?: string | null;
  notes?: string | null;
  reversedAt?: string | null;
  reversalReason?: string | null;
  bill?: { id: string; billNumber: string } | null;
  recordedBy?: { name?: string | null; email?: string | null } | null;
}

interface StudentStatement {
  student: {
    id: string;
    admissionNumber?: string | null;
    outstandingBalance: number | string;
    profile?: { firstName?: string | null; lastName?: string | null } | null;
  };
  bills: StatementBill[];
  payments: StatementPayment[];
  summary: {
    totalBilled: number | string;
    totalReceipts: number | string;
    totalReversals: number | string;
    netReceipts: number | string;
    openInvoiceBalance: number | string;
    studentOutstandingBalance: number | string;
    reconciliationDifference: number | string;
  };
}

interface StatementRow {
  id: string;
  date: string;
  order: number;
  type: "Invoice" | "Receipt" | "Reversal";
  reference: string;
  description: string;
  debit: number;
  credit: number;
  status: string;
  runningBalance: number;
}

function numeric(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number | string) {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric(value));
}

function dateLabel(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" });
}

function studentLabel(student: StatementStudent | StudentStatement["student"]) {
  const name = [student.profile?.firstName, student.profile?.lastName].filter(Boolean).join(" ");
  return name || "Student";
}

function safeCsvCell(value: unknown) {
  let text = String(value ?? "");
  // Spreadsheet formula injection protection for school-entered names/references.
  if (/^[\t\r\n ]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

function downloadCsv(rows: unknown[][], filename: string) {
  const csv = rows.map((row) => row.map(safeCsvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function StudentAccountStatementDialog({
  student,
  onClose,
}: {
  student: StatementStudent;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const statementQuery = useQuery({
    queryKey: ["finance", "student-statement", student.id],
    queryFn: () => apiFetch<StudentStatement>(`/finance/students/${encodeURIComponent(student.id)}/statement`),
    retry: false,
  });
  const schoolQuery = useQuery({
    queryKey: ["school", "current"],
    queryFn: () => apiFetch<StatementSchool>("/schools/current"),
    retry: false,
  });

  const statement = statementQuery.data;
  const rows = useMemo(() => {
    if (!statement) return [] as StatementRow[];
    const entries: Omit<StatementRow, "runningBalance">[] = [];

    for (const bill of statement.bills) {
      const chargeable = bill.billType === "INVOICE" && !["CANCELLED", "WAIVED"].includes(bill.status);
      const period = [bill.academicYear?.name, bill.term?.name].filter(Boolean).join(" · ");
      entries.push({
        id: `bill:${bill.id}`,
        date: bill.issuedAt,
        order: 0,
        type: "Invoice",
        reference: bill.billNumber,
        description: [bill.feeStructure?.name || "Student fees", period, bill.class?.name].filter(Boolean).join(" · "),
        debit: chargeable ? numeric(bill.totalAmount) : 0,
        credit: 0,
        status: bill.status,
      });
    }

    for (const payment of statement.payments) {
      const wasPosted = payment.status === "COMPLETED" || Boolean(payment.reversedAt);
      entries.push({
        id: `payment:${payment.id}`,
        date: payment.paymentDate,
        order: 1,
        type: "Receipt",
        reference: payment.paymentNumber,
        description: [
          payment.bill?.billNumber ? `Against ${payment.bill.billNumber}` : "Unallocated / account payment",
          payment.paymentMethod.replaceAll("_", " "),
          payment.referenceNumber ? `Ref ${payment.referenceNumber}` : "",
        ].filter(Boolean).join(" · "),
        debit: 0,
        credit: wasPosted ? numeric(payment.amount) : 0,
        status: payment.reversedAt ? `REVERSED — ${payment.status}` : payment.status,
      });

      if (payment.reversedAt) {
        entries.push({
          id: `reversal:${payment.id}`,
          date: payment.reversedAt,
          order: 2,
          type: "Reversal",
          reference: payment.paymentNumber,
          description: [
            payment.status === "REFUNDED" ? "Refund issued" : "Receipt voided",
            payment.reversalReason || "No reversal reason saved",
          ].join(" · "),
          debit: numeric(payment.amount),
          credit: 0,
          status: payment.status === "REFUNDED" ? "REFUNDED" : "VOIDED",
        });
      }
    }

    entries.sort((a, b) => {
      // Accountable activity is posted by calendar date. A database Date value
      // serialises at midnight while issuedAt is a timestamp; compare calendar
      // dates first so a same-day receipt cannot appear before its invoice.
      const dateDiff = a.date.slice(0, 10).localeCompare(b.date.slice(0, 10));
      return dateDiff || a.order - b.order || a.reference.localeCompare(b.reference);
    });

    let runningBalance = 0;
    return entries.map((entry) => {
      runningBalance = Math.round((runningBalance + entry.debit - entry.credit + Number.EPSILON) * 100) / 100;
      return { ...entry, runningBalance };
    });
  }, [statement]);

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [row.type, row.reference, row.description, row.status].some((value) => value.toLowerCase().includes(term)),
    );
  }, [rows, search]);

  const ledgerBalance = rows.length ? rows[rows.length - 1]!.runningBalance : 0;
  const invoiceBalance = numeric(statement?.summary.openInvoiceBalance ?? 0);
  const studentBalance = numeric(statement?.summary.studentOutstandingBalance ?? 0);
  const ledgerDiffersFromInvoices = Math.abs(ledgerBalance - invoiceBalance) > 0.01;
  const studentDiffersFromInvoices = Math.abs(studentBalance - invoiceBalance) > 0.01;

  const exportStatement = () => {
    if (!statement) return;
    downloadCsv([
      ["Student account statement"],
      ["School", schoolQuery.data?.name ?? "SchoolHub"],
      ["Student", studentLabel(statement.student)],
      ["Admission number", statement.student.admissionNumber ?? ""],
      ["Prepared", new Date().toLocaleString("en-GH")],
      [],
      ["Total invoiced (GHS)", numeric(statement.summary.totalBilled).toFixed(2)],
      ["Gross receipts (GHS)", numeric(statement.summary.totalReceipts).toFixed(2)],
      ["Reversals (GHS)", numeric(statement.summary.totalReversals).toFixed(2)],
      ["Net receipts (GHS)", numeric(statement.summary.netReceipts).toFixed(2)],
      ["Open invoice balance (GHS)", numeric(statement.summary.openInvoiceBalance).toFixed(2)],
      ["Student account balance (GHS)", numeric(statement.summary.studentOutstandingBalance).toFixed(2)],
      [],
      ["Date", "Entry type", "Reference", "Details", "Debit (GHS)", "Credit (GHS)", "Running balance (GHS)", "Status"],
      ...visibleRows.map((row) => [
        dateLabel(row.date),
        row.type,
        row.reference,
        row.description,
        row.debit.toFixed(2),
        row.credit.toFixed(2),
        row.runningBalance.toFixed(2),
        row.status,
      ]),
    ], `student-statement-${(statement.student.admissionNumber || statement.student.id).replace(/[^a-zA-Z0-9_-]/g, "_")}.csv`);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/70 p-2 sm:p-4"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-statement-title"
        className="max-h-[96vh] w-full max-w-7xl overflow-y-auto rounded-2xl border border-border bg-card p-4 text-foreground shadow-2xl sm:p-6"
      >
        <div className="student-statement-actions mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Finance & bursary</p>
            <h2 id="student-statement-title" className="mt-1 text-xl font-bold sm:text-2xl">Student statement of account</h2>
            <p className="mt-1 text-sm text-muted-foreground">Complete recorded history across academic years and terms.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50" onClick={exportStatement} disabled={!statement}>
              <Download className="size-4" /> Export CSV
            </button>
            <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50" onClick={() => window.print()} disabled={!statement}>
              <Printer className="size-4" /> Print / Save PDF
            </button>
            <button type="button" className="inline-flex size-10 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-muted" onClick={onClose} aria-label="Close statement">
              <X className="size-4" />
            </button>
          </div>
        </div>

        {statementQuery.isPending ? (
          <div className="flex min-h-56 items-center justify-center gap-3 text-sm text-muted-foreground"><LoaderCircle className="size-5 animate-spin" /> Loading complete student account history…</div>
        ) : statementQuery.error ? (
          <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            Could not load this student's statement. {statementQuery.error.message}
          </div>
        ) : statement ? (
          <div className="student-statement-print space-y-5">
            <header className="flex flex-wrap items-center gap-3 border-b border-border pb-4">
              {schoolQuery.data?.logo ? <img src={schoolQuery.data.logo} alt="" className="size-14 rounded-lg object-contain" /> : <div aria-hidden="true" className="flex size-14 items-center justify-center rounded-xl bg-muted text-lg font-bold">{(schoolQuery.data?.name ?? "SH").slice(0, 2).toUpperCase()}</div>}
              <div className="min-w-0 flex-1">
                <p className="font-bold">{schoolQuery.data?.name ?? "SchoolHub"}</p>
                <p className="text-xs text-muted-foreground">{[schoolQuery.data?.address, schoolQuery.data?.phone, schoolQuery.data?.email].filter(Boolean).join(" · ") || "School finance office"}</p>
              </div>
              <div className="text-right text-xs text-muted-foreground"><div>Prepared on {new Date().toLocaleDateString("en-GH")}</div><div>All recorded years and terms</div></div>
            </header>

            <div className="grid gap-4 sm:grid-cols-2">
              <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Student</p><p className="mt-1 text-lg font-semibold">{studentLabel(statement.student)}</p><p className="text-sm text-muted-foreground">Admission no. {statement.student.admissionNumber || "—"}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Student record balance</p><p className="mt-1 text-lg font-bold tabular-nums">{money(statement.summary.studentOutstandingBalance)}</p><p className="text-xs text-muted-foreground">Stored student balance; compare with the open invoice balance below.</p></div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Metric label="Total invoiced" value={money(statement.summary.totalBilled)} />
              <Metric label="Gross receipts" value={money(statement.summary.totalReceipts)} />
              <Metric label="Reversals" value={money(statement.summary.totalReversals)} />
              <Metric label="Net receipts" value={money(statement.summary.netReceipts)} />
              <Metric label="Open invoice balance" value={money(statement.summary.openInvoiceBalance)} emphasis />
            </div>

            {(ledgerDiffersFromInvoices || studentDiffersFromInvoices) && (
              <div role="alert" className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <div>
                  <p className="font-semibold">Reconciliation review recommended</p>
                  <p className="mt-1 leading-5">
                    The statement activity, open invoice balances, and/or stored student balance do not fully agree.
                    This can happen with unallocated receipts, waived or cancelled invoices, or legacy records. Review the underlying records before making adjustments.
                  </p>
                  <p className="mt-1 text-xs">Activity balance: {money(ledgerBalance)} · Open invoices: {money(invoiceBalance)} · Student record: {money(studentBalance)}</p>
                </div>
              </div>
            )}

            <section>
              <div className="student-statement-actions mb-3 flex flex-wrap items-end justify-between gap-3">
                <div><h3 className="font-semibold">Account activity</h3><p className="mt-1 text-xs text-muted-foreground">{rows.length} transaction, invoice, and reversal record(s). The running balance uses activity recorded in SchoolHub; no historical brought-forward balance is stored, so imported or legacy balances must be reconciled separately.</p></div>
                <div className="relative w-full sm:max-w-sm">
                  <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
                  <input aria-label="Search statement activity" className={cn("h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring")} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search receipt, invoice, reference…" />
                </div>
              </div>
              {visibleRows.length ? (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full min-w-[920px] text-left text-sm">
                    <thead><tr className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
                      <th className="p-3">Date</th><th className="p-3">Entry</th><th className="p-3">Reference / details</th><th className="p-3 text-right">Debit</th><th className="p-3 text-right">Credit</th><th className="p-3 text-right">Running balance</th><th className="p-3">Status</th>
                    </tr></thead>
                    <tbody>{visibleRows.map((row) => (
                      <tr key={row.id} className="border-b border-border/70 last:border-0">
                        <td className="whitespace-nowrap p-3">{dateLabel(row.date)}</td>
                        <td className="p-3">{row.type}</td>
                        <td className="p-3"><div className="font-semibold">{row.reference}</div><div className="max-w-md text-xs leading-5 text-muted-foreground">{row.description}</div></td>
                        <td className="whitespace-nowrap p-3 text-right tabular-nums">{row.debit ? money(row.debit) : "—"}</td>
                        <td className="whitespace-nowrap p-3 text-right tabular-nums">{row.credit ? money(row.credit) : "—"}</td>
                        <td className={cn("whitespace-nowrap p-3 text-right font-semibold tabular-nums", row.runningBalance > 0 ? "text-destructive" : row.runningBalance < 0 ? "text-success" : "")}>{money(row.runningBalance)}</td>
                        <td className="p-3"><span className={cn("inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold", ["PAID", "COMPLETED", "REFUNDED"].includes(row.status) ? "bg-success/10 text-success" : ["CANCELLED", "FAILED", "VOIDED"].includes(row.status) ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>{row.status.replaceAll("_", " ")}</span></td>
                      </tr>
                    ))}</tbody>
                    <tfoot><tr className="border-t-2 border-border bg-muted/30 font-semibold">
                      <td className="p-3" colSpan={3}>Displayed activity ({visibleRows.length} row(s)); statement totals cover all records</td>
                      <td className="p-3 text-right tabular-nums">{money(visibleRows.reduce((sum, row) => sum + row.debit, 0))}</td>
                      <td className="p-3 text-right tabular-nums">{money(visibleRows.reduce((sum, row) => sum + row.credit, 0))}</td>
                      <td className="p-3 text-right tabular-nums">{money(ledgerBalance)}</td><td />
                    </tr></tfoot>
                  </table>
                </div>
              ) : <p className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">No account activity matches this search.</p>}
            </section>
            <footer className="border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
              This statement is generated from SchoolHub's saved invoice and payment records. It is a school account activity report, not an independently verified bank statement. Reversed receipts are retained in the history with their corresponding reversal entries.
            </footer>
          </div>
        ) : null}
      </section>
      <style>{`@media print {
        .student-statement-actions { display: none !important; }
        .student-statement-print { width: 100% !important; }
        .student-statement-print table { min-width: 0 !important; width: 100% !important; font-size: 8pt !important; }
        .student-statement-print th, .student-statement-print td { padding: 5px !important; }
        .student-statement-print .overflow-x-auto { overflow: visible !important; }
      }`}</style>
    </div>
  );
}

function Metric({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div className={cn("rounded-xl border border-border bg-card p-3", emphasis && "border-primary/30 bg-primary/5")}>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="mt-1 break-words text-base font-bold tabular-nums sm:text-lg">{value}</p>
  </div>;
}
