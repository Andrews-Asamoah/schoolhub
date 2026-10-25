import { TableExportMenu } from "@/components/ui/data-table";
import { ServerExportButton } from "@/components/portal/server-export-button";
import { useCanExportPayrollTables } from "@/lib/table-export-policy";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, BadgeCheck, CalendarClock, CheckCircle2, FileText, LoaderCircle, PlayCircle, Printer, Wallet, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FinanceReadOnlyNotice, useFinanceAccess } from "@/components/portal/finance-access";

type PayrollStatus = "DRAFT" | "APPROVED" | "PAID" | "CANCELLED";
type PaymentMethod = "CASH" | "BANK_TRANSFER" | "CHEQUE" | "MOBILE_MONEY" | "CARD" | "ONLINE" | "OTHER";
interface PersonName {
  firstName?: string | null;
  lastName?: string | null;
}
interface Payslip {
  id: string;
  staffId?: string | null;
  teacherId?: string | null;
  basicSalary: number | string;
  allowances: number | string;
  grossSalary: number | string;
  ssnitEmployee: number | string;
  ssnitEmployer: number | string;
  incomeTax: number | string;
  otherDeductions: number | string;
  netSalary: number | string;
  paymentMethod: PaymentMethod;
  paymentStatus: string;
  paidAt?: string | null;
  staff?: { staffId: string; profile?: PersonName | null } | null;
  teacher?: { teacherId: string; profile?: PersonName | null } | null;
}
interface PayrollRecord {
  id: string;
  month: number;
  year: number;
  status: PayrollStatus;
  totalGross: number | string;
  totalNet: number | string;
  totalTax: number | string;
  totalSSNIT: number | string;
  createdAt: string;
  payslips: Payslip[];
  _count?: { payslips: number };
}
interface SalaryPerson {
  id: string;
  type: "TEACHER" | "STAFF";
  identifier: string;
  name: string;
  monthlySalary: number | string | null;
}
interface GenerateResponse {
  payrollRecord: PayrollRecord;
  includedCount: number;
  excludedCount: number;
}
interface TransitionTarget {
  payroll: PayrollRecord;
  nextStatus: "APPROVED" | "PAID" | "CANCELLED";
}
const money = (value: number | string) => new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
const monthName = (month: number, year: number) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
const statusTone = (status: string) => status === "PAID" ? "bg-success/10 text-success" : status === "APPROVED" ? "bg-primary/10 text-primary" : status === "CANCELLED" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-foreground";
const fieldClass = "h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/30";
const primaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";
function personName(payslip: Payslip) {
  const profile = payslip.staff?.profile ?? payslip.teacher?.profile;
  const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ").trim();
  return name || (payslip.teacherId ? payslip.teacher?.teacherId : payslip.staff?.staffId) || "Unlinked employee";
}
export function PayrollManagementWorkspace() {
  const { canWrite } = useFinanceAccess();
  const canExportPayroll = useCanExportPayrollTables();
  const queryClient = useQueryClient();
  const [showGenerate, setShowGenerate] = useState(false);
  const [month, setMonth] = useState(String(Math.max(9, Math.min(12, new Date().getMonth() + 1))));
  const [taxConfirmed, setTaxConfirmed] = useState(false);
  const [transitionTarget, setTransitionTarget] = useState<TransitionTarget | null>(null);
  const [paidConfirmation, setPaidConfirmation] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("BANK_TRANSFER");
  const [selectedDetail, setSelectedDetail] = useState<PayrollRecord | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [salarySearch, setSalarySearch] = useState("");
  const [salaryTarget, setSalaryTarget] = useState<SalaryPerson | null>(null);
  const [salaryDraft, setSalaryDraft] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const salaryRegisterQuery = useQuery({
    queryKey: ["finance", "payroll-salaries"],
    queryFn: () => apiFetch<SalaryPerson[]>("/finance/payroll/salaries"),
    retry: false,
  });
  const payrollQuery = useQuery({
    queryKey: ["finance", "payroll"],
    queryFn: () => apiFetch<PayrollRecord[]>("/finance/payroll"),
    retry: false,
  });
  const payroll = payrollQuery.data ?? [];
  const salaryRegister = salaryRegisterQuery.data ?? [];
  const filteredSalaryRegister = useMemo(() => {
    const term = salarySearch.trim().toLowerCase();
    return salaryRegister.filter(person => !term ||
      person.name.toLowerCase().includes(term) ||
      person.identifier.toLowerCase().includes(term) ||
      person.type.toLowerCase().includes(term));
  }, [salaryRegister, salarySearch]);
  const salaryMissingCount = salaryRegister.filter(person => !(Number(person.monthlySalary) > 0)).length;
  const visiblePayroll = useMemo(() => payroll.filter(record => {
    const term = search.trim().toLowerCase();
    const textMatch = !term || monthName(record.month, record.year).toLowerCase().includes(term) || String(record.year).includes(term);
    return textMatch && (statusFilter === "ALL" || record.status === statusFilter);
  }), [payroll, search, statusFilter]);
  const draftCount = payroll.filter(record => record.status === "DRAFT").length;
  const approvedCount = payroll.filter(record => record.status === "APPROVED").length;
  const paidNetTotal = payroll.filter(record => record.status === "PAID").reduce((sum, record) => sum + Number(record.totalNet), 0);

  const generatePayroll = useMutation({
    mutationFn: (payload: { month: number; year: 2026; confirmResidentTaxTreatment: true }) =>
      apiFetch<GenerateResponse>("/finance/payroll", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: async (result) => {
      setFeedback({ kind: "success", text: `Draft created for ${result.includedCount} employees. ${result.excludedCount} active employee(s) without a positive monthly salary were excluded.` });
      setShowGenerate(false);
      setTaxConfirmed(false);
      await queryClient.invalidateQueries({ queryKey: ["finance", "payroll"] });
    },
    onError: (error: Error) => setFeedback({ kind: "error", text: error.message }),
  });
  const updateSalary = useMutation({
    mutationFn: ({ person, monthlySalary }: { person: SalaryPerson; monthlySalary: number }) =>
      apiFetch<{ id: string; type: string; monthlySalary: number }>(
        `/finance/payroll/salaries/${person.type}/${encodeURIComponent(person.id)}`,
        { method: "PATCH", body: JSON.stringify({ monthlySalary }) },
      ),
    onSuccess: async (_result, variables) => {
      setFeedback({ kind: "success", text: `Monthly salary updated for ${variables.person.name}. New payroll drafts will use this value.` });
      setSalaryTarget(null);
      setSalaryDraft("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["finance", "payroll-salaries"] }),
        queryClient.invalidateQueries({ queryKey: ["finance", "payroll"] }),
      ]);
    },
    onError: (error: Error) => setFeedback({ kind: "error", text: error.message }),
  });
  const updatePayroll = useMutation({
    mutationFn: (input: TransitionTarget & { paymentMethod?: PaymentMethod }) =>
      apiFetch<PayrollRecord>(`/finance/payroll/${encodeURIComponent(input.payroll.id)}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: input.nextStatus, ...(input.nextStatus === "PAID" ? { paymentMethod: input.paymentMethod } : {}) }),
      }),
    onSuccess: async (_record, variables) => {
      const actionText = variables.nextStatus === "APPROVED" ? "Payroll approved for payment." : variables.nextStatus === "PAID" ? "Payroll marked paid and payslips marked completed." : "Draft payroll cancelled.";
      setFeedback({ kind: "success", text: actionText });
      setTransitionTarget(null);
      setPaidConfirmation(false);
      await queryClient.invalidateQueries({ queryKey: ["finance", "payroll"] });
    },
    onError: (error: Error) => setFeedback({ kind: "error", text: error.message }),
  });

  function submitSalary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!salaryTarget) return;
    const amount = Number(salaryDraft);
    if (salaryDraft.trim() === "" || !Number.isFinite(amount) || amount < 0 || amount > 10000000) {
      setFeedback({ kind: "error", text: "Enter a valid non-negative monthly salary in GHS." });
      return;
    }
    updateSalary.mutate({ person: salaryTarget, monthlySalary: Math.round((amount + Number.EPSILON) * 100) / 100 });
  }
  const buildSalaryRegisterExport = () => ({
    title: "Salary register",
    headers: ["Employee", "Employee reference", "Type", "Monthly salary (GHS)", "Payroll eligible"],
    columnTypes: ["text", "text", "text", "money", "text"],
    rows: salaryRegister.map(person => [person.name, person.identifier, person.type, person.monthlySalary == null ? null : Number(person.monthlySalary), Number(person.monthlySalary) > 0 ? "Yes" : "No"]),
    totals: ["Total", "", "", null, ""],
    confidential: true,
    reportInfo: { period: "Current salary register", filters: { search: salarySearch } },
  });

  function submitGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!taxConfirmed) {
      setFeedback({ kind: "error", text: "Confirm the tax treatment before generating a payroll draft." });
      return;
    }
    generatePayroll.mutate({ month: Number(month), year: 2026, confirmResidentTaxTreatment: true });
  }
  const buildPayrollRegisterExport = () => ({
    title: "Payroll register",
    headers: ["Period", "Run status", "Employee", "Employee ID", "Basic (GHS)", "Employee SSNIT (GHS)", "PAYE (GHS)", "Employer SSNIT (GHS)", "Net (GHS)", "Payment status"],
    columnTypes: ["text", "text", "text", "text", "money", "money", "money", "money", "money", "text"],
    rows: visiblePayroll.flatMap(run => run.payslips.map(slip => [
      monthName(run.month, run.year), run.status, personName(slip), slip.staff?.staffId ?? slip.teacher?.teacherId ?? "",
      Number(slip.basicSalary), Number(slip.ssnitEmployee), Number(slip.incomeTax), Number(slip.ssnitEmployer), Number(slip.netSalary), slip.paymentStatus,
    ])),
    totals: ["Total", "", "", "", null, null, null, null, null, ""],
    confidential: true,
    reportInfo: { period: "Selected payroll runs" },
  });

  return <div className="mx-auto w-full min-w-0 max-w-screen-2xl space-y-6">
    <style>{`@media print {
      body * { visibility: hidden !important; }
      .payroll-slips-print, .payroll-slips-print * { visibility: visible !important; }
      .payroll-slips-print { position: absolute !important; top: 0 !important; left: 0 !important; width: 100% !important; max-width: none !important; margin: 0 !important; padding: 8px !important; border: 0 !important; box-shadow: none !important; background: white !important; color: black !important; overflow: visible !important; }
      .payroll-slips-print table { min-width: 0 !important; width: 100% !important; table-layout: fixed !important; font-size: 7pt !important; }
      .payroll-slips-print th, .payroll-slips-print td { color: black !important; padding: 3px !important; border-color: #bbb !important; overflow-wrap: anywhere !important; }
      .payroll-slips-actions { display: none !important; }
      @page { size: A4 landscape; margin: 8mm; }
    }`}</style>
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between sm:p-6">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Finance & bursary</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">Payroll</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Generate payroll drafts from employee salary records, review statutory deductions, approve runs and record confirmed disbursements.</p></div>
      <div className="flex flex-wrap gap-2">{canExportPayroll && <><TableExportMenu build={buildPayrollRegisterExport} note="Confidential payroll data. Export access is restricted." /><ServerExportButton endpoint="/finance/exports/payroll.xlsx" label="All-run Excel" className={secondaryButton} /></>}{canWrite && <button type="button" className={primaryButton} onClick={() => { setFeedback(null); setShowGenerate(true); }}><PlayCircle className="size-4" /> Generate payroll draft</button>}</div>
    </section>
    {!canWrite && <FinanceReadOnlyNotice />}
    {feedback && <div role={feedback.kind === "error" ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-xl border p-3 text-sm", feedback.kind === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-success/30 bg-success/5 text-foreground")}><span className="min-w-0 flex-1">{feedback.text}</span><button type="button" aria-label="Dismiss message" onClick={() => setFeedback(null)}><X className="size-4" /></button></div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Drafts to review" value={payrollQuery.isPending ? "—" : String(draftCount)} detail="Awaiting accountant approval" icon={FileText} />
      <Metric label="Approved runs" value={payrollQuery.isPending ? "—" : String(approvedCount)} detail="Ready for disbursement" icon={BadgeCheck} />
      <Metric label="Paid runs" value={payrollQuery.isPending ? "—" : String(payroll.filter(record => record.status === "PAID").length)} detail="Recorded as disbursed" icon={CheckCircle2} />
      <Metric label="Net paid total" value={payrollQuery.isPending ? "—" : money(paidNetTotal)} detail="Across the listed payroll runs" icon={Wallet} />
    </div>

    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 className="text-lg font-semibold text-foreground">Salary register</h2><p className="mt-1 text-sm text-muted-foreground">Manage the monthly base salary used when creating new payroll drafts. Updating a salary does not alter already saved payroll runs.</p></div>
        {canExportPayroll && <><TableExportMenu build={buildSalaryRegisterExport} note="Confidential salary data. Export access is restricted." /><ServerExportButton endpoint="/finance/exports/salaries.xlsx" label="Full salary Excel" className={secondaryButton} /></>}
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1"><label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Search employee</label><input className={fieldClass} value={salarySearch} onChange={event => setSalarySearch(event.target.value)} placeholder="Search by name, ID, or staff type…" /></div>
        <div className="rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground"><strong className="text-foreground">{salaryMissingCount}</strong> active employee(s) missing a positive salary</div>
      </div>
      {salaryRegisterQuery.isPending ? <LoadingState /> : salaryRegisterQuery.error ? <ErrorState message={salaryRegisterQuery.error.message} /> : filteredSalaryRegister.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="p-3">Employee</th><th className="p-3">Type</th><th className="p-3 text-right">Monthly salary</th><th className="p-3">Payroll readiness</th><th className="p-3"></th></tr></thead><tbody>{filteredSalaryRegister.map(person => { const ready = Number(person.monthlySalary) > 0; return <tr key={person.type + person.id} className="border-b border-border/70 last:border-0"><td className="p-3"><p className="font-semibold text-foreground">{person.name}</p><p className="mt-1 text-xs text-muted-foreground">{person.identifier}</p></td><td className="p-3">{person.type === "TEACHER" ? "Teacher" : "Staff"}</td><td className="p-3 text-right font-semibold tabular-nums">{ready ? money(Number(person.monthlySalary)) : "Not configured"}</td><td className="p-3"><span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold", ready ? "bg-success/10 text-success" : "bg-warning/10 text-foreground")}>{ready ? "READY" : "NEEDS SALARY"}</span></td><td className="p-3 text-right">{canWrite && <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => { setFeedback(null); setSalaryTarget(person); setSalaryDraft(person.monthlySalary == null ? "" : String(person.monthlySalary)); }}>Edit salary</button>}</td></tr>; })}</tbody></table></div> : <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{salarySearch ? "No employees match your search." : "No active teachers or staff records are available for payroll."}</div>}
    </section>

    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1"><label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Search payroll periods</label><input className={fieldClass} value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by month or year…" /></div>
        <div className="sm:w-48"><label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Status</label><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">All statuses</SelectItem>{(["DRAFT","APPROVED","PAID","CANCELLED"] as const).map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
      </div>
      {payrollQuery.isPending ? <LoadingState /> : payrollQuery.error ? <ErrorState message={payrollQuery.error.message} /> : visiblePayroll.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[860px] text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="p-3">Payroll period</th><th className="p-3">Status</th><th className="p-3 text-right">Employees</th><th className="p-3 text-right">Gross</th><th className="p-3 text-right">PAYE</th><th className="p-3 text-right">Net</th><th className="p-3">Actions</th></tr></thead><tbody>{visiblePayroll.map(run => <tr key={run.id} className="border-b border-border/70 last:border-0 hover:bg-muted/30"><td className="p-3"><p className="font-semibold text-foreground">{monthName(run.month, run.year)}</p><p className="mt-1 text-xs text-muted-foreground">SSNIT: {money(run.totalSSNIT)}</p></td><td className="p-3"><span className={cn("inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold", statusTone(run.status))}>{run.status}</span></td><td className="p-3 text-right tabular-nums">{run._count?.payslips ?? run.payslips.length}</td><td className="p-3 text-right tabular-nums">{money(run.totalGross)}</td><td className="p-3 text-right tabular-nums">{money(run.totalTax)}</td><td className="p-3 text-right font-semibold tabular-nums">{money(run.totalNet)}</td><td className="p-3"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setSelectedDetail(run)} className="text-xs font-semibold text-primary hover:underline">Review slips</button>{canWrite && run.status === "DRAFT" && <button type="button" onClick={() => setTransitionTarget({ payroll: run, nextStatus: "APPROVED" })} className="text-xs font-semibold text-foreground hover:underline">Approve</button>}{canWrite && run.status === "APPROVED" && <button type="button" onClick={() => { setPaidConfirmation(false); setPaymentMethod("BANK_TRANSFER"); setTransitionTarget({ payroll: run, nextStatus: "PAID" }); }} className="text-xs font-semibold text-primary hover:underline">Confirm paid</button>}{canWrite && run.status === "DRAFT" && <button type="button" onClick={() => setTransitionTarget({ payroll: run, nextStatus: "CANCELLED" })} className="text-xs font-semibold text-destructive hover:underline">Cancel</button>}</div></td></tr>)}</tbody></table></div> : <EmptyState title="No payroll runs yet" description="Generate a draft for a supported period after confirming employee salary and tax details." />}
    </section>

    {salaryTarget && <Modal title="Update monthly salary" description={`${salaryTarget.name} · ${salaryTarget.type === "TEACHER" ? "Teacher" : "Staff"}`} onClose={() => !updateSalary.isPending && setSalaryTarget(null)}>
      <form className="space-y-4" onSubmit={submitSalary}>
        <div className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">This value is used for future payroll drafts only. Saved or approved payroll runs will not be recalculated.</div>
        <Field label="Monthly base salary (GHS)"><input type="number" min="0" max="10000000" step="0.01" required className={fieldClass} value={salaryDraft} onChange={event => setSalaryDraft(event.target.value)} placeholder="0.00" /></Field>
        {updateSalary.error && <ErrorState message={updateSalary.error.message} />}
        <div className="flex justify-end gap-2 border-t border-border pt-4"><button type="button" className={secondaryButton} onClick={() => setSalaryTarget(null)} disabled={updateSalary.isPending}>Cancel</button><button type="submit" className={primaryButton} disabled={updateSalary.isPending}>{updateSalary.isPending && <LoaderCircle className="size-4 animate-spin" />}Save salary</button></div>
      </form>
    </Modal>}
    {showGenerate && <Modal title="Generate payroll draft" description="Build a draft payroll from the school's active staff and teacher monthly salary values." onClose={() => !generatePayroll.isPending && setShowGenerate(false)}>
      <form onSubmit={submitGenerate} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Payroll month"><Select value={month} onValueChange={setMonth}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{[9,10,11,12].map(value => <SelectItem key={value} value={String(value)}>{new Date(Date.UTC(2026,value-1,1)).toLocaleDateString("en-GB",{month:"long",timeZone:"UTC"})}</SelectItem>)}</SelectContent></Select></Field><Field label="Year"><input disabled value="2026" className={cn(fieldClass,"opacity-70")} /></Field></div>
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4"><div className="flex gap-2"><AlertCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div><p className="text-sm font-semibold text-foreground">Payroll calculation assumptions</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Uses GRA resident PAYE monthly bands effective 1 September 2026. It calculates from each person's stored monthly salary only; allowances, overtime, non-resident tax treatment and other deductions are not stored in this version. Employees without a positive salary are excluded. Review each draft before approving.</p></div></div></div>
        <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm"><input type="checkbox" className="mt-1 size-4 accent-primary" checked={taxConfirmed} onChange={event => setTaxConfirmed(event.target.checked)} /><span className="leading-5 text-foreground">I have verified employee salary inputs and confirm the resident PAYE schedule is appropriate for every employee included in this draft.</span></label>
        {generatePayroll.error && <ErrorState message={generatePayroll.error.message} />}
        <div className="flex justify-end gap-2 border-t border-border pt-4"><button type="button" className={secondaryButton} onClick={() => setShowGenerate(false)} disabled={generatePayroll.isPending}>Cancel</button><button type="submit" className={primaryButton} disabled={generatePayroll.isPending || !taxConfirmed}>{generatePayroll.isPending && <LoaderCircle className="size-4 animate-spin" />} Generate draft</button></div>
      </form>
    </Modal>}

    {transitionTarget && <Modal title={transitionTarget.nextStatus === "APPROVED" ? "Approve payroll" : transitionTarget.nextStatus === "PAID" ? "Confirm payroll disbursement" : "Cancel draft payroll"} description={monthName(transitionTarget.payroll.month, transitionTarget.payroll.year)} onClose={() => !updatePayroll.isPending && setTransitionTarget(null)}>
      <div className="space-y-4"><div className="grid grid-cols-2 gap-3"><Summary label="Gross" value={money(transitionTarget.payroll.totalGross)} /><Summary label="Net to employees" value={money(transitionTarget.payroll.totalNet)} /><Summary label="PAYE" value={money(transitionTarget.payroll.totalTax)} /><Summary label="Total SSNIT" value={money(transitionTarget.payroll.totalSSNIT)} /></div>
        {transitionTarget.nextStatus === "APPROVED" && <p className="text-sm leading-6 text-muted-foreground">Review the employee payslips before approval. This records the payroll as approved; it does not issue a payment.</p>}
        {transitionTarget.nextStatus === "CANCELLED" && <p className="text-sm leading-6 text-muted-foreground">Only draft runs can be cancelled. The saved payslip data will remain attached to the cancelled record for traceability.</p>}
        {transitionTarget.nextStatus === "PAID" && <><Field label="Disbursement method"><Select value={paymentMethod} onValueChange={value => setPaymentMethod(value as PaymentMethod)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{(["BANK_TRANSFER","CHEQUE","MOBILE_MONEY","CASH","CARD","ONLINE","OTHER"] as const).map(method => <SelectItem key={method} value={method}>{method.replaceAll("_"," ")}</SelectItem>)}</SelectContent></Select></Field><label className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm"><input type="checkbox" className="mt-1 size-4 accent-primary" checked={paidConfirmation} onChange={event => setPaidConfirmation(event.target.checked)} /><span className="leading-5">I confirm the salaries have actually been disbursed or paid outside SchoolHub. This only records the status; it does not transfer funds.</span></label></>}
        {updatePayroll.error && <ErrorState message={updatePayroll.error.message} />}
        <div className="flex justify-end gap-2 border-t border-border pt-4"><button type="button" className={secondaryButton} onClick={() => setTransitionTarget(null)} disabled={updatePayroll.isPending}>Back</button><button type="button" className={primaryButton} disabled={updatePayroll.isPending || (transitionTarget.nextStatus === "PAID" && !paidConfirmation)} onClick={() => updatePayroll.mutate({ ...transitionTarget, ...(transitionTarget.nextStatus === "PAID" ? { paymentMethod } : {}) })}>{updatePayroll.isPending && <LoaderCircle className="size-4 animate-spin" />}{transitionTarget.nextStatus === "APPROVED" ? "Approve payroll" : transitionTarget.nextStatus === "PAID" ? "Confirm paid" : "Cancel draft"}</button></div>
      </div>
    </Modal>}

    {selectedDetail && <Modal title={`Payslips · ${monthName(selectedDetail.month, selectedDetail.year)}`} description="Review salary values and recorded deductions before approving payroll." onClose={() => setSelectedDetail(null)}>
      <div className="payroll-slips-print overflow-x-auto"><div className="mb-3 grid gap-2 sm:grid-cols-3"><Summary label="Employees" value={String(selectedDetail.payslips.length)} /><Summary label="Gross" value={money(selectedDetail.totalGross)} /><Summary label="Net" value={money(selectedDetail.totalNet)} /></div><table className="w-full min-w-[850px] text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="p-2">Employee</th><th className="p-2 text-right">Basic</th><th className="p-2 text-right">Employee SSNIT</th><th className="p-2 text-right">PAYE</th><th className="p-2 text-right">Employer SSNIT</th><th className="p-2 text-right">Net</th><th className="p-2">Status</th><th className="p-2">PDF</th></tr></thead><tbody>{selectedDetail.payslips.map(slip => <tr key={slip.id} className="border-b border-border/70"><td className="p-2"><p className="font-medium text-foreground">{personName(slip)}</p><p className="text-[10px] text-muted-foreground">{slip.staff?.staffId ?? slip.teacher?.teacherId ?? ""}</p></td><td className="p-2 text-right tabular-nums">{money(slip.basicSalary)}</td><td className="p-2 text-right tabular-nums">{money(slip.ssnitEmployee)}</td><td className="p-2 text-right tabular-nums">{money(slip.incomeTax)}</td><td className="p-2 text-right tabular-nums">{money(slip.ssnitEmployer)}</td><td className="p-2 text-right font-semibold tabular-nums">{money(slip.netSalary)}</td><td className="p-2 text-xs">{slip.paymentStatus}</td><td className="p-2"><ServerExportButton endpoint={"/finance/payslips/" + encodeURIComponent(slip.id) + ".pdf"} label="PDF" className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-semibold text-foreground" /></td></tr>)}</tbody></table><p className="mt-4 text-xs leading-5 text-muted-foreground">These are draft amounts from saved monthly salary data. Allowances, overtime and other deductions are not included in this version.</p></div>
      <div className="payroll-slips-actions mt-4 flex justify-end gap-2"><ServerExportButton endpoint={`/finance/payroll/${encodeURIComponent(selectedDetail.id)}/payslips.pdf`} label="Whole-run PDF" className={secondaryButton} /><TableExportMenu build={() => ({ title: "Payslips " + monthName(selectedDetail.month, selectedDetail.year), headers: ["Employee","Employee ID","Basic (GHS)","Employee SSNIT (GHS)","PAYE (GHS)","Employer SSNIT (GHS)","Net (GHS)","Payment status"], columnTypes: ["text","text","money","money","money","money","money","text"], rows: selectedDetail.payslips.map(slip => [personName(slip),slip.staff?.staffId ?? slip.teacher?.teacherId ?? "",Number(slip.basicSalary),Number(slip.ssnitEmployee),Number(slip.incomeTax),Number(slip.ssnitEmployer),Number(slip.netSalary),slip.paymentStatus]), totals: ["Total","","",null,null,null,null,""], confidential: true, reportInfo: { period: monthName(selectedDetail.month, selectedDetail.year) } })} note="Confidential payslip data." /><button type="button" className={primaryButton} onClick={() => window.print()}><Printer className="size-4" /> Print slips</button></div>
    </Modal>}
  </div>;
}

function Metric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Wallet }) {
  return <div className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-muted-foreground">{label}</p><Icon className="size-4 text-primary" /></div><p className="mt-3 text-2xl font-bold tracking-tight text-foreground">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid min-w-0 gap-1.5 text-sm font-medium text-foreground"><span>{label}</span>{children}</label>; }
function Summary({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold text-foreground">{value}</p></div>; }
function Modal({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: ReactNode }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/70 p-3 sm:p-6" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-label={title} className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl sm:p-6"><div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div><button type="button" onClick={onClose} aria-label="Close dialog" className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><X className="size-4" /></button></div>{children}</section></div>; }
function ErrorState({ message }: { message: string }) { return <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{message}</div>; }
function LoadingState() { return <div className="flex min-h-36 items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading payroll records…</div>; }
function EmptyState({ title, description }: { title: string; description: string }) { return <div className="px-5 py-12 text-center"><CalendarClock className="mx-auto size-8 text-muted-foreground" /><h3 className="mt-3 font-semibold text-foreground">{title}</h3><p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">{description}</p></div>; }
