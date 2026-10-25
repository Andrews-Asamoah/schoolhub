import { TableExportMenu } from "@/components/ui/data-table";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  LoaderCircle,
  Package,
  Plus,
  Printer,
  Receipt,
  Search,
  Wallet,
} from "lucide-react";
import {
  createExpenseSchema,
  generateBillSchema,
  createInventoryItemSchema,
  inventoryStockMovementSchema,
  type CreateInventoryItemInput,
  type InventoryStockMovementInput,
  type CreateExpenseInput,
  type GenerateBillInput,
  type RecordPaymentInput,
} from "@schoolhub/shared";
import { AdminAnnouncementsWorkspace } from "./admin-announcements-workspace";
import { AccountantFinanceCharts } from "./accountant-finance-charts";
import { AccountantFinanceReportingWorkspace } from "./accountant-finance-reporting-workspace";
import { AccountantRecordPaymentDialog } from "./accountant-record-payment-dialog";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useFinanceAccess } from "@/components/portal/finance-access";

type AccountantTab =
  | "overview"
  | "invoices"
  | "payments"
  | "debtors"
  | "reports"
  | "payroll"
  | "expenses"
  | "inventory"
  | "announcements";

interface AccountantPortalWorkspaceProps {
  defaultTab?: AccountantTab;
}

interface StudentSummary {
  id: string;
  admissionNumber: string;
  profile?: { firstName?: string | null; lastName?: string | null } | null;
}

interface FinanceSchool {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  logo?: string | null;
}

interface ApiBill {
  id: string;
  billNumber: string;
  studentId: string;
  student: StudentSummary;
  class?: { id: string; name: string } | null;
  feeStructure?: { name: string } | null;
  academicYear?: { name: string } | null;
  term?: { name: string } | null;
  totalAmount: number | string;
  grossAmount?: number | string;
  discountAmount?: number | string;
  concessions?: { id: string; type: "SCHOLARSHIP" | "SIBLING_DISCOUNT"; label: string; amount: number | string }[];
  paidAmount: number | string;
  balanceAmount: number | string;
  status: "PAID" | "PARTIALLY_PAID" | "PENDING" | "OVERDUE" | "WAIVED" | "CANCELLED";
  dueDate?: string | null;
  issuedAt: string;
  items?: { id: string; description: string; amount: number | string; quantity: number; totalAmount: number | string; discountAmount?: number | string; paidAmount: number | string; balanceAmount: number | string }[];
}

interface ApiPaymentItem {
  amount: number | string;
  billItem: {
    description: string;
    feeItem?: {
      category?: string | null;
      customCategory?: { name: string } | null;
      registryItem?: { name: string } | null;
    } | null;
  };
}

interface ApiPayment {
  id: string;
  paymentNumber: string;
  studentId: string;
  student: StudentSummary;
  bill?: { id: string; billNumber: string } | null;
  amount: number | string;
  paymentMethod: RecordPaymentInput["paymentMethod"];
  referenceNumber?: string | null;
  paymentDate: string;
  status: string;
  paymentItems?: ApiPaymentItem[];
  recordedBy?: { name?: string | null; email?: string | null } | null;
}

interface ApiExpense {
  id: string;
  date: string;
  voucherNumber?: string | null;
  payee?: string | null;
  description: string;
  category?: string | null;
  customCategory?: { name: string } | null;
  registryCategory?: { name: string } | null;
  amount: number | string;
  paymentMethod: string;
  referenceNumber?: string | null;
}

interface ApiFeeStructure {
  id: string;
  name: string;
  description?: string | null;
  items: { id: string; name: string; amount: number | string }[];
  targetClasses: { class: { id: string; name: string } }[];
}

interface ApiClass {
  id: string;
  name: string;
  isActive: boolean;
  _count?: { students: number };
}

interface ApiTerm {
  id: string;
  name: string;
  isCurrent: boolean;
}

interface ApiAcademicYear {
  id: string;
  name: string;
  isCurrent: boolean;
  terms: ApiTerm[];
}

interface ApiInventoryItem {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  quantity: number;
  unit?: string | null;
  minQuantity: number;
  updatedAt: string;
  transactions?: { id: string; type: string; quantity: number; date: string; description?: string | null }[];
}

interface ApiPayroll {
  id: string;
  month: number;
  year: number;
  status: string;
  totalGross: number | string;
  totalNet: number | string;
  totalTax: number | string;
  totalSSNIT: number | string;
  payslips: {
    id: string;
    staffId?: string | null;
    teacherId?: string | null;
    basicSalary: number | string;
    allowances: number | string;
    grossSalary: number | string;
    netSalary: number | string;
    paymentStatus: string;
    paymentMethod: string;
    paidAt?: string | null;
  }[];
}

const currency = (value: number | string) =>
  new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const dateLabel = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-GH", { dateStyle: "medium" }).format(date);
};

