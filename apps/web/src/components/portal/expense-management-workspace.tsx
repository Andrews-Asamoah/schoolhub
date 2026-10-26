import { DataTable, TableExportMenu, type DataTableColumn } from "@/components/ui/data-table";
import type { ExportTable } from "@/lib/table-export";
import { ServerExportButton } from "@/components/portal/server-export-button";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownRight, CalendarDays, FileText, LoaderCircle, Plus, Printer, Search, Tags, Wallet, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FinanceReadOnlyNotice, useFinanceAccess } from "@/components/portal/finance-access";

interface ExpenseCategory {
  id: string;
  name: string;
  description?: string | null;
}
interface ExpenseRecord {
  id: string;
  date: string;
  amount: number | string;
  description: string;
  payee?: string | null;
  category?: string | null;
  paymentMethod: string;
  checkNumber?: string | null;
  voucherNumber?: string | null;
  referenceNumber?: string | null;
  createdAt?: string;
  recordedBy?: { name?: string | null } | null;
  registryCategory?: ExpenseCategory | null;
  customCategory?: { name: string } | null;
}
interface ExpenseDraft {
  date: string;
  amount: string;
  description: string;
  payee: string;
  category: string;
  paymentMethod: string;
  registryCategoryId: string;
  voucherNumber: string;
  checkNumber: string;
  referenceNumber: string;
}
const accountingGroups = ["SALARY", "UTILITIES", "SUPPLIES", "MAINTENANCE", "TRANSPORT", "RENT", "INSURANCE", "TAXES", "OTHER"];
const paymentMethods = ["CASH", "BANK_TRANSFER", "CHEQUE", "MOBILE_MONEY", "CARD", "ONLINE", "OTHER"];
const currency = (value: number) => new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const dateValue = (date: Date) => {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 10);
};
const today = () => dateValue(new Date());
const monthStart = () => `${today().slice(0, 7)}-01`;
const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const parsed = new Date(value.length === 10 ? value + "T00:00:00.000Z" : value);
  return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(parsed);
};
const label = (value?: string | null) => value ? value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Uncategorised";
const fieldClass = "h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/30";
const primaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";
const freshDraft = (): ExpenseDraft => ({ date: today(), amount: "", description: "", payee: "", category: "OTHER", paymentMethod: "CASH", registryCategoryId: "", voucherNumber: "", checkNumber: "", referenceNumber: "" });

