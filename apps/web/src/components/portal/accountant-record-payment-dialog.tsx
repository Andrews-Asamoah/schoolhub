import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Check, ChevronsUpDown, LoaderCircle, School, X } from "lucide-react";
import type { RecordPaymentInput } from "@schoolhub/shared";
import { cn } from "@/lib/utils";

interface PaymentStudent {
  id: string;
  admissionNumber: string;
  profile?: { firstName?: string | null; lastName?: string | null } | null;
}
interface PaymentClass {
  id: string;
  name: string;
  isActive: boolean;
}
interface OutstandingStudent extends PaymentStudent {
  classes: { id: string; name: string }[];
  outstandingBalance: number | string;
}
interface PaymentBillItem {
  id: string;
  description: string;
  totalAmount: number | string;
  paidAmount: number | string;
  balanceAmount: number | string;
}
interface PaymentBill {
  id: string;
  billNumber: string;
  studentId: string;
  student: PaymentStudent;
  class?: { id: string; name: string } | null;
  feeStructure?: { name: string } | null;
  totalAmount: number | string;
  paidAmount: number | string;
  balanceAmount: number | string;
  status: string;
  dueDate?: string | null;
  items?: PaymentBillItem[];
}
interface AllocationDraft {
  billItemId: string;
  description: string;
  balance: number;
  selected: boolean;
  amount: string;
}

interface AccountantRecordPaymentDialogProps {
  bills: PaymentBill[];
  classes: PaymentClass[];
  initialBillId?: string;
  isSubmitting: boolean;
  errorMessage?: string;
  onClose: () => void;
  onSubmit: (input: RecordPaymentInput) => void;
}

const inputClass =
  "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/30";
const primaryButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";
const today = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
};
const amount = (value: number | string) => Number(value) || 0;
const money = (value: number) =>
  new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