const studentName = (student?: StudentSummary | null) => {
  const name = [student?.profile?.firstName, student?.profile?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return name || student?.admissionNumber || "Unknown student";
};

const inputClass =
  "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/30";
const buttonPrimary =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const buttonSecondary =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";

export function AccountantPortalWorkspace({
  defaultTab = "overview",
}: AccountantPortalWorkspaceProps) {
  const { canWrite } = useFinanceAccess();
  const queryClient = useQueryClient();
  const activeTab = defaultTab;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [overdueSearch, setOverdueSearch] = useState("");
  const [overdueClassFilter, setOverdueClassFilter] = useState("ALL");
  const [reportPeriod, setReportPeriod] = useState<"month" | "quarter" | "year" | "all">("year");
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [selectedBillId, setSelectedBillId] = useState("");
  const [selectedReceipt, setSelectedReceipt] = useState<ApiPayment | null>(null);
  const [reverseTarget, setReverseTarget] = useState<ApiPayment | null>(null);
  const [reverseKind, setReverseKind] = useState<"VOID" | "REFUND">("VOID");
  const [reverseReason, setReverseReason] = useState("");
  // One key per payment attempt: if the request is retried (double click, bad network)
  // the server returns the receipt it already recorded instead of creating a second one.
  const paymentKeyRef = useRef<string | null>(null);
  const [selectedInvoiceForPrint, setSelectedInvoiceForPrint] = useState<ApiBill | null>(null);
  const [selectedFeeStructureId, setSelectedFeeStructureId] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [showBillForm, setShowBillForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showInventoryForm, setShowInventoryForm] = useState(false);
  const [stockItemId, setStockItemId] = useState("");
  const [selectedPayrollId, setSelectedPayrollId] = useState("");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const schoolQuery = useQuery({
    queryKey: ["school", "current"],
    queryFn: () => apiFetch<FinanceSchool>("/schools/current"),
    enabled: Boolean(selectedInvoiceForPrint || selectedReceipt),
    retry: false,
  });
  const billsQuery = useQuery({
    queryKey: ["finance", "bills"],
    queryFn: () => apiFetch<ApiBill[]>("/finance/bills"),
    retry: false,
  });
  const paymentsQuery = useQuery({
    queryKey: ["finance", "payments"],
    queryFn: () => apiFetch<ApiPayment[]>("/finance/payments"),
    retry: false,
  });
  const expensesQuery = useQuery({
    queryKey: ["finance", "expenses"],
    queryFn: () => apiFetch<ApiExpense[]>("/finance/expenses"),
    retry: false,
  });
  const feeStructuresQuery = useQuery({
    queryKey: ["finance", "fee-structures"],
    queryFn: () => apiFetch<ApiFeeStructure[]>("/finance/fee-structures"),
    retry: false,
  });
  const classesQuery = useQuery({
    queryKey: ["academics", "classes"],
    queryFn: () => apiFetch<ApiClass[]>("/academics/classes"),
    retry: false,
  });
  const yearsQuery = useQuery({
    queryKey: ["schools", "academic-years"],
    queryFn: () => apiFetch<ApiAcademicYear[]>("/schools/academic-years"),
    retry: false,
  });
  const inventoryQuery = useQuery({
    queryKey: ["inventory", "items"],
    queryFn: () => apiFetch<ApiInventoryItem[]>("/inventory/items"),
    enabled: activeTab === "inventory",
    retry: false,
  });
  const payrollQuery = useQuery({
    queryKey: ["finance", "payroll"],
    queryFn: () => apiFetch<ApiPayroll[]>("/finance/payroll"),
    retry: false,
  });

  const bills = billsQuery.data ?? [];
  const payments = paymentsQuery.data ?? [];
  const expenses = expensesQuery.data ?? [];
  const feeStructures = feeStructuresQuery.data ?? [];
  const classes = (classesQuery.data ?? []).filter((schoolClass) => schoolClass.isActive);
  const payroll = payrollQuery.data ?? [];
  const selectedPayroll = payroll.find((run) => run.id === selectedPayrollId);
  const inventoryItems = inventoryQuery.data ?? [];

  const filteredBills = useMemo(() => bills.filter((bill) => {
    const term = search.trim().toLowerCase();
    const matchesSearch =
      !term ||
      bill.billNumber.toLowerCase().includes(term) ||
      studentName(bill.student).toLowerCase().includes(term) ||
      (bill.student?.admissionNumber ?? "").toLowerCase().includes(term) ||
      (bill.class?.name ?? "").toLowerCase().includes(term);
    const matchesStatus = statusFilter === "ALL" || bill.status === statusFilter;
    return matchesSearch && matchesStatus;
  }), [bills, search, statusFilter]);

  const recentPayments = useMemo(
    () => [...payments].sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()),
    [payments],
  );

  const filteredPayments = useMemo(() => payments.filter((payment) => {
    const term = search.trim().toLowerCase();
    return !term ||
      payment.paymentNumber.toLowerCase().includes(term) ||
      studentName(payment.student).toLowerCase().includes(term) ||
      (payment.referenceNumber ?? "").toLowerCase().includes(term);
  }), [payments, search]);

  const debtors = bills.filter((bill) => Number(bill.balanceAmount) > 0 && bill.status !== "CANCELLED" && bill.status !== "WAIVED");

  // Only settled receipts are counted as collections. Failed, pending,
  // cancelled and refunded transactions remain visible in history but are not
  // treated as cash received in dashboard totals or payment-method analysis.
  const settledPayments = payments.filter((payment) => payment.status === "COMPLETED");
  const collected = settledPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const outstanding = debtors.reduce((sum, bill) => sum + Number(bill.balanceAmount), 0);
  const expenseTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const paidPayroll = payroll.filter((run) => run.status === "PAID");
  const payrollNet = paidPayroll.reduce((sum, run) => sum + Number(run.totalNet), 0);
  const reportStartDate = useMemo(() => {
    if (reportPeriod === "all") return null;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    if (reportPeriod === "month") start.setDate(1);
    if (reportPeriod === "quarter") {
      start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);
    }
    if (reportPeriod === "year") start.setMonth(0, 1);
    return start;
  }, [reportPeriod]);
  const reportEndDate = useMemo(() => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return end;
  }, [reportPeriod]);
  const isInReportPeriod = (value?: string | null) => {
    if (!reportStartDate) return true;
    if (!value) return false;
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date >= reportStartDate && date <= reportEndDate;
  };
  const reportPayments = payments.filter((payment) => isInReportPeriod(payment.paymentDate));
  const reportSettledPayments = reportPayments.filter((payment) => payment.status === "COMPLETED");
  const reportCollected = reportSettledPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const reportExpenses = useMemo(
    () => expenses.filter((expense) => isInReportPeriod(expense.date)),
    [expenses, reportStartDate, reportEndDate],
  );
  const reportExpenseTotal = reportExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const reportPayroll = useMemo(() => {
    if (!reportStartDate) return payroll;
    return payroll.filter((run) => {
      const periodDate = new Date(run.year, run.month - 1, 1);
      return periodDate >= reportStartDate && periodDate <= reportEndDate;
    });
  }, [payroll, reportStartDate, reportEndDate]);
  const reportPayrollPaid = reportPayroll.filter((run) => run.status === "PAID");
  const reportPayrollNet = reportPayrollPaid.reduce((sum, run) => sum + Number(run.totalNet), 0);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const overdueBills = debtors.filter((bill) => {
    if (!bill.dueDate) return bill.status === "OVERDUE";
    const dueDate = new Date(bill.dueDate);
    dueDate.setHours(0, 0, 0, 0);
    return bill.status === "OVERDUE" || (!Number.isNaN(dueDate.getTime()) && dueDate < todayStart);
  }).sort((a, b) => {
    const aDue = a.dueDate ? new Date(a.dueDate).getTime() : 0;
    const bDue = b.dueDate ? new Date(b.dueDate).getTime() : 0;
    return aDue - bDue;
  });
  const overdueTotal = overdueBills.reduce((sum, bill) => sum + Number(bill.balanceAmount), 0);
  const billedInPeriod = bills.filter((bill) => isInReportPeriod(bill.issuedAt)).reduce((sum, bill) => sum + Number(bill.totalAmount), 0);
  const collectionRate = billedInPeriod > 0 ? (reportCollected / billedInPeriod) * 100 : null;
  const visibleOverdueBills = overdueBills.filter((bill) => {
    const term = overdueSearch.trim().toLowerCase();
    const matchesSearch = !term ||
      bill.billNumber.toLowerCase().includes(term) ||
      studentName(bill.student).toLowerCase().includes(term) ||
      (bill.student?.admissionNumber ?? "").toLowerCase().includes(term) ||
      (bill.class?.name ?? "").toLowerCase().includes(term);
    return matchesSearch && (overdueClassFilter === "ALL" || bill.class?.id === overdueClassFilter);
  });
  const currentYear = (yearsQuery.data ?? []).find((year) => year.isCurrent);
  const currentTerm = currentYear?.terms.find((term) => term.isCurrent);
  const selectedFeeStructure = feeStructures.find((fee) => fee.id === selectedFeeStructureId);
  const billTargetClasses = selectedFeeStructure?.targetClasses.length
    ? classes.filter((schoolClass) => selectedFeeStructure.targetClasses.some((target) => target.class.id === schoolClass.id))
    : classes;

  const createInventoryItem = useMutation({
    mutationFn: (input: CreateInventoryItemInput) =>
      apiFetch<ApiInventoryItem>("/inventory/items", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      setMessage({ kind: "success", text: "Inventory item created and opening stock recorded." });
      setShowInventoryForm(false);
      await queryClient.invalidateQueries({ queryKey: ["inventory", "items"] });
    },
    onError: (error: Error) => setMessage({ kind: "error", text: error.message }),
  });

  const recordStockMovement = useMutation({
    mutationFn: ({ itemId, input }: { itemId: string; input: InventoryStockMovementInput }) =>
      apiFetch("/inventory/items/" + itemId + "/movements", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      setMessage({ kind: "success", text: "Stock movement recorded and inventory quantity updated." });
      setStockItemId("");
      await queryClient.invalidateQueries({ queryKey: ["inventory", "items"] });
    },
    onError: (error: Error) => setMessage({ kind: "error", text: error.message }),
  });

  const recordPayment = useMutation({
    mutationFn: (input: RecordPaymentInput) =>
      apiFetch<ApiPayment>("/finance/payments", {
        method: "POST",
        body: JSON.stringify({ ...input, idempotencyKey: (paymentKeyRef.current ??= crypto.randomUUID()) }),
      }),
    onSuccess: async (payment) => {
      paymentKeyRef.current = null;
      setMessage({ kind: "success", text: `Payment recorded. Receipt ${payment.paymentNumber} is ready.` });
      setShowPaymentForm(false);
      setSelectedBillId("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["finance", "payments"] }),
        queryClient.invalidateQueries({ queryKey: ["finance", "bills"] }),
        queryClient.invalidateQueries({ queryKey: ["students"] }),
      ]);
    },
    onError: (error: Error) => setMessage({ kind: "error", text: error.message }),
  });

  useEffect(() => {
    if (!showPaymentForm) paymentKeyRef.current = null;
  }, [showPaymentForm]);

  const reversePayment = useMutation({
    mutationFn: (input: { id: string; kind: "VOID" | "REFUND"; reason: string }) =>
      apiFetch<ApiPayment>(`/finance/payments/${encodeURIComponent(input.id)}/reverse`, {
        method: "POST",
        body: JSON.stringify({ kind: input.kind, reason: input.reason }),
      }),
    onSuccess: async (payment) => {
      setMessage({ kind: "success", text: `Receipt ${payment.paymentNumber} was reversed and the bill balance restored.` });
      setReverseTarget(null);
      setReverseReason("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["finance", "payments"] }),
        queryClient.invalidateQueries({ queryKey: ["finance", "bills"] }),
        queryClient.invalidateQueries({ queryKey: ["students"] }),
      ]);
    },
    onError: (error: Error) => setMessage({ kind: "error", text: error.message }),
  });

  const generateBills = useMutation({
    mutationFn: (input: GenerateBillInput) =>
      apiFetch<{ count: number; totalBilled: number; message?: string }>("/finance/bills/generate", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async (result) => {
      setMessage({
        kind: "success",
        text: result.count
          ? `Generated ${result.count} bill(s), totalling ${currency(result.totalBilled)}.`
          : result.message ?? "No bills were generated.",
      });
      setShowBillForm(false);
      setSelectedFeeStructureId("");
      setSelectedClassId("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["finance", "bills"] }),
        queryClient.invalidateQueries({ queryKey: ["finance", "fee-structures"] }),
      ]);
    },
    onError: (error: Error) => setMessage({ kind: "error", text: error.message }),
  });

  const createExpense = useMutation({
    mutationFn: (input: CreateExpenseInput) =>
      apiFetch<ApiExpense>("/finance/expenses", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      setMessage({ kind: "success", text: "Expense saved to the school finance records." });
      setShowExpenseForm(false);
      await queryClient.invalidateQueries({ queryKey: ["finance", "expenses"] });
    },
    onError: (error: Error) => setMessage({ kind: "error", text: error.message }),
  });

  function submitInventoryItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = createInventoryItemSchema.safeParse({
      name: form.get("name"),
      description: String(form.get("description") ?? "").trim() || undefined,
      category: String(form.get("category") ?? "").trim() || undefined,
      unit: form.get("unit"),
      minQuantity: Number(form.get("minQuantity")),
      initialQuantity: Number(form.get("initialQuantity")),
    });
    if (!result.success) {
      setMessage({ kind: "error", text: result.error.issues[0]?.message ?? "Check the inventory details." });
      return;
    }
    setMessage(null);
    createInventoryItem.mutate(result.data);
  }

  function submitStockMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = inventoryStockMovementSchema.safeParse({
      type: form.get("type"),
      quantity: Number(form.get("quantity")),
      date: form.get("date"),
      description: String(form.get("description") ?? "").trim() || undefined,
      recipientName: String(form.get("recipientName") ?? "").trim() || undefined,
    });
    if (!result.success) {
      setMessage({ kind: "error", text: result.error.issues[0]?.message ?? "Check the stock movement details." });
      return;
    }
    setMessage(null);
    recordStockMovement.mutate({ itemId: stockItemId, input: result.data });
  }

  function submitBill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = generateBillSchema.safeParse({
      academicYearId: currentYear?.id,
      termId: currentTerm?.id,
      feeStructureId: form.get("feeStructureId"),
      classId: selectedClassId,
      dueDate: String(form.get("dueDate") ?? "") || undefined,
      notes: String(form.get("notes") ?? "").trim() || undefined,
    });
    if (!currentYear || !currentTerm) {
      setMessage({ kind: "error", text: "Set a current academic year and term before generating bills." });
      return;
    }
    if (!result.success) {
      setMessage({ kind: "error", text: result.error.issues[0]?.message ?? "Check the billing details." });
      return;
    }
    setMessage(null);
    generateBills.mutate(result.data);
  }

  function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = createExpenseSchema.safeParse({
      date: form.get("date"),
      amount: Number(form.get("amount")),
      description: form.get("description"),
      payee: String(form.get("payee") ?? "").trim() || undefined,
      category: form.get("category"),
      paymentMethod: form.get("paymentMethod"),
      referenceNumber: String(form.get("referenceNumber") ?? "").trim() || undefined,
    });
    if (!result.success) {
      setMessage({ kind: "error", text: result.error.issues[0]?.message ?? "Check the expense details." });
      return;
    }
    setMessage(null);
    createExpense.mutate(result.data);
  }

  const loading =
    billsQuery.isPending || paymentsQuery.isPending || expensesQuery.isPending ||
    feeStructuresQuery.isPending || classesQuery.isPending || yearsQuery.isPending || payrollQuery.isPending || (activeTab === "inventory" && inventoryQuery.isPending);

  return (
    <div className="space-y-6"><style>{`@media print {
        body * { visibility: hidden !important; }
        .payment-receipt-print, .payment-receipt-print *, .invoice-print-area, .invoice-print-area * { visibility: visible !important; }
        .payment-receipt-print, .invoice-print-area { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; max-width: none !important; margin: 0 !important; padding: 24px !important; border: 0 !important; box-shadow: none !important; background: white !important; color: black !important; }
        .payment-receipt-actions, .invoice-print-actions { display: none !important; }
        .payment-receipt-print p, .payment-receipt-print span, .payment-receipt-print h2, .payment-receipt-print h3, .invoice-print-area p, .invoice-print-area span, .invoice-print-area h2, .invoice-print-area h3 { color: black !important; }
        @page { size: A4 portrait; margin: 12mm; }
      }`}</style>
      {activeTab === "overview" && (
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-success via-success to-foreground p-6 text-background shadow-lg sm:p-8">
          <div className="pointer-events-none absolute -right-12 -top-20 size-64 rounded-full bg-success/10 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-background/20 bg-background/10 px-3 py-1 text-xs font-semibold">
                <CircleDollarSign className="size-4" />
                Finance & bursary
              </div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Accountant workspace</h1>
              <p className="text-sm leading-6 text-success-foreground/90">
                Manage fee billing, record collections, track debtors, review expenses, and monitor payroll records.
                Figures on this page are calculated from the school’s saved finance records.
              </p>
            </div>
            {canWrite ? (<div className="flex flex-wrap gap-2">
              <button className={buttonPrimary} onClick={() => { setMessage(null); setSelectedBillId(""); setShowPaymentForm(true); }}>
                <Plus className="size-4" /> Record payment
              </button>
              <button className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-background/30 bg-background/10 px-4 py-2 text-sm font-semibold text-background transition hover:bg-background/20" onClick={() => { setMessage(null); setSelectedFeeStructureId(""); setSelectedClassId(""); setShowBillForm(true); }}>
                <Receipt className="size-4" /> Generate bills
              </button>
              <button className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-background/30 bg-background/10 px-4 py-2 text-sm font-semibold text-background transition hover:bg-background/20" onClick={() => { setMessage(null); setShowExpenseForm(true); }}>
                <Plus className="size-4" /> Add expense
              </button>
            </div>) : <p className="max-w-xs text-sm text-background/80">View only. Only the school accountant can record or change financial data.</p>}
          </div>
        </section>
      )}

      {message && !showPaymentForm && !showBillForm && !showExpenseForm && !showInventoryForm && !stockItemId && (
        <div role={message.kind === "error" ? "alert" : "status"} className={cn(
          "flex items-start gap-3 rounded-2xl border p-4 text-sm",
          message.kind === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-success/30 bg-success/5 text-foreground",
        )}>
          {message.kind === "error" ? <AlertCircle className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}
          <p className="min-w-0 flex-1">{message.text}</p>
          <button className="text-xs font-semibold underline" onClick={() => setMessage(null)}>Dismiss</button>
        </div>
      )}

      {activeTab === "overview" && (
        <section aria-label="Financial performance indicators" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="text-lg font-semibold text-foreground">Financial performance</h2><p className="mt-1 text-sm text-muted-foreground">A live summary of saved records. Select a card to review its supporting records.</p></div>
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">Reporting period
              <select className={cn(inputClass, "w-auto min-w-40")} value={reportPeriod} onChange={(event) => setReportPeriod(event.target.value as typeof reportPeriod)} aria-label="Dashboard reporting period">
                <option value="month">This month to date</option><option value="quarter">This quarter to date</option><option value="year">This year to date</option><option value="all">All available records</option>
              </select>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <DashboardMetricLink to="payments" label="Fees collected" value={paymentsQuery.error ? "Unavailable" : currency(reportCollected)} detail={paymentsQuery.error ? "Payment data unavailable" : `${reportSettledPayments.length} completed receipts in period`} icon={ArrowUpRight} />
            <DashboardMetricLink to="invoices" label="Fees billed" value={billsQuery.error ? "Unavailable" : currency(billedInPeriod)} detail={billsQuery.error ? "Bill data unavailable" : "Bills issued in selected period"} icon={Receipt} />
            <DashboardMetricLink to="debtors" label="Outstanding fees" value={billsQuery.error ? "Unavailable" : currency(outstanding)} detail={billsQuery.error ? "Bill data unavailable" : `${debtors.length} bills with balances`} icon={AlertCircle} />
            <DashboardMetricLink to="debtors" label="Overdue balances" value={billsQuery.error ? "Unavailable" : currency(overdueTotal)} detail={billsQuery.error ? "Bill data unavailable" : `${overdueBills.length} overdue bills`} icon={ArrowDownRight} />
            <DashboardMetricLink to="expenses" label="Operating expenses" value={expensesQuery.error ? "Unavailable" : currency(reportExpenseTotal)} detail={expensesQuery.error ? "Expense data unavailable" : `${reportExpenses.length} expense records in period`} icon={Wallet} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium text-muted-foreground">Collection rate</span><span className="text-lg font-bold tabular-nums text-foreground">{collectionRate === null ? "—" : `${collectionRate.toFixed(1)}%`}</span></div>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, Math.max(0, collectionRate ?? 0))}%` }} /></div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{collectionRate === null ? "No bills were issued in this reporting period, so a collection rate cannot be calculated." : "Completed collections divided by bills issued in the selected period; collections may include payments against earlier bills, so this is an operational indicator rather than a cohort collection rate."}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium text-muted-foreground">Payroll paid (net)</span><span className="text-lg font-bold tabular-nums text-foreground">{payrollQuery.error ? "Unavailable" : currency(reportPayrollNet)}</span></div>
              <p className="mt-2 text-xs text-muted-foreground">{payrollQuery.error ? "Payroll data unavailable" : `${reportPayrollPaid.length} paid payroll run(s) in the selected period`}</p>
              <Link to="/$page" params={{ page: "payroll" }} className="mt-3 inline-flex text-xs font-semibold text-primary hover:underline">Review payroll records →</Link>
            </div>
          </div>
        </section>
      )}

      {loading && activeTab !== "announcements" && (
        <div role="status" className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-12 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" /> Loading live finance records…
        </div>
      )}

      {!loading && activeTab === "overview" && (
        <div className="space-y-5">
          <AccountantFinanceCharts payments={payments} expenses={expenses} bills={bills} />
          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-lg font-semibold text-foreground">Overdue-fees management</h2><p className="mt-1 text-sm text-muted-foreground">Prioritise bills past their due date with an outstanding balance, then open the bill or record a payment.</p></div>
              <div className="rounded-xl bg-destructive/5 px-4 py-3 text-right"><p className="text-xs text-muted-foreground">Overdue balance</p><p className="mt-1 text-lg font-bold tabular-nums text-destructive">{billsQuery.error ? "Unavailable" : currency(overdueTotal)}</p><p className="text-xs text-muted-foreground">{overdueBills.length} overdue bill(s)</p></div>
            </div>
            <div className="my-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
              <div className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><input className={cn(inputClass, "pl-9")} value={overdueSearch} onChange={(event) => setOverdueSearch(event.target.value)} placeholder="Search student, admission no., bill or class" aria-label="Search overdue bills" /></div>
              <select className={inputClass} value={overdueClassFilter} onChange={(event) => setOverdueClassFilter(event.target.value)} aria-label="Filter overdue bills by class"><option value="ALL">All classes</option>{classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</option>)}</select>
            </div>
            {billsQuery.error ? <QueryError message={billsQuery.error.message} /> : visibleOverdueBills.length ? (
              <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm">
                <thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="p-3">Student / bill</th><th className="p-3">Class</th><th className="p-3">Due date</th><th className="p-3 text-right">Days overdue</th><th className="p-3 text-right">Outstanding</th><th className="p-3">Action</th></tr></thead>
                <tbody>{visibleOverdueBills.slice(0, 8).map((bill) => {
                  const due = bill.dueDate ? new Date(bill.dueDate) : null;
                  const days = due && !Number.isNaN(due.getTime()) ? Math.max(0, Math.floor((todayStart.getTime() - new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime()) / 86400000)) : null;
                  return <tr key={bill.id} className="border-b border-border/70 last:border-0 hover:bg-muted/40">
                    <td className="p-3"><p className="font-semibold text-foreground">{studentName(bill.student)}</p><p className="text-xs text-muted-foreground">{bill.billNumber} · {bill.student?.admissionNumber ?? "No admission number"}</p></td>
                    <td className="p-3">{bill.class?.name ?? "Class not recorded"}</td><td className="p-3">{dateLabel(bill.dueDate)}</td>
                    <td className="p-3 text-right tabular-nums">{days === null ? "—" : days}</td><td className="p-3 text-right font-semibold tabular-nums">{currency(bill.balanceAmount)}</td>
                    <td className="p-3"><div className="flex items-center gap-3"><button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => setSelectedInvoiceForPrint(bill)}>View bill</button>{canWrite && <button type="button" className="text-xs font-semibold text-foreground hover:underline" onClick={() => { setSelectedBillId(bill.id); setShowPaymentForm(true); }}>Record payment</button>}</div></td>
                  </tr>;
                })}</tbody>
              </table>
              {visibleOverdueBills.length > 8 && <p className="mt-3 text-xs text-muted-foreground">Showing 8 of {visibleOverdueBills.length} matching overdue bills. Use the Debtors page for the full list.</p>}</div>
            ) : <EmptyState icon={CheckCircle2} title={overdueBills.length ? "No matching overdue bills" : "No overdue fees"} description={overdueBills.length ? "Try another search or class filter." : "There are no bills past their due date with an outstanding balance. Keep monitoring this panel as payments are recorded."} />}
            <div className="mt-4 flex flex-wrap gap-2"><Link to="/$page" params={{ page: "debtors" }} className={buttonSecondary}>View all outstanding fees</Link><Link to="/$page" params={{ page: "invoices" }} className={buttonSecondary}>Open all invoices</Link></div>
          </section>
          <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-foreground">Recent payments</h2><p className="mt-1 text-sm text-muted-foreground">Latest receipts recorded for this school</p></div><Link to="/$page" params={{ page: "payments" }} className={buttonSecondary}>View payments</Link></div>
              {paymentsQuery.error ? <QueryError message={paymentsQuery.error.message} /> : <PaymentsTable payments={recentPayments.slice(0, 6)} onViewReceipt={setSelectedReceipt} />}
            </section>
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="font-semibold text-foreground">Finance activity</h2><p className="mt-1 text-sm text-muted-foreground">Quick access to records that need attention.</p>
              <div className="mt-4 space-y-3"><AttentionItem title="Bills with balances" value={billsQuery.error ? "—" : String(debtors.length)} detail={billsQuery.error ? "Could not load bill records" : currency(outstanding)} to="debtors" /><AttentionItem title="Overdue bills" value={billsQuery.error ? "—" : String(overdueBills.length)} detail={billsQuery.error ? "Could not load bill records" : currency(overdueTotal)} to="debtors" /><AttentionItem title="Expense records" value={expensesQuery.error ? "—" : String(reportExpenses.length)} detail={expensesQuery.error ? "Could not load expense records" : currency(reportExpenseTotal)} to="expenses" /></div>
            </section>
          </div>
        </div>
      )}

      {!loading && activeTab === "invoices" && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <SectionHeader title="Invoices & bills" description="Search bills, review balances, and generate billing for an active class." action={<div className="flex flex-wrap gap-2"><TableExportMenu build={() => ({ title: "Invoice register", headers: ["Invoice","Student","Admission number","Class","Fee structure","Due date","Gross (GHS)","Discount (GHS)","Total (GHS)","Paid (GHS)","Balance (GHS)","Status"], columnTypes: ["text","text","text","text","text","date","money","money","money","money","money","text"], rows: filteredBills.map(bill => [bill.billNumber, studentName(bill.student), bill.student?.admissionNumber ?? "", bill.class?.name ?? "", bill.feeStructure?.name ?? "", dateLabel(bill.dueDate), Number(bill.grossAmount ?? bill.totalAmount), Number(bill.discountAmount ?? 0), Number(bill.totalAmount), Number(bill.paidAmount), Number(bill.balanceAmount), bill.status]), reportInfo: { school: schoolQuery.data?.name, filters: { search, status: statusFilter } } })} note="Export reflects the current invoice filters." />{canWrite && <button className={buttonPrimary} onClick={() => { setMessage(null); setSelectedFeeStructureId(""); setSelectedClassId(""); setShowBillForm(true); }}><Plus className="size-4" /> Generate bills</button>}</div>} />
          <SearchFilters search={search} setSearch={setSearch} statusFilter={statusFilter} setStatusFilter={setStatusFilter} statuses={["PENDING", "PARTIALLY_PAID", "PAID", "OVERDUE"]} />
          {billsQuery.error ? <QueryError message={billsQuery.error.message} /> : <BillsTable bills={filteredBills} onRecordPayment={canWrite ? (bill) => { setSelectedBillId(bill.id); setShowPaymentForm(true); } : undefined} onViewInvoice={setSelectedInvoiceForPrint} />}
        </section>
      )}

      {!loading && activeTab === "payments" && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <SectionHeader title="Payments & receipts" description="Saved payment transactions from the school finance ledger." action={<div className="flex flex-wrap gap-2"><TableExportMenu build={() => ({ title: "Payment register", headers: ["Receipt","Student","Admission number","Bill","Date","Method","Reference","Amount (GHS)","Status"], columnTypes: ["text","text","text","text","date","text","text","money","text"], rows: filteredPayments.map(payment => [payment.paymentNumber, studentName(payment.student), payment.student?.admissionNumber ?? "", payment.bill?.billNumber ?? "", dateLabel(payment.paymentDate), payment.paymentMethod, payment.referenceNumber ?? "", Number(payment.amount), payment.status]), reportInfo: { school: schoolQuery.data?.name, filters: { search } } })} note="Export reflects the current payment filters." />{canWrite && <button className={buttonPrimary} onClick={() => { setMessage(null); setSelectedBillId(""); setShowPaymentForm(true); }}><Plus className="size-4" /> Record payment</button>}</div>} />
          <div className="relative my-4 max-w-md"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><input className={cn(inputClass, "pl-9")} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search receipt, student, or reference" /></div>
          {paymentsQuery.error ? <QueryError message={paymentsQuery.error.message} /> : <PaymentsTable payments={filteredPayments} onViewReceipt={setSelectedReceipt} onReverse={canWrite ? (payment) => { setReverseKind("VOID"); setReverseReason(""); setReverseTarget(payment); } : undefined} />}
        </section>
      )}

      {!loading && activeTab === "debtors" && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <SectionHeader title="Outstanding fees" description="Bills with a positive balance, calculated from saved billing records." />
          {billsQuery.error ? <QueryError message={billsQuery.error.message} /> : <BillsTable bills={debtors.filter((bill) => {
            const term = search.trim().toLowerCase();
            return !term || bill.billNumber.toLowerCase().includes(term) || studentName(bill.student).toLowerCase().includes(term) || (bill.class?.name ?? "").toLowerCase().includes(term);
          })} onRecordPayment={canWrite ? (bill) => { setSelectedBillId(bill.id); setShowPaymentForm(true); } : undefined} onViewInvoice={setSelectedInvoiceForPrint} />}
        </section>
      )}


      {!loading && activeTab === "reports" && <AccountantFinanceReportingWorkspace bills={bills} payments={payments} classes={classes} />}



      {!loading && activeTab === "expenses" && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <SectionHeader title="Operating expenses" description="Expense entries saved to the school database." action={canWrite ? <button className={buttonPrimary} onClick={() => { setMessage(null); setShowExpenseForm(true); }}><Plus className="size-4" /> Add expense</button> : undefined} />
          {expensesQuery.error ? <QueryError message={expensesQuery.error.message} /> : <ExpensesTable expenses={expenses} />}
        </section>
      )}

      {!loading && !payrollQuery.isPending && activeTab === "payroll" && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <SectionHeader title="Payroll records" description="Saved payroll runs and totals. This workspace does not fabricate salary data." />
          {payrollQuery.error ? <QueryError message={payrollQuery.error.message} /> : payroll.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="p-3">Payroll period</th><th className="p-3">Status</th><th className="p-3 text-right">Gross</th><th className="p-3 text-right">Tax</th><th className="p-3 text-right">Net</th><th className="p-3 text-right">Payslips</th><th className="p-3"></th></tr></thead>
                <tbody>{payroll.map((run) => <tr key={run.id} className="border-b border-border/70 last:border-0"><td className="p-3 font-medium">{new Date(run.year, run.month - 1, 1).toLocaleDateString("en-GH", { month: "long", year: "numeric" })}</td><td className="p-3"><StatusBadge value={run.status} /></td><td className="p-3 text-right tabular-nums">{currency(run.totalGross)}</td><td className="p-3 text-right tabular-nums">{currency(run.totalTax)}</td><td className="p-3 text-right tabular-nums">{currency(run.totalNet)}</td><td className="p-3 text-right">{run.payslips.length}</td><td className="p-3 text-right"><button className="text-xs font-semibold text-primary hover:underline" onClick={() => setSelectedPayrollId(run.id)}>View payslips</button></td></tr>)}</tbody>
              </table>
            </div>
          ) : <EmptyState icon={Wallet} title="No payroll runs yet" description="Payroll becomes available here when an authorised payroll process creates a saved payroll run." />}
        </section>
      )}

      {!loading && activeTab === "inventory" && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <SectionHeader
            title="Supplies & inventory"
            description="Track stock quantities, minimum levels, and auditable stock-in / stock-out movements."
            action={<button className={buttonPrimary} onClick={() => { setMessage(null); setShowInventoryForm(true); }}><Plus className="size-4" /> Add item</button>}
          />
          {inventoryQuery.error ? <QueryError message={inventoryQuery.error.message} /> : inventoryItems.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="p-3">Item</th><th className="p-3">Category</th><th className="p-3 text-right">On hand</th><th className="p-3 text-right">Minimum</th><th className="p-3">Stock status</th><th className="p-3">Updated</th><th className="p-3"></th></tr></thead>
                <tbody>{inventoryItems.map((item) => {
                  const low = item.quantity <= item.minQuantity;
                  return <tr key={item.id} className="border-b border-border/70 last:border-0">
                    <td className="p-3"><div className="font-semibold text-foreground">{item.name}</div><div className="text-xs text-muted-foreground">{item.description || item.unit || "—"}</div></td>
                    <td className="p-3">{item.category || "Uncategorised"}</td>
                    <td className="p-3 text-right font-semibold tabular-nums">{item.quantity} {item.unit || "pcs"}</td>
                    <td className="p-3 text-right tabular-nums">{item.minQuantity}</td>
                    <td className="p-3"><StatusBadge value={low ? "LOW STOCK" : "IN STOCK"} /></td>
                    <td className="p-3">{dateLabel(item.updatedAt)}</td>
                    <td className="p-3 text-right"><button className="text-xs font-semibold text-primary hover:underline" onClick={() => { setMessage(null); setStockItemId(item.id); }}>Record movement</button></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          ) : <EmptyState icon={Package} title="No inventory items yet" description="Create an item and record its opening quantity. Every subsequent stock-in or stock-out is stored as a dated movement." />}
        </section>
      )}

      {activeTab === "announcements" && <AdminAnnouncementsWorkspace mode="accountant" />}

      {selectedInvoiceForPrint && (
        <Modal title="Invoice summary" description="Print-ready summary of the saved bill record." onClose={() => setSelectedInvoiceForPrint(null)}>
          <section className="invoice-print-area rounded-xl border border-border p-5">
            <div className="mb-5 flex items-center gap-3 border-b border-border pb-4">
              {schoolQuery.data?.logo ? <img src={schoolQuery.data.logo} alt="" className="size-14 rounded-lg object-contain" /> : <div aria-hidden="true" className="flex size-14 items-center justify-center rounded-lg bg-muted text-lg font-bold text-foreground">{(schoolQuery.data?.name ?? "SH").slice(0, 2).toUpperCase()}</div>}
              <div className="min-w-0 flex-1"><p className="font-bold text-foreground">{schoolQuery.data?.name ?? "SchoolHub"}</p><p className="mt-1 text-xs text-muted-foreground">{[schoolQuery.data?.address, schoolQuery.data?.phone, schoolQuery.data?.email].filter(Boolean).join(" · ") || "School finance office"}</p></div>
            </div>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
              <div><p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">SchoolHub · Student invoice</p><h2 className="mt-1 text-xl font-bold text-foreground">{selectedInvoiceForPrint.billNumber}</h2><p className="mt-1 text-sm text-muted-foreground">Issued {dateLabel(selectedInvoiceForPrint.issuedAt)}</p></div>
              <div className="text-right"><p className="text-xs text-muted-foreground">Invoice total</p><p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{currency(selectedInvoiceForPrint.totalAmount)}</p><StatusBadge value={selectedInvoiceForPrint.status} /></div>
            </div>
            <div className="grid gap-x-6 gap-y-4 py-4 sm:grid-cols-2">
              <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Student</p><p className="mt-1 font-semibold text-foreground">{studentName(selectedInvoiceForPrint.student)}</p><p className="mt-1 text-xs text-muted-foreground">Admission no. {selectedInvoiceForPrint.student?.admissionNumber || "—"}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Class</p><p className="mt-1 font-semibold text-foreground">{selectedInvoiceForPrint.class?.name || "Class not recorded"}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Fee structure</p><p className="mt-1 font-semibold text-foreground">{selectedInvoiceForPrint.feeStructure?.name || "Fee bill"}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Academic period</p><p className="mt-1 font-semibold text-foreground">{[selectedInvoiceForPrint.academicYear?.name, selectedInvoiceForPrint.term?.name].filter(Boolean).join(" · ") || "Not specified"}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Due date</p><p className="mt-1 font-semibold text-foreground">{dateLabel(selectedInvoiceForPrint.dueDate)}</p></div>
            </div>
            {selectedInvoiceForPrint.items?.length ? <div className="py-4"><h3 className="mb-2 text-sm font-semibold text-foreground">Fee items</h3><div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="py-2 pr-3">Description</th><th className="px-2 py-2 text-right">Qty</th><th className="px-2 py-2 text-right">Unit amount</th><th className="px-2 py-2 text-right">Total</th><th className="pl-2 py-2 text-right">Discount</th></tr></thead><tbody>{selectedInvoiceForPrint.items.map(item => <tr key={item.id} className="border-b border-border/70 last:border-0"><td className="py-2 pr-3 text-foreground">{item.description}</td><td className="px-2 py-2 text-right tabular-nums">{item.quantity}</td><td className="px-2 py-2 text-right tabular-nums">{currency(item.amount)}</td><td className="px-2 py-2 text-right font-medium tabular-nums">{currency(item.totalAmount)}</td><td className="pl-2 py-2 text-right tabular-nums text-success">{Number(item.discountAmount ?? 0) > 0 ? "−" + currency(item.discountAmount ?? 0) : "—"}</td></tr>)}</tbody></table></div></div> : null}
            <div className="border-y border-border py-4">{Number(selectedInvoiceForPrint.discountAmount ?? 0) > 0 && <><div className="grid grid-cols-[1fr_auto] gap-3 py-2 text-sm"><span className="text-muted-foreground">Original fees</span><span className="font-medium tabular-nums text-foreground">{currency(selectedInvoiceForPrint.grossAmount ?? selectedInvoiceForPrint.totalAmount)}</span></div>{selectedInvoiceForPrint.concessions?.map((concession) => <div key={concession.id} className="grid grid-cols-[1fr_auto] gap-3 py-1 text-sm"><span className="text-success">{concession.label}</span><span className="font-medium tabular-nums text-success">−{currency(concession.amount)}</span></div>)}<div className="grid grid-cols-[1fr_auto] gap-3 border-t border-border py-2 text-sm"><span className="text-muted-foreground">Discounts & scholarships</span><span className="font-semibold tabular-nums text-success">−{currency(selectedInvoiceForPrint.discountAmount ?? 0)}</span></div></>}<div className="grid grid-cols-[1fr_auto] gap-3 py-2 text-sm"><span className="text-muted-foreground">Total billed</span><span className="font-semibold tabular-nums text-foreground">{currency(selectedInvoiceForPrint.totalAmount)}</span></div><div className="grid grid-cols-[1fr_auto] gap-3 py-2 text-sm"><span className="text-muted-foreground">Payments recorded</span><span className="font-semibold tabular-nums text-foreground">{currency(selectedInvoiceForPrint.paidAmount)}</span></div><div className="grid grid-cols-[1fr_auto] gap-3 border-t border-border pt-3 text-base"><span className="font-semibold text-foreground">Balance due</span><span className="font-bold tabular-nums text-foreground">{currency(selectedInvoiceForPrint.balanceAmount)}</span></div></div>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">This invoice summary reflects the saved SchoolHub bill and its recorded line items.</p>
          </section>
          <div className="invoice-print-actions mt-4 flex flex-wrap justify-end gap-2"><TableExportMenu build={() => ({ title: "Invoice " + selectedInvoiceForPrint.billNumber, headers: ["Field","Value"], rows: [["Invoice",selectedInvoiceForPrint.billNumber],["Student",studentName(selectedInvoiceForPrint.student)],["Admission number",selectedInvoiceForPrint.student?.admissionNumber ?? ""],["Class",selectedInvoiceForPrint.class?.name ?? ""],["Fee structure",selectedInvoiceForPrint.feeStructure?.name ?? ""],["Academic year",selectedInvoiceForPrint.academicYear?.name ?? ""],["Term",selectedInvoiceForPrint.term?.name ?? ""],["Issued",dateLabel(selectedInvoiceForPrint.issuedAt)],["Due date",dateLabel(selectedInvoiceForPrint.dueDate)],["Gross fees (GHS)",Number(selectedInvoiceForPrint.grossAmount ?? selectedInvoiceForPrint.totalAmount)],["Discounts (GHS)",Number(selectedInvoiceForPrint.discountAmount ?? 0)],["Total (GHS)",Number(selectedInvoiceForPrint.totalAmount)],["Paid (GHS)",Number(selectedInvoiceForPrint.paidAmount)],["Balance (GHS)",Number(selectedInvoiceForPrint.balanceAmount)],["Status",selectedInvoiceForPrint.status]], reportInfo: { school: schoolQuery.data?.name, period: [selectedInvoiceForPrint.academicYear?.name, selectedInvoiceForPrint.term?.name].filter(Boolean).join(" · ") } })} /><button type="button" className={buttonPrimary} onClick={() => window.print()}><Printer className="size-4" /> Print / Save PDF</button></div>
        </Modal>
      )}

      {selectedReceipt && (
        <Modal title="Payment receipt" description="Saved receipt details from the school payment ledger." onClose={() => setSelectedReceipt(null)}>
          <section className="payment-receipt-print rounded-xl border border-border p-5">
            <div className="mb-5 flex items-center gap-3 border-b border-border pb-4">
              {schoolQuery.data?.logo ? <img src={schoolQuery.data.logo} alt="" className="size-14 rounded-lg object-contain" /> : <div aria-hidden="true" className="flex size-14 items-center justify-center rounded-lg bg-muted text-lg font-bold text-foreground">{(schoolQuery.data?.name ?? "SH").slice(0, 2).toUpperCase()}</div>}
              <div className="min-w-0 flex-1"><p className="font-bold text-foreground">{schoolQuery.data?.name ?? "SchoolHub"}</p><p className="mt-1 text-xs text-muted-foreground">{[schoolQuery.data?.address, schoolQuery.data?.phone, schoolQuery.data?.email].filter(Boolean).join(" · ") || "School finance office"}</p></div>
            </div>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
              <div><p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">SchoolHub · Official receipt record</p><h2 className="mt-1 text-xl font-bold text-foreground">{selectedReceipt.paymentNumber}</h2><p className="mt-1 text-sm text-muted-foreground">{dateLabel(selectedReceipt.paymentDate)}</p></div>
              <div className="text-right"><p className="text-xs text-muted-foreground">Amount received</p><p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{currency(selectedReceipt.amount)}</p><StatusBadge value={selectedReceipt.status} /></div>
            </div>
            <div className="grid gap-x-6 gap-y-4 py-4 sm:grid-cols-2">
              <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Student</p><p className="mt-1 font-semibold text-foreground">{studentName(selectedReceipt.student)}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Admission number</p><p className="mt-1 font-semibold text-foreground">{selectedReceipt.student?.admissionNumber || "—"}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Invoice</p><p className="mt-1 font-semibold text-foreground">{selectedReceipt.bill?.billNumber || "Unallocated payment"}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Payment method</p><p className="mt-1 font-semibold text-foreground">{selectedReceipt.paymentMethod.replaceAll("_", " ")}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Transaction reference</p><p className="mt-1 font-semibold text-foreground">{selectedReceipt.referenceNumber || "—"}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Recorded by</p><p className="mt-1 font-semibold text-foreground">{selectedReceipt.recordedBy?.name || selectedReceipt.recordedBy?.email || "School accounts"}</p></div>
            </div>
            {selectedReceipt.status !== "COMPLETED" && <p className="border-t border-border pt-3 text-xs leading-5 text-muted-foreground">This transaction is marked {selectedReceipt.status.replaceAll("_", " ")}. It should not be treated as a completed receipt until its status is confirmed.</p>}
            <div className="border-t border-border pt-4"><p className="text-xs text-muted-foreground">This document reflects the saved SchoolHub payment record. It does not independently verify a bank or mobile-money transaction.</p><div className="mt-8 grid grid-cols-2 gap-8 text-xs text-muted-foreground"><div className="border-t border-border pt-2">Received by</div><div className="border-t border-border pt-2">Authorised by</div></div></div>
          </section>
          <div className="payment-receipt-actions mt-4 flex flex-wrap justify-end gap-2">
            <TableExportMenu build={() => ({ title: "Receipt " + selectedReceipt.paymentNumber, headers: ["Field","Value"], rows: [["Receipt",selectedReceipt.paymentNumber],["Student",studentName(selectedReceipt.student)],["Admission number",selectedReceipt.student?.admissionNumber ?? ""],["Invoice",selectedReceipt.bill?.billNumber ?? ""],["Date",dateLabel(selectedReceipt.paymentDate)],["Payment method",selectedReceipt.paymentMethod],["Reference",selectedReceipt.referenceNumber ?? ""],["Amount (GHS)",Number(selectedReceipt.amount)],["Status",selectedReceipt.status]], reportInfo: { school: schoolQuery.data?.name, period: dateLabel(selectedReceipt.paymentDate) } })} />
            <button type="button" className={buttonPrimary} onClick={() => window.print()}><Printer className="size-4" /> Print / Save PDF</button>
          </div>
        </Modal>
      )}

      {showPaymentForm && (
        <AccountantRecordPaymentDialog
          bills={bills}
          classes={classes}
          initialBillId={selectedBillId}
          isSubmitting={recordPayment.isPending}
          errorMessage={message?.kind === "error" ? message.text : undefined}
          onClose={() => {
            setShowPaymentForm(false);
            setSelectedBillId("");
          }}
          onSubmit={(input) => {
            setMessage(null);
            recordPayment.mutate(input);
          }}
        />
      )}

        {reverseTarget && (
          <Modal
            title={`Reverse receipt ${reverseTarget.paymentNumber}`}
            description="The receipt is kept on record as reversed. The amount is taken back off the bill and the ledger is corrected."
            onClose={() => setReverseTarget(null)}
          >
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                reversePayment.mutate({ id: reverseTarget.id, kind: reverseKind, reason: reverseReason.trim() });
              }}
            >
              <Field label="Reason for reversal">
                <select className={inputClass} value={reverseKind} onChange={(event) => setReverseKind(event.target.value as "VOID" | "REFUND")}>
                  <option value="VOID">Recorded in error (void)</option>
                  <option value="REFUND">Money returned to the payer (refund)</option>
                </select>
              </Field>
              <Field label="Explain what happened (kept in the audit trail)">
                <textarea className={inputClass} rows={3} minLength={10} maxLength={500} required value={reverseReason} onChange={(event) => setReverseReason(event.target.value)} />
              </Field>
              <ModalActions onCancel={() => setReverseTarget(null)} busy={reversePayment.isPending} submitLabel="Reverse payment" />
            </form>
          </Modal>
        )}

      {showBillForm && (
        <Modal title="Generate student bills" description="Generate bills for every active student enrolled in one class for the current academic term." onClose={() => { setShowBillForm(false); setSelectedFeeStructureId(""); setSelectedClassId(""); }}>
          <form onSubmit={submitBill} className="space-y-4">
            {message?.kind === "error" && <QueryError message={message.text} />}
            {yearsQuery.error && <QueryError message={yearsQuery.error.message} />}
            {feeStructuresQuery.error && <QueryError message={feeStructuresQuery.error.message} />}
            {classesQuery.error && <QueryError message={classesQuery.error.message} />}
            {!currentYear || !currentTerm ? <div role="alert" className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm text-foreground">A current academic year and term must be selected in School Settings before billing.</div> : <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">Billing period: <span className="font-semibold text-foreground">{currentYear.name} · {currentTerm.name}</span></p>}
            <Field label="Fee structure">
              <select name="feeStructureId" required className={inputClass} value={selectedFeeStructureId} onChange={(event) => { setSelectedFeeStructureId(event.target.value); setSelectedClassId(""); }}>
                <option value="" disabled>Select a fee structure…</option>
                {feeStructures.map((fee) => <option key={fee.id} value={fee.id}>{fee.name} · {currency(fee.items.reduce((sum, item) => sum + Number(item.amount), 0))}</option>)}
              </select>
            </Field>
            <Field label="Class">
              <select name="classId" required className={inputClass} value={selectedClassId} onChange={(event) => setSelectedClassId(event.target.value)}>
                <option value="" disabled>Select a class…</option>
                {billTargetClasses.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}{typeof schoolClass._count?.students === "number" ? ` · ${schoolClass._count.students} students` : ""}</option>)}
              </select>
            </Field>
            <Field label="Due date (optional)"><input name="dueDate" type="date" className={inputClass} /></Field>
            <Field label="Notes (optional)"><textarea name="notes" className={cn(inputClass, "h-20 py-2")} placeholder="Optional note shown on generated bills" /></Field>
            <p className="text-xs leading-5 text-muted-foreground">The operation is performed by the server using the selected class roster and current term. Review the count and total in the confirmation message after generation.</p>
            <ModalActions onCancel={() => { setShowBillForm(false); setSelectedFeeStructureId(""); setSelectedClassId(""); }} busy={generateBills.isPending} submitLabel="Generate bills" />
          </form>
        </Modal>
      )}

      {selectedPayroll && (
        <Modal
          title={`Payslips · ${new Date(selectedPayroll.year, selectedPayroll.month - 1, 1).toLocaleDateString("en-GH", { month: "long", year: "numeric" })}`}
          description="Review the saved salary components and payment status for this payroll run."
          onClose={() => setSelectedPayrollId("")}
        >
          {selectedPayroll.payslips.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="p-3">Staff reference</th><th className="p-3 text-right">Basic</th><th className="p-3 text-right">Allowances</th><th className="p-3 text-right">Gross</th><th className="p-3 text-right">Net</th><th className="p-3">Payment</th></tr></thead>
                <tbody>{selectedPayroll.payslips.map((slip) => <tr key={slip.id} className="border-b border-border/70 last:border-0"><td className="p-3">{slip.staffId ? `Staff · ${slip.staffId}` : slip.teacherId ? `Teacher · ${slip.teacherId}` : "Staff not linked"}</td><td className="p-3 text-right tabular-nums">{currency(slip.basicSalary)}</td><td className="p-3 text-right tabular-nums">{currency(slip.allowances)}</td><td className="p-3 text-right tabular-nums">{currency(slip.grossSalary)}</td><td className="p-3 text-right font-semibold tabular-nums">{currency(slip.netSalary)}</td><td className="p-3"><StatusBadge value={slip.paymentStatus} /></td></tr>)}</tbody>
              </table>
            </div>
          ) : <EmptyState icon={Wallet} title="No payslips in this run" description="This payroll record does not contain saved payslips." />}
          <div className="mt-5 flex justify-end"><button type="button" className={buttonSecondary} onClick={() => setSelectedPayrollId("")}>Close</button></div>
        </Modal>
      )}

      {showInventoryForm && (
        <Modal title="Add inventory item" description="Create a stock item with a minimum quantity threshold and optional opening stock." onClose={() => setShowInventoryForm(false)}>
          <form onSubmit={submitInventoryItem} className="space-y-4">
            {message?.kind === "error" && <QueryError message={message.text} />}
            <Field label="Item name"><input name="name" required minLength={2} maxLength={150} className={inputClass} placeholder="e.g. Exercise books, lab glassware" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category"><input name="category" className={inputClass} placeholder="Books, stationery, equipment…" /></Field>
              <Field label="Unit"><input name="unit" required defaultValue="pcs" className={inputClass} placeholder="pcs, boxes, litres…" /></Field>
              <Field label="Opening quantity"><input name="initialQuantity" type="number" min="0" step="1" required defaultValue="0" className={inputClass} /></Field>
              <Field label="Minimum quantity"><input name="minQuantity" type="number" min="0" step="1" required defaultValue="0" className={inputClass} /></Field>
            </div>
            <Field label="Description (optional)"><textarea name="description" maxLength={500} className={cn(inputClass, "h-20 py-2")} placeholder="Storage location or item details" /></Field>
            <ModalActions onCancel={() => setShowInventoryForm(false)} busy={createInventoryItem.isPending} submitLabel="Create item" />
          </form>
        </Modal>
      )}

      {stockItemId && (
        <Modal title="Record stock movement" description={`Update quantities for ${inventoryItems.find((item) => item.id === stockItemId)?.name ?? "this item"}. Stock cannot go below zero.`} onClose={() => setStockItemId("")}>
          <form onSubmit={submitStockMovement} className="space-y-4">
            {message?.kind === "error" && <QueryError message={message.text} />}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Movement type"><select name="type" required className={inputClass} defaultValue="IN"><option value="IN">Stock in — received</option><option value="OUT">Stock out — issued</option></select></Field>
              <Field label="Quantity"><input name="quantity" type="number" required min="1" step="1" className={inputClass} /></Field>
              <Field label="Movement date"><input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={inputClass} /></Field>
              <Field label="Recipient (optional)"><input name="recipientName" maxLength={150} className={inputClass} placeholder="Staff member / department" /></Field>
            </div>
            <Field label="Description (optional)"><textarea name="description" maxLength={500} className={cn(inputClass, "h-20 py-2")} placeholder="Reason or reference" /></Field>
            <ModalActions onCancel={() => setStockItemId("")} busy={recordStockMovement.isPending} submitLabel="Save movement" />
          </form>
        </Modal>
      )}

      {showExpenseForm && (
        <Modal title="Record an expense" description="Save a school expense to the database. Enter the actual payment and reference details." onClose={() => setShowExpenseForm(false)}>
          <form onSubmit={submitExpense} className="space-y-4">
            {message?.kind === "error" && <QueryError message={message.text} />}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Date"><input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={inputClass} /></Field>
              <Field label="Amount (GHS)"><input name="amount" type="number" required min="0.01" step="0.01" className={inputClass} placeholder="0.00" /></Field>
              <Field label="Payee (optional)"><input name="payee" className={inputClass} placeholder="Supplier or recipient" /></Field>
              <Field label="Category"><select name="category" required className={inputClass} defaultValue="OTHER">{["UTILITIES", "SUPPLIES", "MAINTENANCE", "TRANSPORT", "RENT", "INSURANCE", "TAXES", "SALARY", "OTHER"].map((category) => <option key={category} value={category}>{category.replaceAll("_", " ")}</option>)}</select></Field>
              <Field label="Payment method"><select name="paymentMethod" required className={inputClass} defaultValue="BANK_TRANSFER">{["BANK_TRANSFER", "CASH", "CHEQUE", "MOBILE_MONEY", "CARD", "ONLINE", "OTHER"].map((method) => <option key={method} value={method}>{method.replaceAll("_", " ")}</option>)}</select></Field>
              <Field label="Reference number (optional)"><input name="referenceNumber" className={inputClass} placeholder="Voucher / transaction reference" /></Field>
            </div>
            <Field label="Description"><textarea name="description" required minLength={3} className={cn(inputClass, "h-20 py-2")} placeholder="What was purchased or paid for?" /></Field>
            <ModalActions onCancel={() => setShowExpenseForm(false)} busy={createExpense.isPending} submitLabel="Save expense" />
          </form>
        </Modal>
      )}
    </div>
  );
}

