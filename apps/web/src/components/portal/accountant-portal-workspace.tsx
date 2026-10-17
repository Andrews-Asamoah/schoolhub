import { useState } from "react";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  Banknote,
  Bell,
  Building,
  Check,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  DollarSign,
  Download,
  FileCheck,
  FileSpreadsheet,
  FileText,
  Filter,
  Layers,
  Package,
  PackageCheck,
  Plus,
  Printer,
  Receipt,
  Search,
  Send,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { PortalStatCard } from "./portal-stat-card";
import { PortalModal } from "./portal-modal";
import { cn } from "@/lib/utils";

interface AccountantPortalWorkspaceProps {
  defaultTab?: "overview" | "invoices" | "payments" | "debtors" | "payroll" | "expenses" | "inventory";
}

interface InvoiceRecord {
  id: string;
  billNumber: string;
  studentName: string;
  studentId: string;
  className: string;
  feeStructureName: string;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  status: "PAID" | "PARTIALLY_PAID" | "PENDING" | "OVERDUE";
  dueDate: string;
}

interface PaymentRecord {
  id: string;
  receiptNumber: string;
  studentName: string;
  studentId: string;
  className: string;
  amount: number;
  paymentMethod: "MOBILE_MONEY" | "BANK_TRANSFER" | "CASH" | "CHEQUE" | "CARD";
  referenceNumber: string;
  paymentDate: string;
  receivedBy: string;
}

interface ExpenseRecord {
  id: string;
  date: string;
  voucherNumber: string;
  payee: string;
  category: "Utilities" | "Laboratory" | "Transport" | "Maintenance" | "Stationery" | "Catering";
  description: string;
  amount: number;
  paymentMethod: string;
  status: "APPROVED" | "PENDING" | "PAID";
}

interface StaffSalaryRecord {
  id: string;
  staffName: string;
  role: string;
  department: string;
  basicSalary: number;
  allowances: number;
  taxDeductions: number;
  netPay: number;
  status: "DISBURSED" | "PENDING" | "PROCESSING";
}

interface InventoryRecord {
  id: string;
  code: string;
  name: string;
  category: "Books" | "Uniforms" | "Lab Chemicals" | "IT Equipment" | "Sports";
  stockQty: number;
  minThreshold: number;
  unitCost: number;
  location: string;
}

const mockInvoices: InvoiceRecord[] = [
  { id: "inv-1", billNumber: "INV-2026-089", studentName: "Kwame Asante", studentId: "STU-2024-001", className: "Basic 9 Emerald", feeStructureName: "JHS 3 Term 1 Standard", totalAmount: 1850, paidAmount: 1850, balanceAmount: 0, status: "PAID", dueDate: "2026-10-31" },
  { id: "inv-2", billNumber: "INV-2026-090", studentName: "Ama Boateng", studentId: "STU-2024-002", className: "Basic 9 Emerald", feeStructureName: "JHS 3 Term 1 Standard", totalAmount: 1850, paidAmount: 1200, balanceAmount: 650, status: "PARTIALLY_PAID", dueDate: "2026-10-31" },
  { id: "inv-3", billNumber: "INV-2026-091", studentName: "Emanuel Mensah", studentId: "STU-2024-003", className: "Form 2 Science", feeStructureName: "SHS 2 Science Composite", totalAmount: 2400, paidAmount: 0, balanceAmount: 2400, status: "OVERDUE", dueDate: "2026-09-30" },
  { id: "inv-4", billNumber: "INV-2026-092", studentName: "Akua Osei", studentId: "STU-2024-004", className: "Form 2 Science", feeStructureName: "SHS 2 Science Composite", totalAmount: 2400, paidAmount: 2400, balanceAmount: 0, status: "PAID", dueDate: "2026-10-31" },
  { id: "inv-5", billNumber: "INV-2026-093", studentName: "Kofi Appiah", studentId: "STU-2024-005", className: "Basic 8 Gold", feeStructureName: "JHS 2 Term 1 Standard", totalAmount: 1650, paidAmount: 500, balanceAmount: 1150, status: "PARTIALLY_PAID", dueDate: "2026-10-31" },
  { id: "inv-6", billNumber: "INV-2026-094", studentName: "Abena Danquah", studentId: "STU-2024-006", className: "Basic 8 Gold", feeStructureName: "JHS 2 Term 1 Standard", totalAmount: 1650, paidAmount: 0, balanceAmount: 1650, status: "PENDING", dueDate: "2026-11-15" },
];

