import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  LoaderCircle,
  Megaphone,
  Package,
  Plus,
  Receipt,
  Search,
  Wallet,
} from "lucide-react";
import {
  createExpenseSchema,
  generateBillSchema,
  recordPaymentSchema,
  createInventoryItemSchema,
  inventoryStockMovementSchema,
  type CreateInventoryItemInput,
  type InventoryStockMovementInput,
  type CreateExpenseInput,
  type GenerateBillInput,
  type RecordPaymentInput,
} from "@schoolhub/shared";
import { AdminAnnouncementsWorkspace } from "./admin-announcements-workspace";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

type AccountantTab =
  | "overview"
  | "invoices"
  | "payments"
  | "debtors"
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
  paidAmount: number | string;
  balanceAmount: number | string;
  status: "PAID" | "PARTIALLY_PAID" | "PENDING" | "OVERDUE" | "WAIVED" | "CANCELLED";
  dueDate?: string | null;
  issuedAt: string;
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

const tabs: { id: AccountantTab; label: string; icon: typeof Wallet }[] = [
  { id: "overview", label: "Overview", icon: CircleDollarSign },
  { id: "invoices", label: "Invoices & bills", icon: FileText },
  { id: "payments", label: "Payments & receipts", icon: Receipt },
  { id: "debtors", label: "Outstanding fees", icon: AlertCircle },
  { id: "payroll", label: "Payroll", icon: Wallet },
  { id: "expenses", label: "Expenses", icon: ArrowDownRight },
  { id: "inventory", label: "Inventory", icon: Package },
  { id: "announcements", label: "Announcements", icon: Megaphone },
];

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
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<AccountantTab>(defaultTab);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [selectedBillId, setSelectedBillId] = useState("");
  const [selectedFeeStructureId, setSelectedFeeStructureId] = useState("");
  const [showBillForm, setShowBillForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showInventoryForm, setShowInventoryForm] = useState(false);
  const [stockItemId, setStockItemId] = useState("");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

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
    retry: false,
  });
  const payrollQuery = useQuery({
    queryKey: ["finance", "payroll"],
    queryFn: () => apiFetch<ApiPayroll[]>("/finance/payroll"),
    retry: false,
  });

  useEffect(() => setActiveTab(defaultTab), [defaultTab]);

  const bills = billsQuery.data ?? [];
  const payments = paymentsQuery.data ?? [];
  const expenses = expensesQuery.data ?? [];
  const feeStructures = feeStructuresQuery.data ?? [];
  const classes = (classesQuery.data ?? []).filter((schoolClass) => schoolClass.isActive);
  const payroll = payrollQuery.data ?? [];
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

  const filteredPayments = useMemo(() => payments.filter((payment) => {
    const term = search.trim().toLowerCase();
    return !term ||
      payment.paymentNumber.toLowerCase().includes(term) ||
      studentName(payment.student).toLowerCase().includes(term) ||
      (payment.referenceNumber ?? "").toLowerCase().includes(term);
  }), [payments, search]);

  const debtors = bills.filter((bill) => Number(bill.balanceAmount) > 0 && bill.status !== "CANCELLED" && bill.status !== "WAIVED");
  const collected = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const outstanding = debtors.reduce((sum, bill) => sum + Number(bill.balanceAmount), 0);
  const expenseTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const payrollNet = payroll.reduce((sum, run) => sum + Number(run.totalNet), 0);
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
        body: JSON.stringify(input),
      }),
    onSuccess: async (payment) => {
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
      await queryClient.invalidateQueries({ queryKey: ["finance", "bills"] });
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

  function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const selectedBill = bills.find((bill) => bill.id === String(form.get("billId") ?? ""));
    const result = recordPaymentSchema.safeParse({
      studentId: selectedBill?.studentId,
      billId: selectedBill?.id,
      amount: Number(form.get("amount")),
      paymentMethod: form.get("paymentMethod"),
      paymentDate: form.get("paymentDate"),
      referenceNumber: String(form.get("referenceNumber") ?? "").trim() || undefined,
      notes: String(form.get("notes") ?? "").trim() || undefined,
    });
    if (!result.success) {
      setMessage({ kind: "error", text: result.error.issues[0]?.message ?? "Check the payment details." });
      return;
    }
    setMessage(null);
    recordPayment.mutate(result.data);
  }

  function submitBill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = generateBillSchema.safeParse({
      academicYearId: currentYear?.id,
      termId: currentTerm?.id,
      feeStructureId: form.get("feeStructureId"),
      classId: form.get("classId"),
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
    feeStructuresQuery.isPending || classesQuery.isPending || yearsQuery.isPending || (activeTab === "inventory" && inventoryQuery.isPending);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-800 via-teal-800 to-slate-950 p-6 text-white shadow-lg sm:p-8">
        <div className="pointer-events-none absolute -right-12 -top-20 size-64 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold">
              <CircleDollarSign className="size-4" />
              Finance & bursary
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Accountant workspace</h1>
            <p className="text-sm leading-6 text-emerald-50/90">
              Manage fee billing, record collections, track debtors, review expenses, and monitor payroll records.
              Figures on this page are calculated from the school’s saved finance records.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={buttonPrimary} onClick={() => { setMessage(null); setShowPaymentForm(true); }}>
              <Plus className="size-4" /> Record payment
            </button>
            <button className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20" onClick={() => { setMessage(null); setShowBillForm(true); }}>
              <Receipt className="size-4" /> Generate bills
            </button>
            <button className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20" onClick={() => { setMessage(null); setShowExpenseForm(true); }}>
              <Plus className="size-4" /> Add expense
            </button>
          </div>
        </div>
      </section>

      {message && (
        <div role={message.kind === "error" ? "alert" : "status"} className={cn(
          "flex items-start gap-3 rounded-2xl border p-4 text-sm",
          message.kind === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-success/30 bg-success/5 text-foreground",
        )}>
          {message.kind === "error" ? <AlertCircle className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}
          <p className="min-w-0 flex-1">{message.text}</p>
          <button className="text-xs font-semibold underline" onClick={() => setMessage(null)}>Dismiss</button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Payments collected" value={currency(collected)} detail={`${payments.length} recorded receipts`} icon={ArrowUpRight} />
        <MetricCard label="Outstanding fees" value={currency(outstanding)} detail={`${debtors.length} bills with balances`} icon={AlertCircle} />
        <MetricCard label="Recorded expenses" value={currency(expenseTotal)} detail={`${expenses.length} expense entries`} icon={ArrowDownRight} />
        <MetricCard label="Payroll net total" value={currency(payrollNet)} detail={`${payroll.length} saved payroll run(s)`} icon={Wallet} />
      </div>

      <nav aria-label="Accountant sections" className="flex gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-1.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} aria-current={activeTab === tab.id ? "page" : undefined}
              className={cn("inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                activeTab === tab.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
              <Icon className="size-4" /> {tab.label}
            </button>
          );
        })}
      </nav>

      {loading && activeTab !== "announcements" && activeTab !== "inventory" && (
        <div role="status" className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-12 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" /> Loading live finance records…
        </div>
      )}

      {!loading && activeTab === "overview" && (
        <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-foreground">Recent payments</h2>
                <p className="mt-1 text-sm text-muted-foreground">Latest receipts recorded for this school</p>
              </div>
              <button className={buttonSecondary} onClick={() => setActiveTab("payments")}>View payments</button>
            </div>
            <PaymentsTable payments={payments.slice(0, 6)} />
          </section>
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-semibold text-foreground">Attention required</h2>
            <p className="mt-1 text-sm text-muted-foreground">Items that may need follow-up</p>
            <div className="mt-4 space-y-3">
              <AttentionItem title="Outstanding bills" value={String(debtors.length)} detail={currency(outstanding)} onClick={() => setActiveTab("debtors")} />
              <AttentionItem title="Overdue bills" value={String(debtors.filter((bill) => bill.status === "OVERDUE").length)} detail="Review due dates and follow up" onClick={() => { setStatusFilter("OVERDUE"); setActiveTab("invoices"); }} />
              <AttentionItem title="Expense records" value={String(expenses.length)} detail={currency(expenseTotal)} onClick={() => setActiveTab("expenses")} />
            </div>
          </section>
        </div>
      )}

      {!loading && activeTab === "invoices" && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <SectionHeader title="Invoices & bills" description="Search bills, review balances, and generate billing for an active class." action={<button className={buttonPrimary} onClick={() => setShowBillForm(true)}><Plus className="size-4" /> Generate bills</button>} />
          <SearchFilters search={search} setSearch={setSearch} statusFilter={statusFilter} setStatusFilter={setStatusFilter} statuses={["PENDING", "PARTIALLY_PAID", "PAID", "OVERDUE"]} />
          <BillsTable bills={filteredBills} onRecordPayment={(bill) => { setSelectedBillId(bill.id); setShowPaymentForm(true); }} />
        </section>
      )}

      {!loading && activeTab === "payments" && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <SectionHeader title="Payments & receipts" description="Saved payment transactions from the school finance ledger." action={<button className={buttonPrimary} onClick={() => setShowPaymentForm(true)}><Plus className="size-4" /> Record payment</button>} />
          <div className="relative my-4 max-w-md"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><input className={cn(inputClass, "pl-9")} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search receipt, student, or reference" /></div>
          <PaymentsTable payments={filteredPayments} />
        </section>
      )}

      {!loading && activeTab === "debtors" && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <SectionHeader title="Outstanding fees" description="Bills with a positive balance, calculated from saved billing records." />
          <BillsTable bills={debtors.filter((bill) => {
            const term = search.trim().toLowerCase();
            return !term || bill.billNumber.toLowerCase().includes(term) || studentName(bill.student).toLowerCase().includes(term) || (bill.class?.name ?? "").toLowerCase().includes(term);
          })} onRecordPayment={(bill) => { setSelectedBillId(bill.id); setShowPaymentForm(true); }} />
        </section>
      )}

      {!loading && activeTab === "expenses" && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <SectionHeader title="Operating expenses" description="Expense entries saved to the school database." action={<button className={buttonPrimary} onClick={() => setShowExpenseForm(true)}><Plus className="size-4" /> Add expense</button>} />
          <ExpensesTable expenses={expenses} />
        </section>
      )}

      {!payrollQuery.isPending && activeTab === "payroll" && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <SectionHeader title="Payroll records" description="Saved payroll runs and totals. This workspace does not fabricate salary data." />
          {payrollQuery.error ? <QueryError message={payrollQuery.error.message} /> : payroll.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="p-3">Payroll period</th><th className="p-3">Status</th><th className="p-3 text-right">Gross</th><th className="p-3 text-right">Tax</th><th className="p-3 text-right">Net</th><th className="p-3 text-right">Payslips</th></tr></thead>
                <tbody>{payroll.map((run) => <tr key={run.id} className="border-b border-border/70 last:border-0"><td className="p-3 font-medium">{new Date(run.year, run.month - 1, 1).toLocaleDateString("en-GH", { month: "long", year: "numeric" })}</td><td className="p-3"><StatusBadge value={run.status} /></td><td className="p-3 text-right tabular-nums">{currency(run.totalGross)}</td><td className="p-3 text-right tabular-nums">{currency(run.totalTax)}</td><td className="p-3 text-right tabular-nums">{currency(run.totalNet)}</td><td className="p-3 text-right">{run.payslips.length}</td></tr>)}</tbody>
              </table>
            </div>
          ) : <EmptyState icon={Wallet} title="No payroll runs yet" description="Payroll becomes available here when an authorised payroll process creates a saved payroll run." />}
        </section>
      )}

      {activeTab === "inventory" && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <SectionHeader
            title="Supplies & inventory"
            description="Track stock quantities, minimum levels, and auditable stock-in / stock-out movements."
            action={<button className={buttonPrimary} onClick={() => setShowInventoryForm(true)}><Plus className="size-4" /> Add item</button>}
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
                    <td className="p-3 text-right"><button className="text-xs font-semibold text-primary hover:underline" onClick={() => setStockItemId(item.id)}>Record movement</button></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          ) : <EmptyState icon={Package} title="No inventory items yet" description="Create an item and record its opening quantity. Every subsequent stock-in or stock-out is stored as a dated movement." />}
        </section>
      )}

      {activeTab === "announcements" && <AdminAnnouncementsWorkspace mode="accountant" />}

      {showPaymentForm && (
        <Modal title="Record a payment" description="Record a receipt against an outstanding bill. The server validates the bill and updates its balance." onClose={() => setShowPaymentForm(false)}>
          <form onSubmit={submitPayment} className="space-y-4">
            <Field label="Outstanding bill">
              <select name="billId" required className={inputClass} value={selectedBillId} onChange={(event) => setSelectedBillId(event.target.value)}>
                <option value="" disabled>Select a bill…</option>
                {bills.filter((bill) => Number(bill.balanceAmount) > 0 && bill.status !== "CANCELLED" && bill.status !== "WAIVED").map((bill) => (
                  <option key={bill.id} value={bill.id}>{bill.billNumber} — {studentName(bill.student)} · Balance {currency(bill.balanceAmount)}</option>
                ))}
              </select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Amount (GHS)"><input name="amount" type="number" required min="0.01" step="0.01" className={inputClass} placeholder="0.00" /></Field>
              <Field label="Payment date"><input name="paymentDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={inputClass} /></Field>
              <Field label="Payment method"><select name="paymentMethod" className={inputClass} defaultValue="CASH">{["CASH", "BANK_TRANSFER", "CHEQUE", "MOBILE_MONEY", "CARD", "ONLINE", "OTHER"].map((method) => <option key={method} value={method}>{method.replaceAll("_", " ")}</option>)}</select></Field>
              <Field label="Reference number (optional)"><input name="referenceNumber" className={inputClass} placeholder="Bank / MoMo transaction ID" /></Field>
            </div>
            <Field label="Notes (optional)"><textarea name="notes" className={cn(inputClass, "h-20 py-2")} placeholder="Additional payment notes" /></Field>
            <ModalActions onCancel={() => setShowPaymentForm(false)} busy={recordPayment.isPending} submitLabel="Save payment" />
          </form>
        </Modal>
      )}

      {showBillForm && (
        <Modal title="Generate student bills" description="Generate bills for every active student enrolled in one class for the current academic term." onClose={() => setShowBillForm(false)}>
          <form onSubmit={submitBill} className="space-y-4">
            {!currentYear || !currentTerm ? <div role="alert" className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm text-foreground">A current academic year and term must be selected in School Settings before billing.</div> : <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">Billing period: <span className="font-semibold text-foreground">{currentYear.name} · {currentTerm.name}</span></p>}
            <Field label="Fee structure">
              <select name="feeStructureId" required className={inputClass} value={selectedFeeStructureId} onChange={(event) => setSelectedFeeStructureId(event.target.value)}>
                <option value="" disabled>Select a fee structure…</option>
                {feeStructures.map((fee) => <option key={fee.id} value={fee.id}>{fee.name} · {currency(fee.items.reduce((sum, item) => sum + Number(item.amount), 0))}</option>)}
              </select>
            </Field>
            <Field label="Class">
              <select name="classId" required className={inputClass} defaultValue="">
                <option value="" disabled>Select a class…</option>
                {billTargetClasses.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}{typeof schoolClass._count?.students === "number" ? ` · ${schoolClass._count.students} students` : ""}</option>)}
              </select>
            </Field>
            <Field label="Due date (optional)"><input name="dueDate" type="date" className={inputClass} /></Field>
            <Field label="Notes (optional)"><textarea name="notes" className={cn(inputClass, "h-20 py-2")} placeholder="Optional note shown on generated bills" /></Field>
            <p className="text-xs leading-5 text-muted-foreground">The operation is performed by the server using the selected class roster and current term. Review the count and total in the confirmation message after generation.</p>
            <ModalActions onCancel={() => setShowBillForm(false)} busy={generateBills.isPending} submitLabel="Generate bills" />
          </form>
        </Modal>
      )}

      {showInventoryForm && (
        <Modal title="Add inventory item" description="Create a stock item with a minimum quantity threshold and optional opening stock." onClose={() => setShowInventoryForm(false)}>
          <form onSubmit={submitInventoryItem} className="space-y-4">
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

function MetricCard({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Wallet }) {
  return <div className="rounded-2xl border border-border bg-card p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{label}</p><span className="rounded-xl bg-muted p-2"><Icon className="size-4 text-foreground" /></span></div><p className="mt-3 text-2xl font-bold tracking-tight text-foreground">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
}

function SectionHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-foreground">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>{action}</div>;
}

function SearchFilters({ search, setSearch, statusFilter, setStatusFilter, statuses }: { search: string; setSearch: (value: string) => void; statusFilter: string; setStatusFilter: (value: string) => void; statuses: string[] }) {
  return <div className="my-4 flex flex-wrap gap-3"><div className="relative min-w-56 flex-1"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><input className={cn(inputClass, "pl-9")} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search bill, student, or class" /></div><select className={cn(inputClass, "w-auto min-w-40")} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></div>;
}

function BillsTable({ bills, onRecordPayment }: { bills: ApiBill[]; onRecordPayment: (bill: ApiBill) => void }) {
  if (!bills.length) return <EmptyState icon={FileText} title="No matching bills" description="Bills appear here after they are generated for an active class and term." />;
  return <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="p-3">Bill</th><th className="p-3">Student / class</th><th className="p-3">Due date</th><th className="p-3 text-right">Amount</th><th className="p-3 text-right">Paid</th><th className="p-3 text-right">Balance</th><th className="p-3">Status</th><th className="p-3"></th></tr></thead><tbody>{bills.map((bill) => <tr key={bill.id} className="border-b border-border/70 last:border-0 hover:bg-muted/40"><td className="p-3"><div className="font-semibold text-foreground">{bill.billNumber}</div><div className="text-xs text-muted-foreground">{bill.feeStructure?.name ?? "Fee bill"}</div></td><td className="p-3"><div className="font-medium text-foreground">{studentName(bill.student)}</div><div className="text-xs text-muted-foreground">{bill.student?.admissionNumber} · {bill.class?.name ?? "Class not recorded"}</div></td><td className="p-3">{dateLabel(bill.dueDate)}</td><td className="p-3 text-right tabular-nums">{currency(bill.totalAmount)}</td><td className="p-3 text-right tabular-nums">{currency(bill.paidAmount)}</td><td className="p-3 text-right font-semibold tabular-nums">{currency(bill.balanceAmount)}</td><td className="p-3"><StatusBadge value={bill.status} /></td><td className="p-3 text-right">{Number(bill.balanceAmount) > 0 && <button className="text-xs font-semibold text-primary hover:underline" onClick={() => onRecordPayment(bill)}>Record payment</button>}</td></tr>)}</tbody></table></div>;
}

function PaymentsTable({ payments }: { payments: ApiPayment[] }) {
  if (!payments.length) return <EmptyState icon={Receipt} title="No payments recorded" description="When an accountant records a payment, the saved receipt will appear here." />;
  return <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="p-3">Receipt</th><th className="p-3">Student</th><th className="p-3">Date</th><th className="p-3">Method / reference</th><th className="p-3 text-right">Amount</th><th className="p-3">Status</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id} className="border-b border-border/70 last:border-0 hover:bg-muted/40"><td className="p-3 font-semibold text-foreground">{payment.paymentNumber}</td><td className="p-3"><div className="font-medium">{studentName(payment.student)}</div><div className="text-xs text-muted-foreground">{payment.student?.admissionNumber}</div></td><td className="p-3">{dateLabel(payment.paymentDate)}</td><td className="p-3"><div>{payment.paymentMethod.replaceAll("_", " ")}</div><div className="text-xs text-muted-foreground">{payment.referenceNumber || "No reference"}</div></td><td className="p-3 text-right font-semibold tabular-nums">{currency(payment.amount)}</td><td className="p-3"><StatusBadge value={payment.status} /></td></tr>)}</tbody></table></div>;
}