function DashboardMetricLink({ to, label, value, detail, icon: Icon }: { to: string; label: string; value: string; detail: string; icon: typeof Wallet }) {
  return <Link to="/$page" params={{ page: to }} className="group rounded-2xl border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{label}</p><span className="rounded-xl bg-muted p-2 transition group-hover:bg-primary/10"><Icon className="size-4 text-foreground" /></span></div>
    <p className="mt-3 break-words text-xl font-bold tracking-tight text-foreground sm:text-2xl">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">View records <span aria-hidden="true">→</span></span>
  </Link>;
}

function MetricCard({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Wallet }) {
  return <div className="rounded-2xl border border-border bg-card p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{label}</p><span className="rounded-xl bg-muted p-2"><Icon className="size-4 text-foreground" /></span></div><p className="mt-3 text-2xl font-bold tracking-tight text-foreground">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
}

function SectionHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-foreground">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>{action}</div>;
}

function SearchFilters({ search, setSearch, statusFilter, setStatusFilter, statuses }: { search: string; setSearch: (value: string) => void; statusFilter: string; setStatusFilter: (value: string) => void; statuses: string[] }) {
  return <div className="my-4 flex flex-wrap gap-3"><div className="relative min-w-56 flex-1"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><input className={cn(inputClass, "pl-9")} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search bill, student, or class" /></div><select className={cn(inputClass, "w-auto min-w-40")} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></div>;
}

