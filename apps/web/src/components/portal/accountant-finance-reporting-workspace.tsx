import { useCallback, useMemo, useState } from "react";
import { Download, Printer, Search, Users, WalletCards } from "lucide-react";

interface Student {
  id: string;
  admissionNumber: string;
  profile?: { firstName?: string | null; lastName?: string | null } | null;
}
interface FinanceBill {
  id: string;
  billNumber: string;
  studentId: string;
  student: Student;
  class?: { id: string; name: string } | null;
  totalAmount: number | string;
  paidAmount: number | string;
  balanceAmount: number | string;
  status: string;
  issuedAt: string;
  dueDate?: string | null;
}
interface FinancePayment {
  id: string;
  paymentNumber: string;
  studentId: string;
  student: Student;
  bill?: { id: string; billNumber: string } | null;
  amount: number | string;
  paymentMethod: string;
  paymentDate: string;
  status: string;
  referenceNumber?: string | null;
}
interface FinanceClass {
  id: string;
  name: string;
}
interface Props {
  bills: FinanceBill[];
  payments: FinancePayment[];
  classes: FinanceClass[];
}

const money = (value: number) => new Intl.NumberFormat("en-GH", {
  style: "currency", currency: "GHS", maximumFractionDigits: 2,
}).format(value);
const amount = (value: number | string) => Number(value) || 0;
const settled = (status: string) => status.toUpperCase() === "COMPLETED";
const dateText = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(date);
};
const studentLabel = (student: Student) => [student.profile?.firstName, student.profile?.lastName].filter(Boolean).join(" ").trim() || student.admissionNumber || "Unknown student";
const inputClass = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/30";
const secondaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted";
const primaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90";

