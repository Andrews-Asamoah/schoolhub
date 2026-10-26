import { DataTable, TableExportMenu, type DataTableColumn } from "@/components/ui/data-table";
import { ServerExportButton } from "@/components/portal/server-export-button";
import type { ExportTable } from "@/lib/table-export";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, getClientSubdomain } from "@/lib/api";
import { Search, Users, WalletCards } from "lucide-react";

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
  billAllocations?: Array<{ billId: string; amount: number | string; bill?: { id: string } | null }>;
  paymentItems?: Array<{ amount: number | string; billItem?: { billId?: string; description?: string } | null }>;
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

interface FinancePage<T> {
  items: T[];
  nextCursor: string | null;
  total: number;
}

async function fetchAllFinancePages<T extends { id: string }>(path: string): Promise<T[]> {
  const records: T[] = [];
  const seenCursors = new Set<string>();
  const seenRecordIds = new Set<string>();
  let expectedTotal: number | null = null;
  let cursor: string | null = null;
  let pageCount = 0;

  do {
    if (pageCount >= 1000) {
      throw new Error("Finance report exceeded the safe pagination limit. Narrow the reporting period and try again.");
    }
    const params = new URLSearchParams({ limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const page = await apiFetch<FinancePage<T>>(`${path}?${params.toString()}`);
    if (!Array.isArray(page.items) || !Number.isSafeInteger(page.total) || page.total < 0 ||
        (page.nextCursor !== null && typeof page.nextCursor !== "string")) {
      throw new Error("Finance report received invalid pagination metadata. No incomplete report has been displayed.");
    }
    if (expectedTotal === null) expectedTotal = page.total;
    if (page.total !== expectedTotal) {
      throw new Error("Finance records changed while loading this report. Retry to load a consistent set.");
    }
    if (page.items.length === 0 && page.nextCursor) {
      throw new Error("Finance report returned an empty page with a continuation cursor.");
    }
    for (const item of page.items) {
      if (!item || typeof item.id !== "string" || !item.id || seenRecordIds.has(item.id)) {
        throw new Error("Finance report returned an invalid or repeated record. No partial totals have been displayed.");
      }
      seenRecordIds.add(item.id);
      records.push(item);
    }
    if (records.length > expectedTotal) {
      throw new Error("Finance report received more records than the server reported.");
    }
    cursor = page.nextCursor;
    pageCount += 1;
    if (cursor && seenCursors.has(cursor)) {
      throw new Error("Finance report pagination returned a repeated cursor. No partial report has been displayed.");
    }
    if (cursor) seenCursors.add(cursor);
  } while (cursor);

  if (records.length !== expectedTotal) {
    throw new Error("Finance report pagination was incomplete. Retry before using financial totals.");
  }
  return records;
}

const money = (value: number) =>
  new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);

const amount = (value: number | string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

// Financial totals are accumulated in integer pesewas, never binary floats.
// Conversion to JS numbers happens only for existing chart/table presentation.
function moneyCents(value: string | number): bigint {
  const raw = String(value).trim();
  const matched = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(raw);
  if (!matched) throw new Error("Invalid money amount in financial report.");
  const cents = BigInt(matched[2]!) * 100n + BigInt((matched[3] ?? "").padEnd(2, "0"));
  return matched[1] ? -cents : cents;
}
function centsNumber(cents: bigint): number {
  if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < BigInt(-Number.MAX_SAFE_INTEGER)) {
    throw new Error("Financial report amount exceeds safe display precision.");
  }
  return Number(cents) / 100;
}
function moneyTotal<T>(rows: readonly T[], select: (row: T) => string | number): number {
  return centsNumber(rows.reduce((total, row) => total + moneyCents(select(row)), 0n));
}
const settled = (status: string) => status.toUpperCase() === "COMPLETED";

const dateText = (value?: string | null) => {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(date);
};

const studentLabel = (student: Student) =>
  [student.profile?.firstName, student.profile?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim() ||
  student.admissionNumber ||
  "Unknown student";

type ClassAllocation = { classId: string; name: string; amount: number };

/** Reconcile against bill-level allocations; use item rows for older receipts.
 * Never charge a whole multi-bill receipt to its legacy primary bill.
 */
function paymentClassAllocations(payment: FinancePayment, billsById: Map<string, FinanceBill>): ClassAllocation[] {
  const allocatedByBill = new Map<string, number>();
  if (payment.billAllocations?.length) {
    for (const allocation of payment.billAllocations) {
      const id = allocation.billId ?? allocation.bill?.id;
      if (!id) continue;
      allocatedByBill.set(id, (allocatedByBill.get(id) ?? 0) + amount(allocation.amount));
    }
  } else if (payment.paymentItems?.length) {
    for (const item of payment.paymentItems) {
      const id = item.billItem?.billId;
      if (!id) continue;
      allocatedByBill.set(id, (allocatedByBill.get(id) ?? 0) + amount(item.amount));
    }
  }
  // Legacy records may expose item descriptions without their bill IDs.
  // In that case fall back to the linked bill rather than treating a
  // known payment as unallocated.
  if (allocatedByBill.size === 0 && payment.bill?.id) {
    allocatedByBill.set(payment.bill.id, amount(payment.amount));
  }

  const byClass = new Map<string, ClassAllocation>();
  let applied = 0;
  for (const [billId, value] of allocatedByBill) {
    const allocated = Math.max(0, value);
    const bill = billsById.get(billId);
    const classId = bill?.class?.id ?? "no-class";
    const name = bill?.class?.name ?? "Class not recorded";
    const current = byClass.get(classId);
    byClass.set(classId, { classId, name, amount: (current?.amount ?? 0) + allocated });
    applied += allocated;
  }
  const unapplied = Math.max(0, Math.round((amount(payment.amount) - applied) * 100) / 100);
  if (unapplied > 0) {
    byClass.set("unallocated", { classId: "unallocated", name: "Unallocated receipts", amount: unapplied });
  }
  return [...byClass.values()];
}

const inputClass =
  "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/30";

const secondaryButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted";

const primaryButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90";

function localDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function defaultStart() {
  const date = new Date();
  date.setDate(1);
  return localDate(date);
}

export function AccountantFinanceDetailedReportingWorkspace({ classes }: Props) {
  // Keep report data isolated across schools. An earlier school's React Query cache
  // must not be reused after the accountant switches schools.
  const schoolScope = getClientSubdomain();
  const reportSchoolQuery = useQuery({
    queryKey: ["finance", "report-school", schoolScope],
    queryFn: () => apiFetch<{ id: string }>("/schools/current"),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    retry: false,
  });
  // Registers are paginated; never calculate a school-wide report from page one only.
  const completeFinanceQuery = useQuery({
    queryKey: ["finance", "complete-report-dataset", reportSchoolQuery.data?.id], 
    enabled: reportSchoolQuery.isSuccess && Boolean(reportSchoolQuery.data?.id),
    gcTime: 0,
    queryFn: async () => {
      const [bills, payments] = await Promise.all([
        fetchAllFinancePages<FinanceBill>("/finance/bills"),
        fetchAllFinancePages<FinancePayment>("/finance/payments"),
      ]);
      return { bills, payments };
    },
    retry: false,
    staleTime: 30_000,
  });
  const bills = completeFinanceQuery.data?.bills ?? [];
  const payments = completeFinanceQuery.data?.payments ?? [];
  const [reportType, setReportType] = useState<"class" | "student">("class");
  const [classId, setClassId] = useState("ALL");
  const [studentId, setStudentId] = useState("");
  const [from, setFrom] = useState(defaultStart);
  const [to, setTo] = useState(() => localDate(new Date()));
  const [search, setSearch] = useState("");

  const students = useMemo(() => {
    const byId = new Map<string, Student>();

    for (const bill of bills) {
      byId.set(bill.studentId, bill.student);
    }

    for (const payment of payments) {
      byId.set(payment.studentId, payment.student);
    }

    return [...byId.values()].sort((a, b) =>
      studentLabel(a).localeCompare(studentLabel(b)),
    );
  }, [bills, payments]);

  const billsById = useMemo(
    () => new Map(bills.map((bill) => [bill.id, bill])),
    [bills],
  );

  const range = useMemo(() => {
    const start = from ? new Date(from + "T00:00:00") : null;
    const end = to ? new Date(to + "T23:59:59.999") : null;

    const validDates =
      (!start || !Number.isNaN(start.getTime())) &&
      (!end || !Number.isNaN(end.getTime()));

    return {
      start,
      end,
      valid:
        validDates &&
        (!start || !end || start.getTime() <= end.getTime()),
    };
  }, [from, to]);

  const inRange = useCallback(
    (value: string) => {
      const date = new Date(value);

      return (
        !Number.isNaN(date.getTime()) &&
        (!range.start || date >= range.start) &&
        (!range.end || date <= range.end)
      );
    },
    [range.start, range.end],
  );

  const scopedBills = useMemo(
    () =>
      bills.filter((bill) => {
        if (
          reportType === "student" &&
          (!studentId || bill.studentId !== studentId)
        ) {
          return false;
        }

        if (
          reportType === "class" &&
          classId !== "ALL" &&
          bill.class?.id !== classId
        ) {
          return false;
        }

        return inRange(bill.issuedAt);
      }),
    [bills, reportType, studentId, classId, inRange],
  );

  const scopedPayments = useMemo(
    () =>
      payments.filter((payment) => {
        if (
          reportType === "student" &&
          (!studentId || payment.studentId !== studentId)
        ) {
          return false;
        }

        if (reportType === "class" && classId !== "ALL" &&
            !paymentClassAllocations(payment, billsById).some((allocation) => allocation.classId === classId && allocation.amount > 0)) {
          return false;
        }

        return inRange(payment.paymentDate);
      }),
    [
      payments,
      billsById,
      reportType,
      studentId,
      classId,
      inRange,
    ],
  );

  const query = search.trim().toLowerCase();

  const visibleBills = scopedBills.filter((bill) => {
    const billNumber = (bill.billNumber ?? "").toLowerCase();
    const admissionNumber = (
      bill.student?.admissionNumber ?? ""
    ).toLowerCase();

    return (
      !query ||
      billNumber.includes(query) ||
      studentLabel(bill.student).toLowerCase().includes(query) ||
      admissionNumber.includes(query)
    );
  });

  const visiblePayments = scopedPayments.filter((payment) => {
    const paymentNumber = (payment.paymentNumber ?? "").toLowerCase();
    const referenceNumber = (
      payment.referenceNumber ?? ""
    ).toLowerCase();

    return (
      !query ||
      paymentNumber.includes(query) ||
      studentLabel(payment.student).toLowerCase().includes(query) ||
      referenceNumber.includes(query)
    );
  });

  const completedPayments = visiblePayments.filter((payment) =>
    settled(payment.status),
  );

  const collected = moneyTotal(completedPayments, (payment) =>
    reportType === "class" && classId !== "ALL"
      ? paymentClassAllocations(payment, billsById).find((allocation) => allocation.classId === classId)?.amount ?? 0
      : payment.amount,
  );

  const billedCents = visibleBills
    .filter(
      (bill) =>
        bill.status !== "CANCELLED" && bill.status !== "WAIVED",
    )
    .reduce((sum, bill) => sum + moneyCents(bill.totalAmount), 0n);

  const billed = centsNumber(billedCents);

  // Outstanding is the current balance across all dates, not just the
  // selected reporting period or search-filtered rows.
  const outstanding =
    reportType === "student"
      ? studentId
        ? bills
            .filter(
              (bill) =>
                bill.studentId === studentId &&
                bill.status !== "CANCELLED" &&
                bill.status !== "WAIVED",
            )
            .reduce(
              (sum, bill) =>
                sum + (moneyCents(bill.balanceAmount) > 0n ? moneyCents(bill.balanceAmount) : 0n),
              0n,
            )
        : 0n
      : bills
          .filter(
            (bill) =>
              (classId === "ALL" || bill.class?.id === classId) &&
              bill.status !== "CANCELLED" &&
              bill.status !== "WAIVED",
          )
          .reduce(
            (sum, bill) =>
              sum + (moneyCents(bill.balanceAmount) > 0n ? moneyCents(bill.balanceAmount) : 0n),
            0n,
          );

  const outstandingMoney = centsNumber(outstanding);

  const classSummary = useMemo(() => {
    const totals = new Map<
      string,
      {
        name: string;
        collected: bigint;
        receipts: number;
        billed: bigint;
        outstanding: bigint;
      }
    >();

    for (const bill of visibleBills) {
      const key = bill.class?.id ?? "no-class";

      const entry = totals.get(key) ?? {
        name: bill.class?.name ?? "Class not recorded",
        collected: 0n,
        receipts: 0,
        billed: 0n,
        outstanding: 0n,
      };

      if (
        bill.status !== "CANCELLED" &&
        bill.status !== "WAIVED"
      ) {
        entry.billed += moneyCents(bill.totalAmount);
        entry.outstanding += moneyCents(bill.balanceAmount) > 0n ? moneyCents(bill.balanceAmount) : 0n;
      }

      totals.set(key, entry);
    }

    for (const payment of completedPayments) {
      for (const allocation of paymentClassAllocations(payment, billsById)) {
        if (reportType === "class" && classId !== "ALL" && allocation.classId !== classId) continue;
        if (allocation.amount <= 0) continue;
        const entry = totals.get(allocation.classId) ?? {
          name: allocation.name,
          collected: 0n,
          receipts: 0,
          billed: 0n,
          outstanding: 0n,
        };
        entry.collected += moneyCents(allocation.amount);
        entry.receipts += 1;
        totals.set(allocation.classId, entry);
      }
    }

    return [...totals.values()].sort((a, b) =>
      a.collected === b.collected ? a.name.localeCompare(b.name) : a.collected > b.collected ? -1 : 1,
    ).map((row) => ({
      ...row,
      collected: centsNumber(row.collected),
      billed: centsNumber(row.billed),
      outstanding: centsNumber(row.outstanding),
    }));
  }, [billsById, visibleBills, completedPayments, reportType, classId]);

  const periodCollected = moneyTotal(
    scopedPayments.filter((payment) => settled(payment.status)),
    (payment) => reportType === "class" && classId !== "ALL"
      ? paymentClassAllocations(payment, billsById).find((allocation) => allocation.classId === classId)?.amount ?? 0
      : payment.amount,
  );

  const previousPeriodCollected = useMemo(() => {
    if (
      !range.start ||
      !range.end ||
      !range.valid
    ) {
      return null;
    }

    const duration =
      range.end.getTime() - range.start.getTime() + 1;

    const previousStart = range.start.getTime() - duration;
    const previousEnd = range.start.getTime() - 1;

    return centsNumber(payments
      .filter((payment) => {
        if (!settled(payment.status)) {
          return false;
        }

        if (
          reportType === "student" &&
          (!studentId || payment.studentId !== studentId)
        ) {
          return false;
        }

        if (reportType === "class" && classId !== "ALL" &&
            !paymentClassAllocations(payment, billsById).some((allocation) => allocation.classId === classId && allocation.amount > 0)) {
          return false;
        }

        const timestamp = new Date(payment.paymentDate).getTime();

        return (
          !Number.isNaN(timestamp) &&
          timestamp >= previousStart &&
          timestamp <= previousEnd
        );
      })
      .reduce((sum, payment) => sum + moneyCents(
        reportType === "class" && classId !== "ALL"
          ? paymentClassAllocations(payment, billsById).find((allocation) => allocation.classId === classId)?.amount ?? 0
          : payment.amount
      ), 0n));
  }, [
    payments,
    billsById,
    reportType,
    studentId,
    classId,
    range.start,
    range.end,
    range.valid,
  ]);

  const comparisonDelta =
    previousPeriodCollected === null
      ? null
      : periodCollected - previousPeriodCollected;

  const comparisonPercent =
    previousPeriodCollected === null ||
    previousPeriodCollected === 0
      ? null
      : ((comparisonDelta ?? 0) / previousPeriodCollected) * 100;

  const selectedStudent = students.find(
    (student) => student.id === studentId,
  );

  const invalidRange = !range.valid;

  const buildExportTable = (): ExportTable => {
    const reportInfo = { period: from + " to " + to, filters: { reportType, student: selectedStudent ? studentLabel(selectedStudent) : undefined } };
    if (reportType === "student" && selectedStudent) {
      return {
        title: "Student statement of account",
        headers: ["Entry type", "Reference", "Date", "Due date", "Class / Bill", "Method", "Amount (GHS)", "Paid (GHS)", "Balance (GHS)", "Status"],
        columnTypes: ["text", "text", "date", "date", "text", "text", "money", "money", "money", "text"],
        rows: [
          ...visibleBills.map((bill) => ["Invoice", bill.billNumber, dateText(bill.issuedAt), dateText(bill.dueDate), bill.class?.name ?? "", "", amount(bill.totalAmount), amount(bill.paidAmount), amount(bill.balanceAmount), bill.status]),
          ...visiblePayments.map((payment) => ["Receipt", payment.paymentNumber, dateText(payment.paymentDate), "", payment.bill?.billNumber ?? "Unallocated", payment.paymentMethod, amount(payment.amount), null, null, payment.status]),
          ["Closing outstanding balance", "", "", "", "", "", null, null, outstandingMoney, ""],
        ],
        reportInfo,
      };
    }
    return {
      title: "Class collection report",
      headers: ["Class", "Billed in period (GHS)", "Collected in period (GHS)", "Outstanding on period bills (GHS)", "Completed receipts"],
      columnTypes: ["text", "money", "money", "money", "number"],
      rows: classSummary.map((item) => [item.name, item.billed, item.collected, item.outstanding, item.receipts]),
      totals: ["Total", null, null, null, null],
      reportInfo,
    };
  };

  const classColumns: DataTableColumn<(typeof classSummary)[number]>[] = [
    { id: "class", header: "Class", cell: (row) => row.name, value: (row) => row.name },
    { id: "billed", header: "Billed", cell: (row) => money(row.billed), value: (row) => row.billed, className: "text-right tabular-nums" },
    { id: "collected", header: "Collected", cell: (row) => money(row.collected), value: (row) => row.collected, className: "text-right tabular-nums" },
    { id: "outstanding", header: "Outstanding", cell: (row) => money(row.outstanding), value: (row) => row.outstanding, className: "text-right tabular-nums" },
    { id: "receipts", header: "Receipts", cell: (row) => row.receipts, value: (row) => row.receipts, className: "text-right tabular-nums" },
  ];
  const billColumns: DataTableColumn<FinanceBill>[] = [
    { id: "bill", header: "Bill", cell: (row) => <><span className="font-medium">{row.billNumber}</span><span className="block text-xs text-muted-foreground">{row.class?.name ?? "Class not recorded"} | {row.status}</span></>, value: (row) => row.billNumber },
    { id: "issued", header: "Issued", cell: (row) => dateText(row.issuedAt), value: (row) => row.issuedAt },
    { id: "due", header: "Due", cell: (row) => dateText(row.dueDate), value: (row) => row.dueDate ?? "" },
    { id: "billed", header: "Billed", cell: (row) => money(amount(row.totalAmount)), value: (row) => amount(row.totalAmount), className: "text-right tabular-nums" },
    { id: "paid", header: "Paid", cell: (row) => money(amount(row.paidAmount)), value: (row) => amount(row.paidAmount), className: "text-right tabular-nums" },
    { id: "balance", header: "Balance", cell: (row) => money(amount(row.balanceAmount)), value: (row) => amount(row.balanceAmount), className: "text-right tabular-nums" },
  ];
  const paymentColumns: DataTableColumn<FinancePayment>[] = [
    { id: "receipt", header: "Receipt", cell: (row) => <span className="font-medium">{row.paymentNumber}</span>, value: (row) => row.paymentNumber },
    { id: "date", header: "Date", cell: (row) => dateText(row.paymentDate), value: (row) => row.paymentDate },
    { id: "bill", header: "Bill", cell: (row) => row.bill?.billNumber ?? "Unallocated", value: (row) => row.bill?.billNumber ?? "" },
    { id: "method", header: "Method", cell: (row) => row.paymentMethod.replaceAll("_", " "), value: (row) => row.paymentMethod },
    { id: "amount", header: "Amount", cell: (row) => money(reportType === "class" && classId !== "ALL" ? paymentClassAllocations(row, billsById).find((allocation) => allocation.classId === classId)?.amount ?? 0 : amount(row.amount)), value: (row) => reportType === "class" && classId !== "ALL" ? paymentClassAllocations(row, billsById).find((allocation) => allocation.classId === classId)?.amount ?? 0 : amount(row.amount), className: "text-right tabular-nums" },
    { id: "status", header: "Status", cell: (row) => row.status, value: (row) => row.status },
  ];

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
      }`}</style>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-xl bg-muted p-2">
              <WalletCards className="size-4 text-primary" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Finance reporting workspace
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Build class collection reports and individual student
                account statements from saved finance records.
              </p>
            </div>
          </div>
        </div>

        <div className="finance-report-print-actions flex flex-wrap gap-2">
          {reportSchoolQuery.isSuccess && completeFinanceQuery.isSuccess && !invalidRange && (reportType !== "student" || !!selectedStudent) && <TableExportMenu build={buildExportTable} note="Exports include the selected period and filters." />}
          {completeFinanceQuery.isSuccess && !invalidRange && reportType === "student" && selectedStudent && <ServerExportButton endpoint={"/finance/students/" + encodeURIComponent(selectedStudent.id) + "/statement.pdf?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to)} label="Official statement PDF" className={secondaryButton} />}
        </div>
        </div>

      {reportSchoolQuery.isPending || completeFinanceQuery.isPending ? (
        <div role="status" className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          Loading all finance records for a complete report…
        </div>
      ) : reportSchoolQuery.error || completeFinanceQuery.error ? (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Unable to load the complete finance dataset. Report totals are unavailable; no partial totals are displayed. {(reportSchoolQuery.error ?? completeFinanceQuery.error)?.message}
          <button type="button" className="ml-2 font-semibold underline" onClick={() => { void reportSchoolQuery.refetch(); void completeFinanceQuery.refetch(); }}>Retry</button>
        </div>
      ) : (
      <>
      <div className="finance-report-print-actions grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Report type
          <select
            className={inputClass + " mt-1"}
            value={reportType}
            onChange={(event) =>
              setReportType(event.target.value as "class" | "student")
            }
          >
            <option value="class">Class collections</option>
            <option value="student">Student account statement</option>
          </select>
        </label>

        {reportType === "class" ? (
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Class
            <select
              className={inputClass + " mt-1"}
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
            >
              <option value="ALL">All classes</option>
              {classes.map((schoolClass) => (
                <option key={schoolClass.id} value={schoolClass.id}>
                  {schoolClass.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Student
            <select
              className={inputClass + " mt-1"}
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
            >
              <option value="">Select a student...</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {studentLabel(student)} | {student.admissionNumber}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          From date
          <input
            className={inputClass + " mt-1"}
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>

        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          To date
          <input
            className={inputClass + " mt-1"}
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
      </div>

      <div className="finance-report-print-actions relative max-w-md">
        <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
        <input
          className={inputClass + " pl-9"}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={
            reportType === "student"
              ? "Filter statement by bill, receipt or reference"
              : "Filter class report by student or bill"
          }
          aria-label="Filter finance report"
        />
      </div>

      {invalidRange && (
        <p role="alert" className="text-sm text-destructive">
          The start date must be on or before the end date, and both dates
          must be valid.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl bg-muted/60 p-4">
          <p className="text-xs text-muted-foreground">
            Bills issued in period
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums text-foreground">
            {money(billed)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {visibleBills.length} bill record(s)
          </p>
        </div>

        <div className="rounded-xl bg-muted/60 p-4">
          <p className="text-xs text-muted-foreground">
            Completed collections
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums text-foreground">
            {money(collected)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {completedPayments.length} completed receipt(s)
          </p>
        </div>

        <div className="rounded-xl bg-muted/60 p-4">
          <p className="text-xs text-muted-foreground">
            Current outstanding
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums text-foreground">
            {money(outstandingMoney)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Open bill balances, all dates
          </p>
        </div>

        <div className="rounded-xl bg-muted/60 p-4">
          <p className="text-xs text-muted-foreground">Filtered receipts</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-foreground">
            {visiblePayments.length}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Includes non-completed statuses in the register
          </p>
        </div>
      </div>

      <section className="finance-report-print-actions rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-foreground">
              Period-over-period collections
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Compares completed receipts in the selected date range with
              the immediately preceding range of equal length.
            </p>
          </div>

          <div className="text-right">
            <p className="text-xs text-muted-foreground">Previous period</p>
            <p className="font-semibold tabular-nums text-foreground">
              {previousPeriodCollected === null
                ? "Choose a valid date range"
                : money(previousPeriodCollected)}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-baseline gap-3">
          <p className="text-2xl font-bold tabular-nums text-foreground">
            {money(periodCollected)}
          </p>

          {comparisonDelta !== null && (
            <span
              className={
                comparisonDelta >= 0
                  ? "text-sm font-semibold text-success"
                  : "text-sm font-semibold text-destructive"
              }
            >
              {comparisonDelta > 0 ? "+" : ""}
              {money(comparisonDelta)}
              {comparisonPercent === null
                ? ""
                : " | " +
                  (comparisonPercent > 0 ? "+" : "") +
                  comparisonPercent.toFixed(1) +
                  "%"}
            </span>
          )}
        </div>

        {previousPeriodCollected === 0 &&
          range.valid &&
          !invalidRange && (
            <p className="mt-2 text-xs text-muted-foreground">
              The previous period had no completed collections, so a
              percentage change is not meaningful.
            </p>
          )}
      </section>

      <div className="finance-report-print rounded-xl border border-border p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-primary">
              SchoolHub | Finance report
            </p>

            <h3 className="mt-1 text-xl font-bold text-foreground">
              {reportType === "class"
                ? "Class collection report"
                : "Student account statement"}
            </h3>

            <p className="mt-1 text-sm text-muted-foreground">
              Period: {from || "All dates"} to {to || "All dates"} | Generated{" "}
              {dateText(new Date().toISOString())}
            </p>

            {reportType === "student" && selectedStudent && (
              <p className="mt-2 text-sm font-semibold text-foreground">
                {studentLabel(selectedStudent)} | Admission no.{" "}
                {selectedStudent.admissionNumber}
              </p>
            )}

            {reportType === "class" && (
              <p className="mt-2 text-sm font-semibold text-foreground">
                {classes.find((item) => item.id === classId)?.name ??
                  (classId === "ALL" ? "All classes" : "Selected class")}
              </p>
            )}
          </div>

          <div className="text-right">
            <p className="text-xs text-muted-foreground">
              Completed collections
            </p>
            <p className="mt-1 text-xl font-bold text-foreground">
              {money(collected)}
            </p>
          </div>
        </div>

        {reportType === "class" ? (
          classSummary.length ? (
            <DataTable rows={classSummary} columns={classColumns} getRowId={(row) => row.name} emptyTitle="No class collections" emptyDescription="No matching class collection records." exportTitle="Class collections" searchable={false} embedded />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No bill or receipt records match the selected period and class.
            </p>
          )
        ) : !selectedStudent ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Users className="mx-auto mb-2 size-5" />
            Select a student to build their statement.
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <h4 className="mb-2 font-semibold text-foreground">
                Bills issued
              </h4>

              {visibleBills.length ? (
                <DataTable rows={visibleBills} columns={billColumns} getRowId={(row) => row.id} emptyTitle="No bills" emptyDescription="No bills were issued in this date range." exportTitle="Student bills" searchable={false} embedded />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No bills were issued in this date range.
                </p>
              )}
            </div>

            <div>
              <h4 className="mb-2 font-semibold text-foreground">
                Payments and receipts
              </h4>

              {visiblePayments.length ? (
                <DataTable rows={visiblePayments} columns={paymentColumns} getRowId={(row) => row.id} emptyTitle="No receipts" emptyDescription="No payment records were recorded in this date range." exportTitle="Student receipts" searchable={false} embedded />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No payment records were recorded in this date range.
                </p>
              )}
            </div>

            <p className="border-t border-border pt-3 text-sm font-semibold text-foreground">
              Current outstanding across all open bills: {money(outstandingMoney)}
            </p>
          </div>
        )}

        <p className="mt-5 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
          Report generated from saved SchoolHub records. Completed collections
          include completed receipts only. Outstanding balances are current
          bill balances and may cover dates outside this report period.
        </p>
      </div>
      </>
      )}
    </section>
  );
}