function BillsTable({ bills, onRecordPayment, onViewInvoice }: { bills: ApiBill[]; onRecordPayment?: (bill: ApiBill) => void; onViewInvoice: (bill: ApiBill) => void }) {
  if (!bills.length) return <EmptyState icon={FileText} title="No matching bills" description="Bills appear here after they are generated for an active class and term." />;
  return <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="p-3">Bill</th><th className="p-3">Student / class</th><th className="p-3">Due date</th><th className="p-3 text-right">Amount</th><th className="p-3 text-right">Paid</th><th className="p-3 text-right">Balance</th><th className="p-3">Status</th><th className="p-3"></th></tr></thead><tbody>{bills.map((bill) => <tr key={bill.id} className="border-b border-border/70 last:border-0 hover:bg-muted/40"><td className="p-3"><div className="font-semibold text-foreground">{bill.billNumber}</div><div className="text-xs text-muted-foreground">{bill.feeStructure?.name ?? "Fee bill"}</div></td><td className="p-3"><div className="font-medium text-foreground">{studentName(bill.student)}</div><div className="text-xs text-muted-foreground">{bill.student?.admissionNumber} · {bill.class?.name ?? "Class not recorded"}</div></td><td className="p-3">{dateLabel(bill.dueDate)}</td><td className="p-3 text-right tabular-nums">{currency(bill.totalAmount)}</td><td className="p-3 text-right tabular-nums">{currency(bill.paidAmount)}</td><td className="p-3 text-right font-semibold tabular-nums">{currency(bill.balanceAmount)}</td><td className="p-3"><StatusBadge value={bill.status} /></td><td className="p-3 text-right"><div className="flex flex-col items-end gap-1"><button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => onViewInvoice(bill)}>View invoice</button>{onRecordPayment && Number(bill.balanceAmount) > 0 && <button type="button" className="text-xs font-semibold text-foreground hover:underline" onClick={() => onRecordPayment(bill)}>Record payment</button>}</div></td></tr>)}</tbody></table></div>;
}