function exportCsv(rows: unknown[][], filename: string) {
  const csv = rows.map(row => row.map(value => '"' + String(value ?? "").replaceAll('"', '""') + '"').join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function localDate(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}
function defaultStart() {
  const date = new Date();
  date.setDate(1);
  return localDate(date);
}

export function AccountantFinanceReportingWorkspace({ bills, payments, classes }: Props) {
  const [reportType, setReportType] = useState<"class" | "student">("class");
  const [classId, setClassId] = useState("ALL");
  const [studentId, setStudentId] = useState("");
  const [from, setFrom] = useState(defaultStart);
  const [to, setTo] = useState(() => localDate(new Date()));
  const [search, setSearch] = useState("");

  const students = useMemo(() => {
    const byId = new Map<string, Student>();
    for (const bill of bills) byId.set(bill.studentId, bill.student);
    for (const payment of payments) byId.set(payment.studentId, payment.student);
    return [...byId.values()].sort((a, b) => studentLabel(a).localeCompare(studentLabel(b)));
  }, [bills, payments]);

  const range = useMemo(() => {
    const start = from ? new Date(from + "T00:00:00") : null;
    const end = to ? new Date(to + "T23:59:59.999") : null;
    return { start, end, valid: !start || !end || start <= end };
  }, [from, to]);

  const inRange = useCallback((value: string) => {
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && (!range.start || date >= range.start) && (!range.end || date <= range.end);
  }, [range.start, range.end]);

  const scopedBills = useMemo(() => bills.filter(bill => {
    if (reportType === "student" && (!studentId || bill.studentId !== studentId)) return false;
    if (reportType === "class" && classId !== "ALL" && bill.class?.id !== classId) return false;
    return inRange(bill.issuedAt);
  }), [bills, reportType, studentId, classId, inRange]);

  const scopedPayments = useMemo(() => payments.filter(payment => {
    if (reportType === "student" && (!studentId || payment.studentId !== studentId)) return false;
    if (reportType === "class" && classId !== "ALL") {
      const linkedBill = payment.bill?.id ? bills.find(bill => bill.id === payment.bill?.id) : undefined;
      if (linkedBill?.class?.id !== classId) return false;
    }
    return inRange(payment.paymentDate);
  }), [payments, bills, reportType, studentId, classId, inRange]);

  const query = search.trim().toLowerCase();
  const visibleBills = scopedBills.filter(bill => !query || bill.billNumber.toLowerCase().includes(query) || studentLabel(bill.student).toLowerCase().includes(query) || bill.student.admissionNumber.toLowerCase().includes(query));
  const visiblePayments = scopedPayments.filter(payment => !query || payment.paymentNumber.toLowerCase().includes(query) || studentLabel(payment.student).toLowerCase().includes(query) || (payment.referenceNumber ?? "").toLowerCase().includes(query));
  const completedPayments = visiblePayments.filter(payment => settled(payment.status));
  const collected = completedPayments.reduce((sum, payment) => sum + amount(payment.amount), 0);
  const billed = visibleBills.filter(bill => bill.status !== "CANCELLED" && bill.status !== "WAIVED").reduce((sum, bill) => sum + amount(bill.totalAmount), 0);
  const outstanding = reportType === "student"
    ? (studentId ? bills.filter(bill => bill.studentId === studentId && bill.status !== "CANCELLED" && bill.status !== "WAIVED").reduce((sum, bill) => sum + Math.max(0, amount(bill.balanceAmount)), 0) : 0)
    : bills.filter(bill => (classId === "ALL" || bill.class?.id === classId) && bill.status !== "CANCELLED" && bill.status !== "WAIVED").reduce((sum, bill) => sum + Math.max(0, amount(bill.balanceAmount)), 0);

  const classSummary = useMemo(() => {
    const byBillId = new Map<string, FinanceBill>(bills.map(bill => [bill.id, bill] as const));
    const totals = new Map<string, { name: string; collected: number; receipts: number; billed: number; outstanding: number }>();
    for (const bill of visibleBills) {
      const key = bill.class?.id ?? "no-class";
      const entry = totals.get(key) ?? { name: bill.class?.name ?? "Class not recorded", collected: 0, receipts: 0, billed: 0, outstanding: 0 };
      if (bill.status !== "CANCELLED" && bill.status !== "WAIVED") {
        entry.billed += amount(bill.totalAmount);
        entry.outstanding += Math.max(0, amount(bill.balanceAmount));
      }
      totals.set(key, entry);
    }
    for (const payment of completedPayments) {
      const bill = payment.bill?.id ? byBillId.get(payment.bill.id) : undefined;
      const key = bill?.class?.id ?? (payment.bill ? "no-class" : "unallocated");
      const name = bill?.class?.name ?? (payment.bill ? "Class not recorded" : "Unallocated receipts");
      const entry = totals.get(key) ?? { name, collected: 0, receipts: 0, billed: 0, outstanding: 0 };
      entry.collected += amount(payment.amount);
      entry.receipts += 1;
      totals.set(key, entry);
    }
    return [...totals.values()].sort((a, b) => b.collected - a.collected);
  }, [bills, visibleBills, completedPayments]);

  const selectedStudent = students.find(student => student.id === studentId);
  const invalidRange = !range.valid;

  const exportReport = () => {
    if (reportType === "student" && selectedStudent) {
      exportCsv([
        ["SchoolHub student account statement"],
        ["Student", studentLabel(selectedStudent)],
        ["Admission number", selectedStudent.admissionNumber],
        ["Reporting period", from + " to " + to],
        [],
        ["BILLS"],
        ["Bill number", "Issued", "Due date", "Class", "Billed (GHS)", "Paid (GHS)", "Balance (GHS)", "Status"],
        ...visibleBills.map(bill => [bill.billNumber, dateText(bill.issuedAt), dateText(bill.dueDate), bill.class?.name ?? "", amount(bill.totalAmount).toFixed(2), amount(bill.paidAmount).toFixed(2), amount(bill.balanceAmount).toFixed(2), bill.status]),
        [],
        ["PAYMENTS"],
        ["Receipt", "Date", "Bill", "Method", "Reference", "Amount (GHS)", "Status"],
        ...visiblePayments.map(payment => [payment.paymentNumber, dateText(payment.paymentDate), payment.bill?.billNumber ?? "Unallocated", payment.paymentMethod, payment.referenceNumber ?? "", amount(payment.amount).toFixed(2), payment.status]),
        [],
        ["Current outstanding balance (all open bills, regardless of date)", outstanding.toFixed(2)],
      ], "schoolhub-student-statement-" + selectedStudent.admissionNumber + ".csv");
      return;
    }
    exportCsv([
      ["SchoolHub class collection report"],
      ["Reporting period", from + " to " + to],
      [],
      ["Class", "Billed in period (GHS)", "Collected in period (GHS)", "Outstanding on period bills (GHS)", "Completed receipts"],
      ...classSummary.map(item => [item.name, item.billed.toFixed(2), item.collected.toFixed(2), item.outstanding.toFixed(2), item.receipts]),
    ], "schoolhub-class-collections.csv");
  };

  return (
    <section className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <style>{`@media print {
        body * { visibility: hidden !important; }
        .finance-report-print, .finance-report-print * { visibility: visible !important; }
        .finance-report-print { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; margin: 0 !important; padding: 16px !important; border: 0 !important; box-shadow: none !important; background: white !important; color: black !important; }
        .finance-report-print-actions { display: none !important; }
        .finance-report-print table { width: 100% !important; font-size: 10px !important; }
        .finance-report-print th, .finance-report-print td { color: black !important; border-color: #ccc !important; }
        @page { size: A4 landscape; margin: 10mm; }
      }</style>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><span className="rounded-xl bg-muted p-2"><WalletCards className="size-4 text-primary" /></span><div><h2 className="text-lg font-semibold text-foreground">Finance reporting workspace</h2><p className="mt-1 text-sm text-muted-foreground">Build class collection reports and individual student account statements from saved finance records.</p></div></div>
        </div>
        <div className="finance-report-print-actions flex flex-wrap gap-2">
          <button type="button" className={secondaryButton} disabled={invalidRange || (reportType === "student" && !selectedStudent)} onClick={() => window.print()}><Printer className="size-4" /> Print / Save PDF</button>
          <button type="button" className={primaryButton} disabled={invalidRange || (reportType === "student" && !selectedStudent)} onClick={exportReport}><Download className="size-4" /> Export CSV</button>
        </div>
      </div>
      <div className="finance-report-print-actions grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1 text-xs font-medium text-muted-foreground">Report type<select className={inputClass + " mt-1"} value={reportType} onChange={event => setReportType(event.target.value as "class" | "student")}><option value="class">Class collections</option><option value="student">Student account statement</option></select></label>
        {reportType === "class" ? <label className="space-y-1 text-xs font-medium text-muted-foreground">Class<select className={inputClass + " mt-1"} value={classId} onChange={event => setClassId(event.target.value)}><option value="ALL">All classes</option>{classes.map(schoolClass => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</option>)}</select></label> : <label className="space-y-1 text-xs font-medium text-muted-foreground">Student<select className={inputClass + " mt-1"} value={studentId} onChange={event => setStudentId(event.target.value)}><option value="">Select a student…</option>{students.map(student => <option key={student.id} value={student.id}>{studentLabel(student)} · {student.admissionNumber}</option>)}</select></label>}
        <label className="space-y-1 text-xs font-medium text-muted-foreground">From date<input className={inputClass + " mt-1"} type="date" value={from} max={to || undefined} onChange={event => setFrom(event.target.value)} /></label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">To date<input className={inputClass + " mt-1"} type="date" value={to} min={from || undefined} onChange={event => setTo(event.target.value)} /></label>
      </div>
      <div className="finance-report-print-actions relative max-w-md"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><input className={inputClass + " pl-9"} value={search} onChange={event => setSearch(event.target.value)} placeholder={reportType === "student" ? "Filter statement by bill, receipt or reference" : "Filter class report by student or bill"} aria-label="Filter finance report" /></div>
      {invalidRange && <p role="alert" className="text-sm text-destructive">The start date must be on or before the end date.</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl bg-muted/60 p-4"><p className="text-xs text-muted-foreground">Bills issued in period</p><p className="mt-1 text-xl font-bold tabular-nums text-foreground">{money(billed)}</p><p className="mt-1 text-xs text-muted-foreground">{visibleBills.length} bill record(s)</p></div>
        <div className="rounded-xl bg-muted/60 p-4"><p className="text-xs text-muted-foreground">Completed collections</p><p className="mt-1 text-xl font-bold tabular-nums text-foreground">{money(collected)}</p><p className="mt-1 text-xs text-muted-foreground">{completedPayments.length} completed receipt(s)</p></div>
        <div className="rounded-xl bg-muted/60 p-4"><p className="text-xs text-muted-foreground">Current outstanding</p><p className="mt-1 text-xl font-bold tabular-nums text-foreground">{money(outstanding)}</p><p className="mt-1 text-xs text-muted-foreground">Open bill balances, all dates</p></div>
        <div className="rounded-xl bg-muted/60 p-4"><p className="text-xs text-muted-foreground">Filtered receipts</p><p className="mt-1 text-xl font-bold tabular-nums text-foreground">{visiblePayments.length}</p><p className="mt-1 text-xs text-muted-foreground">Includes non-completed statuses in the register</p></div>
      </div>

      <div className="finance-report-print rounded-xl border border-border p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
          <div><p className="text-xs font-bold uppercase tracking-wider text-primary">SchoolHub · Finance report</p><h3 className="mt-1 text-xl font-bold text-foreground">{reportType === "class" ? "Class collection report" : "Student account statement"}</h3><p className="mt-1 text-sm text-muted-foreground">Period: {from || "All dates"} to {to || "All dates"} · Generated {dateText(new Date().toISOString())}</p>{reportType === "student" && selectedStudent && <p className="mt-2 text-sm font-semibold text-foreground">{studentLabel(selectedStudent)} · Admission no. {selectedStudent.admissionNumber}</p>}{reportType === "class" && <p className="mt-2 text-sm font-semibold text-foreground">{classes.find(item => item.id === classId)?.name ?? (classId === "ALL" ? "All classes" : "Selected class")}</p>}</div>
          <div className="text-right"><p className="text-xs text-muted-foreground">Completed collections</p><p className="mt-1 text-xl font-bold text-foreground">{money(collected)}</p></div>
        </div>
        {reportType === "class" ? (
          classSummary.length ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="py-2 pr-3">Class</th><th className="px-2 py-2 text-right">Billed</th><th className="px-2 py-2 text-right">Collected</th><th className="px-2 py-2 text-right">Outstanding</th><th className="pl-2 py-2 text-right">Receipts</th></tr></thead><tbody>{classSummary.map(item => <tr key={item.name} className="border-b border-border/70 last:border-0"><td className="py-2 pr-3 font-medium">{item.name}</td><td className="px-2 py-2 text-right tabular-nums">{money(item.billed)}</td><td className="px-2 py-2 text-right tabular-nums">{money(item.collected)}</td><td className="px-2 py-2 text-right tabular-nums">{money(item.outstanding)}</td><td className="pl-2 py-2 text-right tabular-nums">{item.receipts}</td></tr>)}</tbody></table></div> : <p className="py-8 text-center text-sm text-muted-foreground">No bill or receipt records match the selected period and class.</p>
        ) : !selectedStudent ? <div className="py-8 text-center text-sm text-muted-foreground"><Users className="mx-auto mb-2 size-5" />Select a student to build their statement.</div> : (
          <div className="space-y-5">
            <div><h4 className="mb-2 font-semibold text-foreground">Bills issued</h4>{visibleBills.length ? <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="py-2 pr-3">Bill</th><th className="px-2 py-2">Issued</th><th className="px-2 py-2">Due</th><th className="px-2 py-2 text-right">Billed</th><th className="px-2 py-2 text-right">Paid</th><th className="pl-2 py-2 text-right">Balance</th></tr></thead><tbody>{visibleBills.map(bill => <tr key={bill.id} className="border-b border-border/70 last:border-0"><td className="py-2 pr-3 font-medium">{bill.billNumber}<span className="block text-xs text-muted-foreground">{bill.class?.name ?? "Class not recorded"} · {bill.status}</span></td><td className="px-2 py-2">{dateText(bill.issuedAt)}</td><td className="px-2 py-2">{dateText(bill.dueDate)}</td><td className="px-2 py-2 text-right tabular-nums">{money(amount(bill.totalAmount))}</td><td className="px-2 py-2 text-right tabular-nums">{money(amount(bill.paidAmount))}</td><td className="pl-2 py-2 text-right tabular-nums">{money(amount(bill.balanceAmount))}</td></tr>)}</tbody></table></div> : <p className="text-sm text-muted-foreground">No bills were issued in this date range.</p>}</div>
            <div><h4 className="mb-2 font-semibold text-foreground">Payments & receipts</h4>{visiblePayments.length ? <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="py-2 pr-3">Receipt</th><th className="px-2 py-2">Date</th><th className="px-2 py-2">Bill</th><th className="px-2 py-2">Method</th><th className="px-2 py-2 text-right">Amount</th><th className="pl-2 py-2">Status</th></tr></thead><tbody>{visiblePayments.map(payment => <tr key={payment.id} className="border-b border-border/70 last:border-0"><td className="py-2 pr-3 font-medium">{payment.paymentNumber}</td><td className="px-2 py-2">{dateText(payment.paymentDate)}</td><td className="px-2 py-2">{payment.bill?.billNumber ?? "Unallocated"}</td><td className="px-2 py-2">{payment.paymentMethod.replaceAll("_", " ")}</td><td className="px-2 py-2 text-right tabular-nums">{money(amount(payment.amount))}</td><td className="pl-2 py-2">{payment.status}</td></tr>)}</tbody></table></div> : <p className="text-sm text-muted-foreground">No payment records were recorded in this date range.</p>}</div>
            <p className="border-t border-border pt-3 text-sm font-semibold text-foreground">Current outstanding across all open bills: {money(outstanding)}</p>
          </div>
        )}
        <p className="mt-5 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">Report generated from saved SchoolHub records. Completed collections include completed receipts only. Outstanding balances are current bill balances and may cover dates outside this report period.</p>
      </div>
    </section>
  );
}