const mockPayments: PaymentRecord[] = [
  { id: "pay-1", receiptNumber: "REC-2026-104", studentName: "Kwame Asante", studentId: "STU-2024-001", className: "Basic 9 Emerald", amount: 1850, paymentMethod: "MOBILE_MONEY", referenceNumber: "MTN-894729103", paymentDate: "2026-10-15", receivedBy: "Accounts Office" },
  { id: "pay-2", receiptNumber: "REC-2026-105", studentName: "Ama Boateng", studentId: "STU-2024-002", className: "Basic 9 Emerald", amount: 1200, paymentMethod: "BANK_TRANSFER", referenceNumber: "GCB-0029341", paymentDate: "2026-10-14", receivedBy: "Accounts Office" },
  { id: "pay-3", receiptNumber: "REC-2026-106", studentName: "Akua Osei", studentId: "STU-2024-004", className: "Form 2 Science", amount: 2400, paymentMethod: "MOBILE_MONEY", referenceNumber: "TEL-99823102", paymentDate: "2026-10-12", receivedBy: "Accounts Office" },
  { id: "pay-4", receiptNumber: "REC-2026-107", studentName: "Kofi Appiah", studentId: "STU-2024-005", className: "Basic 8 Gold", amount: 500, paymentMethod: "CASH", referenceNumber: "CASH-REC-008", paymentDate: "2026-10-10", receivedBy: "Accounts Office" },
];

const mockExpenses: ExpenseRecord[] = [
  { id: "exp-1", date: "2026-10-16", voucherNumber: "POV-2026-042", payee: "ECG Ghana", category: "Utilities", description: "Electricity bill for September main campus", amount: 4850, paymentMethod: "BANK_TRANSFER", status: "APPROVED" },
  { id: "exp-2", date: "2026-10-14", voucherNumber: "POV-2026-043", payee: "Ghana Water Co", category: "Utilities", description: "Monthly campus water supply", amount: 1200, paymentMethod: "CHEQUE", status: "APPROVED" },
  { id: "exp-3", date: "2026-10-11", voucherNumber: "POV-2026-044", payee: "Alpha Scientific Ltd", category: "Laboratory", description: "Chemistry reagents and lab glassware replenishment", amount: 3600, paymentMethod: "BANK_TRANSFER", status: "APPROVED" },
  { id: "exp-4", date: "2026-10-08", voucherNumber: "POV-2026-045", payee: "Star Fuels Ltd", category: "Transport", description: "Diesel replenishment for 3 school buses", amount: 5400, paymentMethod: "MOBILE_MONEY", status: "APPROVED" },
  { id: "exp-5", date: "2026-10-05", voucherNumber: "POV-2026-046", payee: "Apex Stationers", category: "Stationery", description: "A4 paper reams, dry erase markers & examination booklets", amount: 2150, paymentMethod: "CASH", status: "APPROVED" },
];

const mockStaffSalaries: StaffSalaryRecord[] = [
  { id: "sal-1", staffName: "Dr. Mensah Ofori", role: "Headmaster", department: "Administration", basicSalary: 7500, allowances: 1500, taxDeductions: 1350, netPay: 7650, status: "DISBURSED" },
  { id: "sal-2", staffName: "Mrs. Grace Appiah", role: "Senior Science Tutor", department: "Science", basicSalary: 3850, allowances: 1000, taxDeductions: 765, netPay: 4085, status: "DISBURSED" },
  { id: "sal-3", staffName: "Mr. Kwabena Darko", role: "Math Lead Tutor", department: "Mathematics", basicSalary: 3900, allowances: 950, taxDeductions: 780, netPay: 4070, status: "DISBURSED" },
  { id: "sal-4", staffName: "Ms. Veronica Kusi", role: "English Tutor", department: "Languages", basicSalary: 3500, allowances: 800, taxDeductions: 680, netPay: 3620, status: "DISBURSED" },
  { id: "sal-5", staffName: "Samuel Tagoe", role: "Bursar / Accountant", department: "Finance", basicSalary: 4200, allowances: 1100, taxDeductions: 850, netPay: 4450, status: "DISBURSED" },
];

const mockInventory: InventoryRecord[] = [
  { id: "inv-1", code: "BK-SCI-09", name: "Integrated Science for JHS 3", category: "Books", stockQty: 142, minThreshold: 30, unitCost: 45, location: "Library Store B" },
  { id: "inv-2", code: "UN-M-JHS", name: "School Crest Uniform (Boys M)", category: "Uniforms", stockQty: 18, minThreshold: 25, unitCost: 120, location: "Bursary Store" },
  { id: "inv-3", code: "LB-HCL-01", name: "Hydrochloric Acid 1M (500ml)", category: "Lab Chemicals", stockQty: 4, minThreshold: 10, unitCost: 85, location: "Chemistry Lab Prep" },
  { id: "inv-4", code: "IT-MOUSE-01", name: "Optical USB Mouse (Dell)", category: "IT Equipment", stockQty: 32, minThreshold: 15, unitCost: 40, location: "Computer Lab Store" },
  { id: "inv-5", code: "SP-FB-05", name: "FIFA Standard Size 5 Football", category: "Sports", stockQty: 6, minThreshold: 12, unitCost: 150, location: "Sports Shed" },
];