function PaymentsTable({ payments, onViewReceipt, onReverse }: { payments: ApiPayment[]; onViewReceipt: (payment: ApiPayment) => void; onReverse?: (payment: ApiPayment) => void }) {
  if (!payments.length) return <EmptyState icon={Receipt} title="No payments recorded" description="When an accountant records a payment, the saved receipt will appear here." />;
  return <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="p-3">Receipt</th><th className="p-3">Student</th><th className="p-3">Date</th><th className="p-3">Method / reference</th><th className="p-3 text-right">Amount</th><th className="p-3">Status</th><th className="p-3"></th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id} className="border-b border-border/70 last:border-0 hover:bg-muted/40"><td className="p-3 font-semibold text-foreground">{payment.paymentNumber}</td><td className="p-3"><div className="font-medium">{studentName(payment.student)}</div><div className="text-xs text-muted-foreground">{payment.student?.admissionNumber}</div></td><td className="p-3">{dateLabel(payment.paymentDate)}</td><td className="p-3"><div>{payment.paymentMethod.replaceAll("_", " ")}</div><div className="text-xs text-muted-foreground">{payment.referenceNumber || "No reference"}</div></td><td className="p-3 text-right font-semibold tabular-nums">{currency(payment.amount)}</td><td className="p-3"><StatusBadge value={payment.status} /></td><td className="p-3 text-right"><button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => onViewReceipt(payment)}>View receipt</button>{onReverse && payment.status === "COMPLETED" && <button type="button" className="ml-3 text-xs font-semibold text-destructive hover:underline" onClick={() => onReverse(payment)}>Reverse</button>}</td></tr>)}</tbody></table></div>;
}