const studentName = (student?: PaymentStudent | null) =>
  [student?.profile?.firstName, student?.profile?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim() || student?.admissionNumber || "Unknown student";
const outstanding = (bill: PaymentBill) =>
  amount(bill.balanceAmount) > 0 &&
  bill.status !== "CANCELLED" &&
  bill.status !== "WAIVED";

function allocationsForBill(bill?: PaymentBill): AllocationDraft[] {
  return (bill?.items ?? [])
    .filter((item) => amount(item.balanceAmount) > 0)
    .map((item) => ({
      billItemId: item.id,
      description: item.description,
      balance: amount(item.balanceAmount),
      selected: true,
      amount: amount(item.balanceAmount).toFixed(2),
    }));
}

export function AccountantRecordPaymentDialog({
  bills,
  classes,
  initialBillId,
  isSubmitting,
  errorMessage,
  onClose,
  onSubmit,
}: AccountantRecordPaymentDialogProps) {
  const initialBill = bills.find((bill) => bill.id === initialBillId);
  const [classId, setClassId] = useState("ALL");
  const [studentId, setStudentId] = useState(initialBill?.studentId ?? "");
  const [studentSearch, setStudentSearch] = useState(
    initialBill ? studentName(initialBill.student) : "",
  );
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [billId, setBillId] = useState(initialBill?.id ?? "");
  const [allocations, setAllocations] = useState<AllocationDraft[]>(
    allocationsForBill(initialBill),
  );
  const [paymentMethod, setPaymentMethod] =
    useState<RecordPaymentInput["paymentMethod"]>("CASH");
  const [paymentDate, setPaymentDate] = useState(today);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [validationError, setValidationError] = useState("");

  const studentsQuery = useQuery({
    queryKey: ["finance", "students", "outstanding"],
    queryFn: () => apiFetch<OutstandingStudent[]>("/finance/students/outstanding"),
    retry: false,
  });
  const studentBillsQuery = useQuery({
    queryKey: ["finance", "bills", "student", studentId],
    queryFn: () => apiFetch<PaymentBill[]>("/finance/bills?studentId=" + encodeURIComponent(studentId)),
    enabled: Boolean(studentId),
    retry: false,
  });
  const eligibleBills = useMemo(() => bills.filter(outstanding), [bills]);
  const allStudents = studentsQuery.data ?? [];
  const studentOptions = useMemo(() => {
    const term = studentSearch.trim().toLowerCase();
    return allStudents
      .filter((student) => classId === "ALL" || student.classes.some((schoolClass) => schoolClass.id === classId))
      .filter((student) => {
        const name = studentName(student).toLowerCase();
        const admission = student.admissionNumber.toLowerCase();
        return !term || name.includes(term) || admission.includes(term);
      })
      .sort((a, b) => studentName(a).localeCompare(studentName(b)));
  }, [allStudents, classId, studentSearch]);

  const selectedStudent =
    allStudents.find((student) => student.id === studentId) ??
    eligibleBills.find((bill) => bill.studentId === studentId)?.student;
  const selectedStudentBills = (studentBillsQuery.data ?? eligibleBills.filter((bill) => bill.studentId === studentId))
    .filter(outstanding)
    .filter((bill) => classId === "ALL" || bill.class?.id === classId);
  const selectedBill = selectedStudentBills.find((bill) => bill.id === billId);
  const allocationTotal = allocations.reduce(
    (sum, item) => sum + (item.selected ? Math.round((Number(item.amount) || 0) * 100) / 100 : 0),
    0,
  );
  const billBalance = selectedBill ? amount(selectedBill.balanceAmount) : 0;
  const hasBillItems = Boolean(selectedBill?.items?.length);
  const invalidAllocations =
    !selectedBill ||
    allocationTotal <= 0 ||
    allocations.some(
      (item) =>
        item.selected &&
        (!Number.isFinite(Number(item.amount)) ||
          Number(item.amount) <= 0 ||
          Number(item.amount) > item.balance + 0.009),
    ) ||
    allocationTotal > billBalance + 0.009 ||
    (hasBillItems && allocations.every((item) => !item.selected));

  function changeClass(value: string) {
    setClassId(value);
    setStudentId("");
    setStudentSearch("");
    setStudentPickerOpen(false);
    setBillId("");
    setAllocations([]);
    setValidationError("");
  }

  function chooseStudent(id: string, name: string) {
    setStudentId(id);
    setStudentSearch(name);
    setStudentPickerOpen(false);
    setBillId("");
    setAllocations([]);
    setValidationError("");
  }

  function chooseBill(value: string) {
    const nextBill = selectedStudentBills.find((bill) => bill.id === value);
    setBillId(value);
    setAllocations(allocationsForBill(nextBill));
    setValidationError("");
  }

  function updateAllocation(index: number, update: Partial<AllocationDraft>) {
    setAllocations((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              ...update,
              ...(update.selected === false ? { amount: "0.00" } : {}),
              ...(update.selected === true && Number(item.amount) <= 0
                ? { amount: item.balance.toFixed(2) }
                : {}),
            }
          : item,
      ),
    );
    setValidationError("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError("");
    if (!selectedBill || !studentId) {
      setValidationError("Select a student and an outstanding bill.");
      return;
    }
    if (!Number.isFinite(allocationTotal) || allocationTotal <= 0) {
      setValidationError("Select at least one fee component and enter an amount greater than zero.");
      return;
    }
    if (allocationTotal > billBalance + 0.009) {
      setValidationError("The allocated amount cannot exceed the bill balance.");
      return;
    }
    if (
      allocations.some(
        (item) =>
          item.selected &&
          (!Number.isFinite(Number(item.amount)) ||
            Number(item.amount) <= 0 ||
            Number(item.amount) > item.balance + 0.009),
      )
    ) {
      setValidationError("Each selected component must have an amount greater than zero and no more than its outstanding balance.");
      return;
    }
    if (paymentMethod !== "CASH" && !referenceNumber.trim()) {
      setValidationError("Enter the transaction reference for this payment method.");
      return;
    }

    const selectedAllocations = allocations
      .filter((item) => item.selected)
      .map((item) => ({
        billItemId: item.billItemId,
        amount: Math.round(Number(item.amount) * 100) / 100,
      }));

    onSubmit({
      studentId,
      billId: selectedBill.id,
      amount: Math.round(allocationTotal * 100) / 100,
      paymentMethod,
      paymentDate,
      referenceNumber: referenceNumber.trim() || undefined,
      notes: notes.trim() || undefined,
      ...(selectedAllocations.length ? { allocations: selectedAllocations } : {}),
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/70 p-3 sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-payment-title"
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl sm:p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="record-payment-title" className="text-lg font-semibold">
              Record a payment
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Select the student, bill and fee components this receipt should cover.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
            disabled={isSubmitting}
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-5">
          {(errorMessage || validationError) && (
            <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {validationError || errorMessage}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium text-foreground">
              <span className="flex items-center gap-2"><School className="size-4 text-muted-foreground" />Class</span>
              <select className={inputClass} value={classId} onChange={(event) => changeClass(event.target.value)}>
                <option value="ALL">All classes</option>
                {classes.filter((schoolClass) => schoolClass.isActive).map((schoolClass) => (
                  <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</option>
                ))}
              </select>
            </label>

            <div className="relative grid gap-1.5 text-sm font-medium text-foreground">
              <label htmlFor="payment-student-search">Student</label>
              <div className="relative">
                <input
                  id="payment-student-search"
                  className={cn(inputClass, "pr-10")}
                  value={studentSearch}
                  onFocus={() => setStudentPickerOpen(true)}
                  onChange={(event) => {
                    const value = event.target.value;
                    setStudentSearch(value);
                    setStudentPickerOpen(true);
                    if (studentId && value !== studentName(selectedStudent)) {
                      setStudentId("");
                      setBillId("");
                      setAllocations([]);
                    }
                  }}
                  placeholder="Search name or admission number…"
                  autoComplete="off"
                  aria-expanded={studentPickerOpen}
                  aria-controls="payment-student-options"
                  role="combobox"
                />
                <ChevronsUpDown className="pointer-events-none absolute right-3 top-3 size-4 text-muted-foreground" />
              </div>
              {studentPickerOpen && (
                <div
                  id="payment-student-options"
                  role="listbox"
                  className="absolute left-0 right-0 top-[4.7rem] z-30 max-h-60 overflow-y-auto rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl"
                >
                  {studentsQuery.isPending ? (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">Loading students with outstanding bills…</p>
                  ) : studentsQuery.error ? (
                    <p role="alert" className="px-3 py-6 text-center text-sm text-destructive">{studentsQuery.error.message}</p>
                  ) : studentOptions.length ? studentOptions.map((student) => (
                    <button
                      key={student.id}
                      type="button"
                      role="option"
                      aria-selected={studentId === student.id}
                      className="flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => chooseStudent(student.id, studentName(student))}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{studentName(student)}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {student.admissionNumber} · {student.classes.map((schoolClass) => schoolClass.name).join(", ") || "No class"} · Outstanding {money(amount(student.outstandingBalance))}
                        </span>
                      </span>
                      {studentId === student.id && <Check className="mt-1 size-4 shrink-0 text-primary" />}
                    </button>
                  )) : (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                      {allStudents.length ? "No students match this search and class." : "No students with outstanding bills were found."}
                    </p>
                  )}
                  <button
                    type="button"
                    className="w-full rounded-lg px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setStudentPickerOpen(false)}
                  >
                    Close student list
                  </button>
                </div>
              )}
            </div>
          </div>

          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            <span>Bill to pay</span>
            <select
              className={inputClass}
              value={billId}
              disabled={!studentId || studentBillsQuery.isPending || !selectedStudentBills.length}
              onChange={(event) => chooseBill(event.target.value)}
              required
            >
              <option value="" disabled>{studentBillsQuery.isPending ? "Loading outstanding bills…" : "Select an outstanding bill…"}</option>
              {selectedStudentBills.map((bill) => (
                <option key={bill.id} value={bill.id}>
                  {bill.feeStructure?.name || bill.billNumber} ({bill.billNumber}) · Balance {money(amount(bill.balanceAmount))}
                </option>
              ))}
            </select>
          </label>
          {studentBillsQuery.error && (
            <p role="alert" className="text-sm text-destructive">
              Outstanding bills could not be refreshed: {studentBillsQuery.error.message}
            </p>
          )}

          {selectedBill && (
            <section className="rounded-2xl border border-border bg-muted/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Payment distribution</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Choose the components to pay. Each amount is capped at that component’s outstanding balance.
                  </p>
                </div>
                <span className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold">
                  Bill balance: {money(billBalance)}
                </span>
              </div>

              {allocations.length ? (
                <div className="mt-4 space-y-2">
                  {allocations.map((item, index) => (
                    <div key={item.billItemId} className="grid gap-3 rounded-xl border border-border bg-card p-3 sm:grid-cols-[minmax(0,1fr)_150px] sm:items-center">
                      <label className="flex min-w-0 items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1 size-4 accent-primary"
                          checked={item.selected}
                          onChange={(event) => updateAllocation(index, { selected: event.target.checked })}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{item.description}</span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            Outstanding: {money(item.balance)}
                          </span>
                        </span>
                      </label>
                      <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                        Amount (GHS)
                        <input
                          type="number"
                          className={cn(inputClass, "text-right tabular-nums")}
                          min="0.01"
                          max={item.balance}
                          step="0.01"
                          value={item.amount}
                          disabled={!item.selected}
                          onChange={(event) => updateAllocation(index, { amount: event.target.value })}
                          aria-label={`Amount for ${item.description}`}
                        />
                      </label>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  This bill has no outstanding itemised components. Review the bill details before recording a payment.
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <span className="text-sm font-medium text-muted-foreground">Total payment</span>
                <span className="text-xl font-bold tabular-nums text-foreground">{money(allocationTotal)}</span>
              </div>
              {allocationTotal > billBalance + 0.009 && (
                <p className="mt-2 text-xs text-destructive">The total allocation exceeds the outstanding bill balance.</p>
              )}
            </section>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium text-foreground">
              <span>Payment method</span>
              <select
                className={inputClass}
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value as RecordPaymentInput["paymentMethod"])}
              >
                {["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CHEQUE", "CARD", "ONLINE", "OTHER"].map((method) => (
                  <option key={method} value={method}>{method.replaceAll("_", " ")}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-foreground">
              <span>Payment date</span>
              <input className={inputClass} type="date" required value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-foreground sm:col-span-2">
              <span>Reference number {paymentMethod !== "CASH" && <span className="text-destructive">*</span>}</span>
              <input
                className={inputClass}
                value={referenceNumber}
                onChange={(event) => setReferenceNumber(event.target.value)}
                placeholder="Bank / Mobile Money transaction reference"
                required={paymentMethod !== "CASH"}
              />
            </label>
          </div>

          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            <span>Notes (optional)</span>
            <textarea
              className={cn(inputClass, "h-20 py-2")}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Additional receipt notes"
            />
          </label>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button type="button" className={secondaryButton} onClick={onClose} disabled={isSubmitting}>Cancel</button>
            <button type="submit" className={primaryButton} disabled={isSubmitting || !selectedBill || invalidAllocations || (paymentMethod !== "CASH" && !referenceNumber.trim())}>
              {isSubmitting && <LoaderCircle className="size-4 animate-spin" />}
              Save payment
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