export function AccountantPortalWorkspace({ defaultTab = "overview" }: AccountantPortalWorkspaceProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>(mockInvoices);
  const [payments, setPayments] = useState<PaymentRecord[]>(mockPayments);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>(mockExpenses);
  const [inventoryList, setInventoryList] = useState<InventoryRecord[]>(mockInventory);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<string>("ALL");
  const [notice, setNotice] = useState<string | null>(null);

  // Modals
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState(false);
  const [showGenerateInvoicesModal, setShowGenerateInvoicesModal] = useState(false);
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentRecord | null>(null);
  const [selectedDebtor, setSelectedDebtor] = useState<InvoiceRecord | null>(null);

  // Record Payment Form state
  const [payStudentName, setPayStudentName] = useState("");
  const [payStudentId, setPayStudentId] = useState("");
  const [payClass, setPayClass] = useState("Basic 9 Emerald");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentRecord["paymentMethod"]>("MOBILE_MONEY");
  const [payRef, setPayRef] = useState("");

  // Add Expense Form state
  const [expPayee, setExpPayee] = useState("");
  const [expCategory, setExpCategory] = useState<ExpenseRecord["category"]>("Utilities");
  const [expDesc, setExpDesc] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expMethod, setExpMethod] = useState("BANK_TRANSFER");

  const triggerNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3500);
  };

  // Calculations
  const totalRevenue = payments.reduce((acc, p) => acc + p.amount, 0) + 145000; // Simulated historical base
  const totalOutstanding = invoices.reduce((acc, i) => acc + i.balanceAmount, 0) + 38000;
  const totalExpenses = expenses.reduce((acc, e) => acc + e.amount, 0) + 52000;
  const totalPayroll = mockStaffSalaries.reduce((acc, s) => acc + s.netPay, 0);
  const lowStockItems = inventoryList.filter((item) => item.stockQty <= item.minThreshold);

  const filteredInvoices = invoices.filter((inv) => {
    const matchesSearch =
      inv.studentName.toLowerCase().includes(invoiceSearch.toLowerCase()) ||
      inv.billNumber.toLowerCase().includes(invoiceSearch.toLowerCase()) ||
      inv.className.toLowerCase().includes(invoiceSearch.toLowerCase());
    const matchesStatus = invoiceStatusFilter === "ALL" || inv.status === invoiceStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payStudentName || !payAmount) return;

    const newPayment: PaymentRecord = {
      id: `pay-${Date.now()}`,
      receiptNumber: `REC-2026-${Math.floor(100 + Math.random() * 900)}`,
      studentName: payStudentName,
      studentId: payStudentId || "STU-2024-NEW",
      className: payClass,
      amount: Number(payAmount),
      paymentMethod: payMethod,
      referenceNumber: payRef || `TXN-${Date.now().toString().slice(-6)}`,
      paymentDate: new Date().toISOString().slice(0, 10),
      receivedBy: "Accounts Office",
    };

    setPayments([newPayment, ...payments]);
    setShowRecordPaymentModal(false);
    setSelectedReceipt(newPayment);
    triggerNotice(`Payment of GH₵ ${Number(payAmount).toLocaleString()} recorded successfully`);

    // Reset
    setPayStudentName("");
    setPayAmount("");
    setPayRef("");
  };

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expPayee || !expAmount) return;

    const newExp: ExpenseRecord = {
      id: `exp-${Date.now()}`,
      date: new Date().toISOString().slice(0, 10),
      voucherNumber: `POV-2026-0${Math.floor(50 + Math.random() * 50)}`,
      payee: expPayee,
      category: expCategory,
      description: expDesc,
      amount: Number(expAmount),
      paymentMethod: expMethod,
      status: "APPROVED",
    };

    setExpenses([newExp, ...expenses]);
    setShowAddExpenseModal(false);
    triggerNotice(`Expenditure voucher of GH₵ ${Number(expAmount).toLocaleString()} approved and logged`);

    // Reset
    setExpPayee("");
    setExpDesc("");
    setExpAmount("");
  };

  return (
    <div className="space-y-6">
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-800 via-teal-800 to-slate-900 p-6 text-white shadow-xl sm:p-8">
        <div className="absolute top-0 right-0 -m-16 size-72 rounded-full bg-emerald-400/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -m-10 size-60 rounded-full bg-teal-400/10 blur-2xl pointer-events-none" />

        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider backdrop-blur-md">
              <BadgeDollarSign className="size-3.5 text-emerald-300" />
              Financial Bursary & Accounts Office • Academic Term 1
            </div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl md:text-4xl">
              Bursar & Accounts Command Center
            </h1>
            <p className="max-w-xl text-sm text-emerald-100/90 leading-relaxed">
              Track student fee collection, generate billing statements, record receipts, audit expenditures, disburse payroll, and monitor stock inventory.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowRecordPaymentModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-emerald-900 shadow-md transition hover:bg-emerald-50"
            >
              <Plus className="size-4 text-emerald-700" />
              Record Payment
            </button>
            <button
              onClick={() => setShowGenerateInvoicesModal(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-xs font-bold text-white backdrop-blur-md transition hover:bg-white/20"
            >
              <Receipt className="size-4" />
              Generate Bills
            </button>
            <button
              onClick={() => setShowAddExpenseModal(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-xs font-bold text-white backdrop-blur-md transition hover:bg-white/20"
            >
              <TrendingDown className="size-4" />
              Add Expense
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <PortalStatCard
          label="Total Revenue"
          value={`GH₵ ${(totalRevenue / 1000).toFixed(1)}k`}
          subValue="Term to date"
          icon={TrendingUp}
          variant="emerald"
          trend={{ value: "+14.2%", isPositive: true, label: "vs last term" }}
          onClick={() => setActiveTab("payments")}
        />
        <PortalStatCard
          label="Outstanding Fees"
          value={`GH₵ ${(totalOutstanding / 1000).toFixed(1)}k`}
          subValue="In arrears"
          icon={AlertCircle}
          variant="rose"
          trend={{ value: "24 debtors", isPositive: false }}
          onClick={() => setActiveTab("debtors")}
        />
        <PortalStatCard
          label="Total Expenses"
          value={`GH₵ ${(totalExpenses / 1000).toFixed(1)}k`}
          subValue="Approved"
          icon={TrendingDown}
          variant="amber"
          onClick={() => setActiveTab("expenses")}
        />
        <PortalStatCard
          label="Monthly Payroll"
          value={`GH₵ ${(totalPayroll / 1000).toFixed(1)}k`}
          subValue="Staff net"
          icon={Users}
          variant="indigo"
          onClick={() => setActiveTab("payroll")}
        />
        <PortalStatCard
          label="Inventory Stock"
          value={inventoryList.length}
          subValue={lowStockItems.length > 0 ? `${lowStockItems.length} low stock` : "Optimal"}
          icon={Package}
          variant={lowStockItems.length > 0 ? "rose" : "slate"}
          onClick={() => setActiveTab("inventory")}
        />
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        {[
          { id: "overview", label: "Financial Overview", icon: BadgeDollarSign },
          { id: "invoices", label: "Invoices & Billing", icon: Receipt, badge: invoices.length },
          { id: "payments", label: "Payments & Receipts", icon: Banknote, badge: payments.length },
          { id: "debtors", label: "Debtors & Reminders", icon: AlertCircle, badge: invoices.filter((i) => i.balanceAmount > 0).length },
          { id: "payroll", label: "Staff Payroll", icon: Users },
          { id: "expenses", label: "Operating Expenses", icon: TrendingDown },
          { id: "inventory", label: "Supplies & Inventory", icon: Package, badge: lowStockItems.length > 0 ? "Alert" : undefined },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all",
                isActive
                  ? "bg-emerald-700 text-white shadow-sm shadow-emerald-700/20"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
              )}
            >
              <Icon className="size-4" />
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.2 text-[10px]",
                    isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800",
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Toast Notice */}
      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800 shadow-xs dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          <Check className="size-4 text-emerald-600" />
          {notice}
        </div>
      )}

      {/* TAB: OVERVIEW */}
      {activeTab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Left: Cashflow summary & Recent Ledger */}
          <div className="space-y-6 lg:col-span-2">
            {/* Collection Progress */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Fee Collection Progress</h3>
                  <p className="text-xs text-slate-500">Collected vs Projected Term Revenue</p>
                </div>
                <span className="text-sm font-black text-emerald-600">82.5% Collected</span>
              </div>
              <div className="mt-4 h-3.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-600" style={{ width: "82.5%" }} />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Collected: <strong>GH₵ 248,500.00</strong></span>
                <span>Term Target: <strong>GH₵ 301,000.00</strong></span>
              </div>
            </div>

            {/* Recent Payments Ledger */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Banknote className="size-4 text-emerald-600" />
                  Recent Fee Payments Ledger
                </h3>
                <button
                  onClick={() => setActiveTab("payments")}
                  className="text-xs font-semibold text-emerald-600 hover:underline"
                >
                  View All Receipts →
                </button>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {payments.slice(0, 4).map((pay) => (
                  <div key={pay.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 font-bold dark:bg-emerald-950/40">
                        GH₵
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white">{pay.studentName}</p>
                        <p className="text-[11px] text-slate-400 font-mono">{pay.receiptNumber} • {pay.paymentMethod}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-black text-slate-900 dark:text-white">GH₵ {pay.amount.toLocaleString()}</p>
                        <p className="text-[10px] text-slate-400">{pay.paymentDate}</p>
                      </div>
                      <button
                        onClick={() => setSelectedReceipt(pay)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                        title="View Official Receipt"
                      >
                        <Printer className="size-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Quick Financial Actions & Stock Alert */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Accounting Shortcuts</h3>
              <div className="mt-3 grid gap-2">
                <button
                  onClick={() => setShowRecordPaymentModal(true)}
                  className="flex items-center justify-between rounded-xl border border-slate-100 p-3 text-left transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
                      <Banknote className="size-4" />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Record Fee Payment</p>
                      <p className="text-[10px] text-slate-500">Cash, Mobile Money, Bank</p>
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-slate-400" />
                </button>

                <button
                  onClick={() => setShowGenerateInvoicesModal(true)}
                  className="flex items-center justify-between rounded-xl border border-slate-100 p-3 text-left transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="rounded-lg bg-blue-50 p-2 text-blue-600">
                      <Receipt className="size-4" />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Batch Invoice Generator</p>
                      <p className="text-[10px] text-slate-500">Issue term bills to classes</p>
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-slate-400" />
                </button>

                <button
                  onClick={() => setShowAddExpenseModal(true)}
                  className="flex items-center justify-between rounded-xl border border-slate-100 p-3 text-left transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="rounded-lg bg-amber-50 p-2 text-amber-600">
                      <TrendingDown className="size-4" />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Log Operating Expense</p>
                      <p className="text-[10px] text-slate-500">Record voucher & receipt</p>
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-slate-400" />
                </button>
              </div>
            </div>

            {/* Low Inventory Alert */}
            {lowStockItems.length > 0 && (
              <div className="rounded-2xl border border-rose-100 bg-rose-50/70 p-5 dark:border-rose-900/40 dark:bg-rose-950/20">
                <div className="flex items-center gap-2 text-xs font-bold text-rose-900 dark:text-rose-300">
                  <AlertCircle className="size-4 text-rose-600" />
                  Low Inventory Warning ({lowStockItems.length} items)
                </div>
                <div className="mt-3 space-y-2">
                  {lowStockItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between text-xs text-rose-950 dark:text-rose-200">
                      <span>{item.name}</span>
                      <span className="font-bold text-rose-600">{item.stockQty} left</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setActiveTab("inventory")}
                  className="mt-3 text-[11px] font-bold text-rose-700 hover:underline"
                >
                  Manage Supplies Inventory →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: INVOICES & BILLING */}
      {activeTab === "invoices" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Student Invoices & Billing</h2>
              <p className="text-xs text-slate-500">Manage term fee assessments, outstanding balances, and billing schedules</p>
            </div>
            <button
              onClick={() => setShowGenerateInvoicesModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-800"
            >
              <Plus className="size-4" />
              Generate Term Invoices
            </button>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="relative min-w-[240px] flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by student name, invoice #, class..."
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-1.5 text-xs text-slate-800 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400 font-semibold uppercase text-[10px]">Status:</span>
              {["ALL", "PAID", "PARTIALLY_PAID", "PENDING", "OVERDUE"].map((st) => (
                <button
                  key={st}
                  onClick={() => setInvoiceStatusFilter(st)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-bold transition",
                    invoiceStatusFilter === st
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300",
                  )}
                >
                  {st.replaceAll("_", " ")}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full min-w-[800px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-800/50">
                  <th className="p-3.5 pl-5">Invoice #</th>
                  <th className="p-3.5">Student</th>
                  <th className="p-3.5">Fee Structure</th>
                  <th className="p-3.5 text-right">Total (GH₵)</th>
                  <th className="p-3.5 text-right">Paid (GH₵)</th>
                  <th className="p-3.5 text-right">Balance (GH₵)</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5">Due Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="p-3.5 pl-5 font-mono font-bold text-slate-700 dark:text-slate-300">
                      {inv.billNumber}
                    </td>
                    <td className="p-3.5">
                      <p className="font-bold text-slate-900 dark:text-white">{inv.studentName}</p>
                      <p className="text-[10px] text-slate-400">{inv.className}</p>
                    </td>
                    <td className="p-3.5 text-slate-600 dark:text-slate-300">{inv.feeStructureName}</td>
                    <td className="p-3.5 text-right font-semibold">{inv.totalAmount.toLocaleString()}</td>
                    <td className="p-3.5 text-right font-semibold text-emerald-600">{inv.paidAmount.toLocaleString()}</td>
                    <td className="p-3.5 text-right font-black">
                      <span className={inv.balanceAmount > 0 ? "text-rose-600" : "text-emerald-600"}>
                        {inv.balanceAmount.toLocaleString()}
                      </span>
                    </td>
                    <td className="p-3.5 text-center">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase",
                          inv.status === "PAID" && "bg-emerald-50 text-emerald-700 border border-emerald-200",
                          inv.status === "PARTIALLY_PAID" && "bg-blue-50 text-blue-700 border border-blue-200",
                          inv.status === "PENDING" && "bg-amber-50 text-amber-700 border border-amber-200",
                          inv.status === "OVERDUE" && "bg-rose-50 text-rose-700 border border-rose-200",
                        )}
                      >
                        {inv.status.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-500 font-mono text-[11px]">{inv.dueDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: PAYMENTS */}
      {activeTab === "payments" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Fee Payments Registry</h2>
              <p className="text-xs text-slate-500">Official log of all student fee receipts, mobile money, and bank transfers</p>
            </div>
            <button
              onClick={() => setShowRecordPaymentModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-800"
            >
              <Plus className="size-4" />
              Record New Payment
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full min-w-[750px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-800/50">
                  <th className="p-3.5 pl-5">Receipt #</th>
                  <th className="p-3.5">Student</th>
                  <th className="p-3.5">Method & Reference</th>
                  <th className="p-3.5 text-right">Amount Paid</th>
                  <th className="p-3.5">Payment Date</th>
                  <th className="p-3.5 text-center">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="p-3.5 pl-5 font-mono font-bold text-emerald-700 dark:text-emerald-400">
                      {p.receiptNumber}
                    </td>
                    <td className="p-3.5">
                      <p className="font-bold text-slate-900 dark:text-white">{p.studentName}</p>
                      <p className="text-[10px] text-slate-400">{p.className}</p>
                    </td>
                    <td className="p-3.5">
                      <span className="font-semibold text-slate-800 dark:text-slate-200 block">{p.paymentMethod.replaceAll("_", " ")}</span>
                      <span className="text-[10px] text-slate-400 font-mono">Ref: {p.referenceNumber}</span>
                    </td>
                    <td className="p-3.5 text-right font-black text-slate-900 dark:text-white">
                      GH₵ {p.amount.toLocaleString()}
                    </td>
                    <td className="p-3.5 text-slate-500 font-mono text-[11px]">{p.paymentDate}</td>
                    <td className="p-3.5 text-center">
                      <button
                        onClick={() => setSelectedReceipt(p)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      >
                        <Printer className="size-3.5" />
                        Print
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: DEBTORS */}
      {activeTab === "debtors" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Debtors & Overdue Fee Balances</h2>
              <p className="text-xs text-slate-500">Students with outstanding fee balances and fee reminder triggers</p>
            </div>
            <button
              onClick={() => triggerNotice("Batch fee reminder SMS sent to all 24 guardians")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-rose-700"
            >
              <Send className="size-4" />
              Send Batch SMS Reminders
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full min-w-[750px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-800/50">
                  <th className="p-3.5 pl-5">Student</th>
                  <th className="p-3.5">Class</th>
                  <th className="p-3.5 text-right">Total Billed</th>
                  <th className="p-3.5 text-right">Amount Paid</th>
                  <th className="p-3.5 text-right">Outstanding Arrears</th>
                  <th className="p-3.5">Due Status</th>
                  <th className="p-3.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {invoices.filter((i) => i.balanceAmount > 0).map((debtor) => (
                  <tr key={debtor.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="p-3.5 pl-5">
                      <p className="font-bold text-slate-900 dark:text-white">{debtor.studentName}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{debtor.studentId}</p>
                    </td>
                    <td className="p-3.5 text-slate-600 dark:text-slate-300">{debtor.className}</td>
                    <td className="p-3.5 text-right font-semibold">GH₵ {debtor.totalAmount.toLocaleString()}</td>
                    <td className="p-3.5 text-right font-semibold text-emerald-600">GH₵ {debtor.paidAmount.toLocaleString()}</td>
                    <td className="p-3.5 text-right font-black text-rose-600">
                      GH₵ {debtor.balanceAmount.toLocaleString()}
                    </td>
                    <td className="p-3.5">
                      <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-black text-rose-700">
                        {debtor.status === "OVERDUE" ? "Overdue" : "Pending Due"}
                      </span>
                    </td>
                    <td className="p-3.5 text-center">
                      <button
                        onClick={() => setSelectedDebtor(debtor)}
                        className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                      >
                        <Bell className="size-3" />
                        Remind
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: PAYROLL */}
      {activeTab === "payroll" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Staff Payroll & Salaries</h2>
              <p className="text-xs text-slate-500">Monthly remuneration registry, tax deductions, and net disbursements</p>
            </div>
            <button
              onClick={() => triggerNotice("Payroll for September 2026 successfully approved & scheduled")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-800"
            >
              <CheckCircle2 className="size-4" />
              Disburse Monthly Payroll
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full min-w-[750px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-800/50">
                  <th className="p-3.5 pl-5">Staff Name</th>
                  <th className="p-3.5">Role / Dept</th>
                  <th className="p-3.5 text-right">Basic (GH₵)</th>
                  <th className="p-3.5 text-right">Allowances</th>
                  <th className="p-3.5 text-right">Tax & SSNIT</th>
                  <th className="p-3.5 text-right">Net Salary</th>
                  <th className="p-3.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {mockStaffSalaries.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="p-3.5 pl-5 font-bold text-slate-900 dark:text-white">{s.staffName}</td>
                    <td className="p-3.5">
                      <span className="block text-slate-800 dark:text-slate-200 font-medium">{s.role}</span>
                      <span className="text-[10px] text-slate-400">{s.department}</span>
                    </td>
                    <td className="p-3.5 text-right font-medium">{s.basicSalary.toLocaleString()}</td>
                    <td className="p-3.5 text-right font-medium text-emerald-600">+{s.allowances.toLocaleString()}</td>
                    <td className="p-3.5 text-right font-medium text-rose-600">-{s.taxDeductions.toLocaleString()}</td>
                    <td className="p-3.5 text-right font-black text-slate-900 dark:text-white">
                      GH₵ {s.netPay.toLocaleString()}
                    </td>
                    <td className="p-3.5 text-center">
                      <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: EXPENSES */}
      {activeTab === "expenses" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">School Operational Expenses</h2>
              <p className="text-xs text-slate-500">Expenditures, utility vouchers, vendor payments, and maintenance costs</p>
            </div>
            <button
              onClick={() => setShowAddExpenseModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-amber-700"
            >
              <Plus className="size-4" />
              Add Expense Voucher
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full min-w-[750px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-800/50">
                  <th className="p-3.5 pl-5">Date & POV #</th>
                  <th className="p-3.5">Payee & Category</th>
                  <th className="p-3.5">Description</th>
                  <th className="p-3.5 text-right">Amount (GH₵)</th>
                  <th className="p-3.5">Payment Method</th>
                  <th className="p-3.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {expenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="p-3.5 pl-5">
                      <p className="font-mono font-bold text-slate-900 dark:text-white">{exp.voucherNumber}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{exp.date}</p>
                    </td>
                    <td className="p-3.5">
                      <p className="font-bold text-slate-900 dark:text-white">{exp.payee}</p>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {exp.category}
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-600 dark:text-slate-300 max-w-xs truncate">{exp.description}</td>
                    <td className="p-3.5 text-right font-black text-rose-600">
                      -GH₵ {exp.amount.toLocaleString()}
                    </td>
                    <td className="p-3.5 text-slate-600 dark:text-slate-400 font-medium">{exp.paymentMethod}</td>
                    <td className="p-3.5 text-center">
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        {exp.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: INVENTORY */}
      {activeTab === "inventory" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">School Inventory & Supplies</h2>
              <p className="text-xs text-slate-500">Track books, uniforms, science chemicals, sports items, and assets</p>
            </div>
            <button
              onClick={() => triggerNotice("Inventory stock balance audited")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-slate-900 dark:bg-slate-700"
            >
              <PackageCheck className="size-4" />
              Audit Stock
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full min-w-[700px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-800/50">
                  <th className="p-3.5 pl-5">Item Code</th>
                  <th className="p-3.5">Item Name</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5 text-center">Stock Level</th>
                  <th className="p-3.5 text-right">Unit Cost</th>
                  <th className="p-3.5 text-right">Valuation</th>
                  <th className="p-3.5">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {inventoryList.map((item) => {
                  const isLow = item.stockQty <= item.minThreshold;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="p-3.5 pl-5 font-mono text-slate-500">{item.code}</td>
                      <td className="p-3.5 font-bold text-slate-900 dark:text-white">{item.name}</td>
                      <td className="p-3.5 text-slate-600 dark:text-slate-300">{item.category}</td>
                      <td className="p-3.5 text-center">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-[10px] font-black",
                            isLow ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700",
                          )}
                        >
                          {item.stockQty} {isLow ? "(LOW)" : "In Stock"}
                        </span>
                      </td>
                      <td className="p-3.5 text-right font-medium">GH₵ {item.unitCost}</td>
                      <td className="p-3.5 text-right font-black text-slate-900 dark:text-white">
                        GH₵ {(item.stockQty * item.unitCost).toLocaleString()}
                      </td>
                      <td className="p-3.5 text-slate-500">{item.location}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: Record Payment */}
      <PortalModal
        isOpen={showRecordPaymentModal}
        onClose={() => setShowRecordPaymentModal(false)}
        title="Record Fee Payment Receipt"
        description="Issue an official payment receipt against a student account"
        maxWidth="lg"
      >
        <form onSubmit={handleRecordPayment} className="space-y-4 text-xs">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Student Full Name</label>
            <input
              required
              type="text"
              placeholder="e.g. Kwame Asante"
              value={payStudentName}
              onChange={(e) => setPayStudentName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-800 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Student ID</label>
              <input
                type="text"
                placeholder="STU-2024-001"
                value={payStudentId}
                onChange={(e) => setPayStudentId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-800 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Class</label>
              <select
                value={payClass}
                onChange={(e) => setPayClass(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-800 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="Basic 9 Emerald">Basic 9 Emerald</option>
                <option value="Basic 8 Gold">Basic 8 Gold</option>
                <option value="Form 2 Science">Form 2 Science</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Amount Paid (GH₵)</label>
              <input
                required
                type="number"
                min="1"
                placeholder="0.00"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 p-2 font-bold text-xs text-slate-800 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Payment Channel</label>
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value as any)}
                className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-800 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="MOBILE_MONEY">MTN Mobile Money / Telecel</option>
                <option value="BANK_TRANSFER">Bank Direct Deposit / Transfer</option>
                <option value="CASH">Cash Over-the-Counter</option>
                <option value="CHEQUE">Bank Cheque</option>
                <option value="CARD">Debit / Credit Card</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Transaction Ref / Cheque #</label>
            <input
              type="text"
              placeholder="e.g. MTN-894729103"
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-800 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="pt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowRecordPaymentModal(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-800"
            >
              Generate Receipt
            </button>
          </div>
        </form>
      </PortalModal>

      {/* MODAL: Official Receipt Preview */}
      <PortalModal
        isOpen={!!selectedReceipt}
        onClose={() => setSelectedReceipt(null)}
        title="Official Fee Receipt Voucher"
        description="Official school financial receipt document"
        maxWidth="md"
        footer={
          <button
            onClick={() => {
              window.print();
              setSelectedReceipt(null);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-800"
          >
            <Printer className="size-4" />
            Print Official Receipt
          </button>
        }
      >
        {selectedReceipt && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 font-mono text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-200">
            <div className="text-center pb-3 border-b border-slate-200 dark:border-slate-700">
              <h4 className="text-sm font-black uppercase tracking-wider">SchoolHub Academy</h4>
              <p className="text-[10px] text-slate-500">Official Student Fee Payment Receipt</p>
            </div>

            <div className="py-3 space-y-1.5 border-b border-slate-200 dark:border-slate-700 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-500">Receipt No:</span>
                <span className="font-bold">{selectedReceipt.receiptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Student:</span>
                <span className="font-bold">{selectedReceipt.studentName} ({selectedReceipt.className})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Student ID:</span>
                <span>{selectedReceipt.studentId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Date:</span>
                <span>{selectedReceipt.paymentDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Method:</span>
                <span>{selectedReceipt.paymentMethod} (Ref: {selectedReceipt.referenceNumber})</span>
              </div>
            </div>

            <div className="py-4 flex justify-between items-center text-sm font-black text-emerald-800 dark:text-emerald-400">
              <span>TOTAL RECEIVED</span>
              <span className="text-lg">GH₵ {selectedReceipt.amount.toLocaleString()}</span>
            </div>

            <div className="text-center pt-2 text-[10px] text-slate-400">
              Received by: Accounts Bursary • Thank you for your payment
            </div>
          </div>
        )}
      </PortalModal>

      {/* MODAL: Send Debtor Reminder */}
      <PortalModal
        isOpen={!!selectedDebtor}
        onClose={() => setSelectedDebtor(null)}
        title="Send Fee Overdue Reminder"
        description={selectedDebtor ? `Send SMS notification to guardian of ${selectedDebtor.studentName}` : ""}
        maxWidth="md"
      >
        {selectedDebtor && (
          <div className="space-y-4 text-xs">
            <div className="rounded-xl bg-slate-50 p-3 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <p>Student: <strong>{selectedDebtor.studentName}</strong></p>
              <p>Outstanding Arrears: <strong className="text-rose-600">GH₵ {selectedDebtor.balanceAmount.toLocaleString()}</strong></p>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">SMS Notice Template</label>
              <textarea
                rows={4}
                defaultValue={`Dear Parent, this is a kind reminder from SchoolHub Academy that your ward ${selectedDebtor.studentName} has an outstanding fee balance of GH₵ ${selectedDebtor.balanceAmount.toLocaleString()} due for Term 1. Please remit via Mobile Money to ensure uninterrupted classes.`}
                className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-800 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setSelectedDebtor(null)}
                className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  triggerNotice(`Fee reminder SMS sent to guardian of ${selectedDebtor.studentName}`);
                  setSelectedDebtor(null);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700"
              >
                <Send className="size-3.5" />
                Send SMS Notice
              </button>
            </div>
          </div>
        )}
      </PortalModal>

      {/* MODAL: Generate Invoices */}
      <PortalModal
        isOpen={showGenerateInvoicesModal}
        onClose={() => setShowGenerateInvoicesModal(false)}
        title="Batch Invoice Generator"
        description="Generate and issue term bills across class levels"
        maxWidth="md"
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Target Cohort</label>
            <select className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white">
              <option>All Enrolled Students (Whole School)</option>
              <option>Basic 9 (JHS 3 Cohort)</option>
              <option>Form 2 Science</option>
              <option>Basic 8 Gold</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Fee Structure</label>
            <select className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white">
              <option>Term 1 2025/2026 Standard Composite Fee (GH₵ 1,850)</option>
              <option>SHS Science Lab & Tuition Fee (GH₵ 2,400)</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Payment Due Date</label>
            <input
              type="date"
              defaultValue="2026-11-15"
              className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="pt-3 flex justify-end gap-2">
            <button
              onClick={() => setShowGenerateInvoicesModal(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                triggerNotice("Batch invoice creation completed: 115 bills generated");
                setShowGenerateInvoicesModal(false);
              }}
              className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800"
            >
              Generate Invoices
            </button>
          </div>
        </div>
      </PortalModal>

      {/* MODAL: Add Expense */}
      <PortalModal
        isOpen={showAddExpenseModal}
        onClose={() => setShowAddExpenseModal(false)}
        title="Record Operational Expenditure"
        description="Create an approved Payment Out Voucher (POV)"
        maxWidth="md"
      >
        <form onSubmit={handleAddExpense} className="space-y-4 text-xs">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Payee / Vendor Name</label>
            <input
              required
              type="text"
              placeholder="e.g. ECG Ghana or Apex Stationers"
              value={expPayee}
              onChange={(e) => setExpPayee(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Category</label>
              <select
                value={expCategory}
                onChange={(e) => setExpCategory(e.target.value as any)}
                className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="Utilities">Utilities (Water, Power)</option>
                <option value="Laboratory">Laboratory & Science</option>
                <option value="Transport">Transport & Fuel</option>
                <option value="Maintenance">Facility Maintenance</option>
                <option value="Stationery">Stationery & Office</option>
                <option value="Catering">Catering & Meals</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Amount (GH₵)</label>
              <input
                required
                type="number"
                min="1"
                placeholder="0.00"
                value={expAmount}
                onChange={(e) => setExpAmount(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 p-2 font-bold text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Description & Purpose</label>
            <textarea
              rows={2}
              required
              placeholder="Describe the purchase purpose..."
              value={expDesc}
              onChange={(e) => setExpDesc(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="pt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddExpenseModal(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700"
            >
              Log Expenditure
            </button>
          </div>
        </form>
      </PortalModal>
    </div>
  );
}