function ExpensesTable({ expenses }: { expenses: ApiExpense[] }) {
  if (!expenses.length) return <EmptyState icon={ArrowDownRight} title="No expenses recorded" description="Use Add expense to save an operating expense. No demonstration figures are shown." />;
  return <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="p-3">Date / voucher</th><th className="p-3">Payee / description</th><th className="p-3">Category</th><th className="p-3">Method</th><th className="p-3 text-right">Amount</th></tr></thead><tbody>{expenses.map((expense) => <tr key={expense.id} className="border-b border-border/70 last:border-0"><td className="p-3"><div>{dateLabel(expense.date)}</div><div className="text-xs text-muted-foreground">{expense.voucherNumber ?? expense.referenceNumber ?? "—"}</div></td><td className="p-3"><div className="font-medium">{expense.payee || "Payee not specified"}</div><div className="max-w-sm text-xs text-muted-foreground">{expense.description}</div></td><td className="p-3">{(expense.customCategory?.name ?? expense.registryCategory?.name ?? expense.category ?? "OTHER").replaceAll("_", " ")}</td><td className="p-3">{expense.paymentMethod.replaceAll("_", " ")}</td><td className="p-3 text-right font-semibold tabular-nums">{currency(expense.amount)}</td></tr>)}</tbody></table></div>;
}

function StatusBadge({ value }: { value: string }) {
  const normalized = value.replaceAll("_", " ").toUpperCase();
  const positive = ["PAID", "COMPLETED", "APPROVED", "DISBURSED"].includes(normalized);
  const negative = ["OVERDUE", "FAILED", "CANCELLED", "REJECTED"].includes(normalized);
  return <span className={cn("inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold", positive ? "bg-success/10 text-success" : negative ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>{normalized}</span>;
}

function AttentionItem({ title, value, detail, onClick }: { title: string; value: string; detail: string; onClick: () => void }) {
  return <button onClick={onClick} className="flex w-full items-center justify-between gap-3 rounded-xl border border-border p-3 text-left transition hover:bg-muted/50"><span><span className="block text-sm font-medium text-foreground">{title}</span><span className="mt-1 block text-xs text-muted-foreground">{detail}</span></span><span className="text-lg font-bold tabular-nums text-foreground">{value}</span></button>;
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