function ExpensesTable({ expenses }: { expenses: ApiExpense[] }) {
  if (!expenses.length) return <EmptyState icon={ArrowDownRight} title="No expenses recorded" description="Use Add expense to save an operating expense. No demonstration figures are shown." />;
  return <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="p-3">Date / voucher</th><th className="p-3">Payee / description</th><th className="p-3">Category</th><th className="p-3">Method</th><th className="p-3 text-right">Amount</th></tr></thead><tbody>{expenses.map((expense) => <tr key={expense.id} className="border-b border-border/70 last:border-0"><td className="p-3"><div>{dateLabel(expense.date)}</div><div className="text-xs text-muted-foreground">{expense.voucherNumber ?? expense.referenceNumber ?? "—"}</div></td><td className="p-3"><div className="font-medium">{expense.payee || "Payee not specified"}</div><div className="max-w-sm text-xs text-muted-foreground">{expense.description}</div></td><td className="p-3">{(expense.customCategory?.name ?? expense.registryCategory?.name ?? expense.category ?? "OTHER").replaceAll("_", " ")}</td><td className="p-3">{expense.paymentMethod.replaceAll("_", " ")}</td><td className="p-3 text-right font-semibold tabular-nums">{currency(expense.amount)}</td></tr>)}</tbody></table></div>;
}