export function ExpenseManagementWorkspace() {
  const { canWrite } = useFinanceAccess();
  const queryClient = useQueryClient();
  const [fromDate, setFromDate] = useState(monthStart);
  const [toDate, setToDate] = useState(today);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [methodFilter, setMethodFilter] = useState("ALL");
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseRecord | null>(null);
  const [draft, setDraft] = useState<ExpenseDraft>(freshDraft);
  const [categoryName, setCategoryName] = useState("");
  const [categoryDescription, setCategoryDescription] = useState("");
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingDescription, setEditingDescription] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const rangeInvalid = Boolean(fromDate && toDate && fromDate > toDate);

  const expensesQuery = useQuery({
    queryKey: ["finance", "expenses", fromDate, toDate],
    queryFn: () => {
      const params = new URLSearchParams();
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const query = params.toString();
      const suffix = query ? `?${query}` : "";
      return apiFetch<ExpenseRecord[]>(`/finance/expenses${suffix}`);
    },
    enabled: !rangeInvalid,
    retry: false,
  });
  const categoriesQuery = useQuery({
    queryKey: ["finance", "expenditure-categories"],
    queryFn: () => apiFetch<ExpenseCategory[]>("/finance/expenditure-categories"),
    retry: false,
  });
  const expenses = expensesQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];

  const visibleExpenses = useMemo(() => expenses.filter((expense) => {
    const term = search.trim().toLowerCase();
    const matchesText = !term || [
      expense.description, expense.payee, expense.voucherNumber, expense.referenceNumber,
      expense.checkNumber, expense.registryCategory?.name, expense.customCategory?.name,
      expense.recordedBy?.name, expense.id,
    ].some((value) => String(value ?? "").toLowerCase().includes(term));
    const matchesCategory = categoryFilter === "ALL" || expense.registryCategory?.id === categoryFilter;
    const matchesMethod = methodFilter === "ALL" || expense.paymentMethod === methodFilter;
    return matchesText && matchesCategory && matchesMethod;
  }), [expenses, search, categoryFilter, methodFilter]);

  const periodTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const averageExpense = expenses.length ? periodTotal / expenses.length : 0;
  const largestExpense = expenses.reduce<ExpenseRecord | null>((largest, expense) => !largest || Number(expense.amount) > Number(largest.amount) ? expense : largest, null);
  const groupedCategories = useMemo(() => {
    const groups = new Map<string, number>();
    for (const expense of expenses) {
      const name = expense.registryCategory?.name ?? expense.customCategory?.name ?? label(expense.category);
      groups.set(name, (groups.get(name) ?? 0) + Number(expense.amount));
    }
    return [...groups.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const createExpense = useMutation({
    mutationFn: (input: ExpenseDraft) => apiFetch<ExpenseRecord>("/finance/expenses", {
      method: "POST",
      body: JSON.stringify({
        date: input.date,
        amount: Number(input.amount),
        description: input.description.trim(),
        payee: input.payee.trim() || undefined,
        category: input.category,
        paymentMethod: input.paymentMethod,
        registryCategoryId: input.registryCategoryId || undefined,
        voucherNumber: input.voucherNumber.trim() || undefined,
        checkNumber: input.checkNumber.trim() || undefined,
        referenceNumber: input.referenceNumber.trim() || undefined,
      }),
    }),
    onSuccess: async (created) => {
      setFeedback({ kind: "success", text: `Expense recorded: ${created.voucherNumber || created.id.slice(-8)}.` });
      setShowExpenseForm(false);
      setDraft(freshDraft());
      await queryClient.invalidateQueries({ queryKey: ["finance", "expenses"] });
    },
    onError: (error: Error) => setFeedback({ kind: "error", text: error.message }),
  });

  const createCategory = useMutation({
    mutationFn: (input: { name: string; description?: string }) => apiFetch<ExpenseCategory>("/finance/expenditure-categories", {
      method: "POST",
      body: JSON.stringify(input),
    }),
    onSuccess: async (created) => {
      setFeedback({ kind: "success", text: `Category “${created.name}” added.` });
      setCategoryName("");
      setCategoryDescription("");
      await queryClient.invalidateQueries({ queryKey: ["finance", "expenditure-categories"] });
    },
    onError: (error: Error) => setFeedback({ kind: "error", text: error.message }),
  });
  const updateCategory = useMutation({
    mutationFn: ({ id, name, description }: { id: string; name: string; description?: string }) =>
      apiFetch<ExpenseCategory>(`/finance/expenditure-categories/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ name, description }),
      }),
    onSuccess: async (updated) => {
      setFeedback({ kind: "success", text: `Category “${updated.name}” updated.` });
      setEditingCategory(null);
      await queryClient.invalidateQueries({ queryKey: ["finance", "expenditure-categories"] });
    },
    onError: (error: Error) => setFeedback({ kind: "error", text: error.message }),
  });

  function updateDraft<K extends keyof ExpenseDraft>(key: K, value: ExpenseDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    if (Number(draft.amount) <= 0 || !Number.isFinite(Number(draft.amount))) {
      setFeedback({ kind: "error", text: "Enter an amount greater than zero." });
      return;
    }
    createExpense.mutate(draft);
  }
  const buildExpenseExportTable = (): ExportTable => ({
    title: "Expense register",
    headers: ["Date", "Voucher", "Description", "Payee", "Expense category", "Accounting group", "Payment method", "Cheque", "Reference", "Amount (GHS)", "Recorded by"],
    columnTypes: ["date", "text", "text", "text", "text", "text", "text", "text", "text", "money", "text"],
    rows: visibleExpenses.map((expense) => [
      formatDate(expense.date), expense.voucherNumber ?? "", expense.description, expense.payee ?? "",
      expense.registryCategory?.name ?? expense.customCategory?.name ?? "Uncategorised", expense.category ?? "",
      expense.paymentMethod, expense.checkNumber ?? "", expense.referenceNumber ?? "", Number(expense.amount), expense.recordedBy?.name ?? "",
    ]),
    totals: ["Total", "", "", "", "", "", "", "", "", null, ""],
    reportInfo: { period: (fromDate || "Any date") + " to " + (toDate || "Any date"), filters: { from: fromDate, to: toDate } },
  });

  return (
    <div className="mx-auto w-full min-w-0 max-w-screen-2xl space-y-6">
      <style>{`@media print {
        body * { visibility: hidden !important; }
        .expense-voucher-print, .expense-voucher-print * { visibility: visible !important; }
        .expense-voucher-print { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; max-width: none !important; margin: 0 !important; padding: 20px !important; border: 0 !important; box-shadow: none !important; background: white !important; color: black !important; }
        .expense-voucher-actions { display: none !important; }
        .expense-voucher-print p, .expense-voucher-print span, .expense-voucher-print h2, .expense-voucher-print h3 { color: black !important; }
        @page { size: A4 portrait; margin: 12mm; }
      }`}</style>
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Finance & bursary</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">Expenses</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Record school expenditure, keep voucher references together, and analyse spend by date, category and payment method.</p></div>
        <div className="flex flex-wrap gap-2">{canWrite && <button type="button" className={secondaryButton} onClick={() => setShowCategoryManager(true)}><Tags className="size-4" /> Manage categories</button>}<TableExportMenu build={buildExpenseExportTable} note="Exports reflect the selected date range." /><ServerExportButton endpoint={"/finance/exports/expenses.xlsx?from=" + encodeURIComponent(fromDate) + "&to=" + encodeURIComponent(toDate)} label="Full Excel" className={secondaryButton} />{canWrite && <button type="button" className={primaryButton} onClick={() => { setFeedback(null); setDraft(freshDraft()); setShowExpenseForm(true); }}><Plus className="size-4" /> Record expense</button>}</div>
      </section>

      {!canWrite && <FinanceReadOnlyNotice />}
      {feedback && <div role={feedback.kind === "error" ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-xl border p-3 text-sm", feedback.kind === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-success/30 bg-success/5 text-foreground")}><span className="min-w-0 flex-1">{feedback.text}</span><button type="button" onClick={() => setFeedback(null)} aria-label="Dismiss message"><X className="size-4" /></button></div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total in selected period" value={expensesQuery.isPending || rangeInvalid ? "—" : currency(periodTotal)} detail={`${expenses.length} saved expense record(s)`} icon={ArrowDownRight} />
        <Metric label="Average expense" value={expensesQuery.isPending || !expenses.length ? "—" : currency(averageExpense)} detail="Mean transaction value" icon={Wallet} />
        <Metric label="Expense categories" value={categoriesQuery.isPending ? "—" : String(categories.length)} detail="Reusable school categories" icon={Tags} />
        <Metric label="Largest expense" value={largestExpense ? currency(Number(largestExpense.amount)) : "—"} detail={largestExpense ? largestExpense.description : "No expenses in this period"} icon={CalendarDays} />
      </div>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(260px,0.8fr)]">
        <div className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 flex-1"><label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Search expenses</label><div className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><input className={cn(fieldClass, "pl-9")} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Description, payee, voucher or reference…" /></div></div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 lg:w-[360px]"><Field label="From"><input type="date" className={fieldClass} value={fromDate} max={toDate || undefined} onChange={(event) => setFromDate(event.target.value)} /></Field><Field label="To"><input type="date" className={fieldClass} value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)} /></Field></div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2"><div><label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Category</label><Select value={categoryFilter} onValueChange={setCategoryFilter}><SelectTrigger className="w-full"><SelectValue placeholder="All categories" /></SelectTrigger><SelectContent><SelectItem value="ALL">All categories</SelectItem>{categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select></div><div><label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Payment method</label><Select value={methodFilter} onValueChange={setMethodFilter}><SelectTrigger className="w-full"><SelectValue placeholder="All methods" /></SelectTrigger><SelectContent><SelectItem value="ALL">All methods</SelectItem>{paymentMethods.map((method) => <SelectItem key={method} value={method}>{label(method)}</SelectItem>)}</SelectContent></Select></div></div>
          {rangeInvalid ? <ErrorState message="The start date must be on or before the end date." /> : expensesQuery.isPending ? <LoadingState /> : expensesQuery.error ? <ErrorState message={expensesQuery.error.message} /> : visibleExpenses.length ? <div className="mt-4"><DataTable rows={visibleExpenses} columns={[
{ id: "date", header: "Date / voucher", cell: (expense) => <><p className="font-medium text-foreground">{formatDate(expense.date)}</p><p className="mt-1 text-xs text-muted-foreground">{expense.voucherNumber || expense.referenceNumber || "No voucher"}</p></>, value: (expense) => expense.date },
{ id: "description", header: "Description / payee", cell: (expense) => <><p className="font-medium text-foreground">{expense.description}</p><p className="mt-1 truncate text-xs text-muted-foreground">{expense.payee ? `Payee: ${expense.payee}` : "Payee not specified"}</p></>, value: (expense) => [expense.description, expense.payee].filter(Boolean).join(" ") },
{ id: "category", header: "Category", cell: (expense) => <><span>{expense.registryCategory?.name ?? expense.customCategory?.name ?? label(expense.category)}</span><p className="mt-1 text-[10px] text-muted-foreground">{label(expense.category)}</p></>, value: (expense) => expense.registryCategory?.name ?? expense.customCategory?.name ?? label(expense.category) },
{ id: "method", header: "Method", cell: (expense) => <><span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold">{label(expense.paymentMethod)}</span>{expense.checkNumber && <p className="mt-1 text-[10px] text-muted-foreground">Cheque {expense.checkNumber}</p>}</>, value: (expense) => expense.paymentMethod },
{ id: "amount", header: "Amount", cell: (expense) => currency(Number(expense.amount)), value: (expense) => Number(expense.amount), className: "text-right font-semibold tabular-nums" },
{ id: "actions", header: "Actions", cell: (expense) => <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => setSelectedExpense(expense)}>Details / voucher</button>, sortable: false }
] satisfies DataTableColumn<ExpenseRecord>[]} getRowId={(expense) => expense.id} emptyTitle="No expenses" emptyDescription="No expenses match these filters." exportTitle="Expenses" searchable={false} embedded /><p className="mt-3 text-right text-xs font-semibold text-muted-foreground">Filtered total: <span className="font-bold text-foreground">{currency(visibleExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0))}</span></p></div> : <EmptyState title="No expenses found" description="Adjust the dates or filters, or record the first expense for this period." onAction={() => { setDraft(freshDraft()); setShowExpenseForm(true); }} />}
        </div>
        <aside className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"><h2 className="font-semibold text-foreground">Spending by category</h2><p className="mt-1 text-xs text-muted-foreground">Based on records in the selected dates.</p>{expensesQuery.isPending ? <LoadingState /> : groupedCategories.length ? <div className="mt-4 space-y-4">{groupedCategories.slice(0, 8).map(([name, total]) => <div key={name}><div className="flex items-start justify-between gap-3 text-sm"><span className="min-w-0 break-words text-foreground">{name}</span><span className="shrink-0 font-semibold tabular-nums text-foreground">{currency(total)}</span></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${periodTotal > 0 ? Math.min(100, total / periodTotal * 100) : 0}%` }} /></div></div>)}</div> : <p className="mt-4 rounded-xl bg-muted/30 p-4 text-sm text-muted-foreground">Category totals will appear when expenses are recorded.</p>}</aside>
      </section>

      {showExpenseForm && <Modal title="Record school expense" description="Expense entries are retained as accounting records. Check the details before saving." onClose={() => !createExpense.isPending && setShowExpenseForm(false)}>
        <form className="space-y-4" onSubmit={submitExpense}>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Transaction date"><input type="date" required className={fieldClass} value={draft.date} onChange={(event) => updateDraft("date", event.target.value)} /></Field><Field label="Amount (GHS)"><input type="number" required min="0.01" step="0.01" className={fieldClass} value={draft.amount} onChange={(event) => updateDraft("amount", event.target.value)} placeholder="0.00" /></Field></div>
          <Field label="Description"><input required minLength={3} maxLength={500} className={fieldClass} value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} placeholder="e.g. Electricity bill for October" /></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Payee / beneficiary (optional)"><input maxLength={200} className={fieldClass} value={draft.payee} onChange={(event) => updateDraft("payee", event.target.value)} placeholder="Supplier or recipient" /></Field><Field label="Expense category"><Select value={draft.registryCategoryId || "none"} onValueChange={(value) => updateDraft("registryCategoryId", value === "none" ? "" : value)}><SelectTrigger className="w-full"><SelectValue placeholder="Choose category" /></SelectTrigger><SelectContent><SelectItem value="none">Uncategorised</SelectItem>{categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select></Field></div>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Accounting group"><Select value={draft.category} onValueChange={(value) => updateDraft("category", value)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{accountingGroups.map((group) => <SelectItem key={group} value={group}>{label(group)}</SelectItem>)}</SelectContent></Select></Field><Field label="Payment method"><Select value={draft.paymentMethod} onValueChange={(value) => updateDraft("paymentMethod", value)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{paymentMethods.map((method) => <SelectItem key={method} value={method}>{label(method)}</SelectItem>)}</SelectContent></Select></Field></div>
          <div className="grid gap-4 sm:grid-cols-3"><Field label="Voucher number"><input maxLength={120} className={fieldClass} value={draft.voucherNumber} onChange={(event) => updateDraft("voucherNumber", event.target.value)} placeholder="e.g. PV-2026-001" /></Field><Field label="Cheque number"><input maxLength={120} className={fieldClass} value={draft.checkNumber} onChange={(event) => updateDraft("checkNumber", event.target.value)} placeholder="Optional" /></Field><Field label="Reference / transaction ID"><input maxLength={120} className={fieldClass} value={draft.referenceNumber} onChange={(event) => updateDraft("referenceNumber", event.target.value)} placeholder="Optional" /></Field></div>
          <div className="rounded-xl bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">The saved record will include the creator and current academic period where configured. Financial entries cannot be edited or deleted from this screen, preserving the transaction trail.</div>
          {createExpense.error && <ErrorState message={createExpense.error.message} />}
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4"><button type="button" className={secondaryButton} onClick={() => setShowExpenseForm(false)} disabled={createExpense.isPending}>Cancel</button><button type="submit" className={primaryButton} disabled={createExpense.isPending}>{createExpense.isPending && <LoaderCircle className="size-4 animate-spin" />} Save expense</button></div>
        </form>
      </Modal>}

      {showCategoryManager && <Modal title="Expenditure categories" description="Create and maintain categories reused by the expense register." onClose={() => setShowCategoryManager(false)}>
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); createCategory.mutate({ name: categoryName.trim(), description: categoryDescription.trim() || undefined }); }}>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Category name"><input required minLength={2} maxLength={120} className={fieldClass} value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="e.g. School repairs" /></Field><Field label="Description (optional)"><input maxLength={500} className={fieldClass} value={categoryDescription} onChange={(event) => setCategoryDescription(event.target.value)} placeholder="Short description" /></Field></div>
          {createCategory.error && <ErrorState message={createCategory.error.message} />}
          <div className="flex justify-end"><button type="submit" className={primaryButton} disabled={createCategory.isPending || categoryName.trim().length < 2}>{createCategory.isPending && <LoaderCircle className="size-4 animate-spin" />} Add category</button></div>
        </form>
        <div className="mt-5 border-t border-border pt-4"><h3 className="text-sm font-semibold text-foreground">Saved categories ({categories.length})</h3>{categoriesQuery.isPending ? <LoadingState /> : categoriesQuery.error ? <ErrorState message={categoriesQuery.error.message} /> : categories.length ? <div className="mt-3 divide-y divide-border">{categories.map((category) => editingCategory?.id === category.id ? <form key={category.id} className="grid gap-2 py-3" onSubmit={(event) => { event.preventDefault(); updateCategory.mutate({ id: category.id, name: editingName.trim(), description: editingDescription.trim() || undefined }); }}><Field label="Name"><input className={fieldClass} required minLength={2} value={editingName} onChange={(event) => setEditingName(event.target.value)} /></Field><Field label="Description"><input className={fieldClass} value={editingDescription} onChange={(event) => setEditingDescription(event.target.value)} /></Field><div className="flex justify-end gap-2"><button type="button" className={secondaryButton} onClick={() => setEditingCategory(null)}>Cancel</button><button type="submit" className={primaryButton} disabled={updateCategory.isPending}>Save changes</button></div>{updateCategory.error && <ErrorState message={updateCategory.error.message} />}</form> : <div key={category.id} className="flex items-start justify-between gap-3 py-3"><div className="min-w-0"><p className="text-sm font-medium text-foreground">{category.name}</p>{category.description && <p className="mt-1 text-xs text-muted-foreground">{category.description}</p>}</div><button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => { setEditingCategory(category); setEditingName(category.name); setEditingDescription(category.description ?? ""); }}>Edit</button></div>)}</div> : <p className="mt-3 text-sm text-muted-foreground">No categories saved yet.</p>}</div>
      </Modal>}

      {selectedExpense && <Modal title="Expense voucher" description="Saved expense details and accounting references." onClose={() => setSelectedExpense(null)}>
        <section className="expense-voucher-print rounded-xl border border-border p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4"><div><p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">SchoolHub · Payment voucher</p><h2 className="mt-1 text-xl font-bold text-foreground">{selectedExpense.voucherNumber || `Expense ${selectedExpense.id.slice(-8).toUpperCase()}`}</h2><p className="mt-1 text-sm text-muted-foreground">{formatDate(selectedExpense.date)}</p></div><div className="text-right"><p className="text-xs text-muted-foreground">Amount paid</p><p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{currency(Number(selectedExpense.amount))}</p></div></div>
          <div className="grid gap-x-6 gap-y-4 py-4 sm:grid-cols-2"><Detail label="Description" value={selectedExpense.description} /><Detail label="Payee / beneficiary" value={selectedExpense.payee} /><Detail label="Expense category" value={selectedExpense.registryCategory?.name ?? selectedExpense.customCategory?.name ?? label(selectedExpense.category)} /><Detail label="Accounting group" value={label(selectedExpense.category)} /><Detail label="Payment method" value={label(selectedExpense.paymentMethod)} /><Detail label="Cheque number" value={selectedExpense.checkNumber} /><Detail label="Reference" value={selectedExpense.referenceNumber} /><Detail label="Recorded by" value={selectedExpense.recordedBy?.name} /></div>
          <div className="border-t border-border pt-4"><p className="text-xs text-muted-foreground">This voucher reflects the saved expense record. It is not proof of a bank transfer unless supported by the reference shown above.</p><div className="mt-8 grid grid-cols-2 gap-8 text-xs text-muted-foreground"><div className="border-t border-border pt-2">Prepared by</div><div className="border-t border-border pt-2">Authorised by</div></div></div>
        </section>
        <div className="expense-voucher-actions mt-4 flex flex-wrap justify-end gap-2"><TableExportMenu build={() => ({ title: "Expense voucher " + (selectedExpense.voucherNumber || selectedExpense.id), headers: ["Field", "Value"], rows: [["Voucher", selectedExpense.voucherNumber || selectedExpense.id], ["Date", formatDate(selectedExpense.date)], ["Description", selectedExpense.description], ["Payee", selectedExpense.payee ?? ""], ["Category", selectedExpense.registryCategory?.name ?? selectedExpense.customCategory?.name ?? ""], ["Amount (GHS)", Number(selectedExpense.amount)], ["Method", selectedExpense.paymentMethod], ["Reference", selectedExpense.referenceNumber ?? ""]], columnTypes: ["text", "text"], reportInfo: { period: formatDate(selectedExpense.date) } })} /><button type="button" className={primaryButton} onClick={() => window.print()}><Printer className="size-4" /> Print / Save PDF</button></div>
      </Modal>}
    </div>
  );
}

function Metric({ label: title, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Wallet }) {
  return <div className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-muted-foreground">{title}</p><Icon className="size-4 text-primary" /></div><p className="mt-3 text-2xl font-bold tracking-tight text-foreground">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
}
function Field({ label: title, children }: { label: string; children: ReactNode }) {
  return <label className="grid min-w-0 gap-1.5 text-sm font-medium text-foreground"><span>{title}</span>{children}</label>;
}
function Modal({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/70 p-3 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-label={title} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl sm:p-6"><div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div><button type="button" onClick={onClose} aria-label="Close dialog" className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><X className="size-4" /></button></div>{children}</section></div>;
}
function ErrorState({ message }: { message: string }) { return <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{message}</div>; }
function LoadingState() { return <div className="flex items-center justify-center gap-2 rounded-xl border border-border py-8 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading expenses…</div>; }
function EmptyState({ title, description, onAction }: { title: string; description: string; onAction: () => void }) { const { canWrite } = useFinanceAccess(); return <div className="py-12 text-center"><FileText className="mx-auto size-8 text-muted-foreground" /><h3 className="mt-3 font-semibold text-foreground">{title}</h3><p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">{description}</p>{canWrite && <button className={cn(primaryButton, "mt-4")} onClick={onAction}><Plus className="size-4" />Record an expense</button>}</div>; }
function Detail({ label, value }: { label: string; value?: string | null }) { return <div className="rounded-xl border border-border p-3"><p className="text-xs font-semibold text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm text-foreground">{value || "—"}</p></div>; }