function StatusBadge({ value }: { value: string }) {
  const normalized = value.replaceAll("_", " ").toUpperCase();
  const positive = ["PAID", "COMPLETED", "APPROVED", "DISBURSED", "IN STOCK"].includes(normalized);
  const negative = ["OVERDUE", "FAILED", "CANCELLED", "REJECTED", "LOW STOCK"].includes(normalized);
  return <span className={cn("inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold", positive ? "bg-success/10 text-success" : negative ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>{normalized}</span>;
}

function AttentionItem({ title, value, detail, to }: { title: string; value: string; detail: string; to: string }) {
  return <Link to="/$page" params={{ page: to }} className="flex w-full items-center justify-between gap-3 rounded-xl border border-border p-3 text-left transition hover:bg-muted/50"><span><span className="block text-sm font-medium text-foreground">{title}</span><span className="mt-1 block text-xs text-muted-foreground">{detail}</span></span><span className="text-lg font-bold tabular-nums text-foreground">{value}</span></Link>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1.5 text-sm font-medium text-foreground">{label}{children}</label>;
}

function Modal({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-labelledby="accountant-modal-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl sm:p-6"><div className="mb-5 flex items-start justify-between gap-4"><div><h2 id="accountant-modal-title" className="text-lg font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div><button type="button" onClick={onClose} aria-label="Close dialog" className="rounded-lg px-2 py-1 text-muted-foreground hover:bg-muted">✕</button></div>{children}</section></div>;
}

function ModalActions({ onCancel, busy, submitLabel }: { onCancel: () => void; busy: boolean; submitLabel: string }) {
  return <div className="flex justify-end gap-2 border-t border-border pt-4"><button type="button" className={buttonSecondary} onClick={onCancel} disabled={busy}>Cancel</button><button type="submit" className={buttonPrimary} disabled={busy}>{busy && <LoaderCircle className="size-4 animate-spin" />}{submitLabel}</button></div>;
}

function EmptyState({ icon: Icon, title, description }: { icon: typeof Wallet; title: string; description: string }) {
  return <div className="flex min-h-52 flex-col items-center justify-center px-5 py-10 text-center"><span className="rounded-2xl bg-muted p-3"><Icon className="size-6 text-muted-foreground" /></span><h3 className="mt-4 font-semibold text-foreground">{title}</h3><p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{description}</p></div>;
}

function QueryError({ message }: { message: string }) {
  return <div role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{message}</div>;
}
