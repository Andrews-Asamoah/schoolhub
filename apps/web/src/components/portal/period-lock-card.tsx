import { DatePicker } from "@/components/ui/date-picker";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useFinanceAccess } from "@/components/portal/finance-access";

interface PeriodLock {
  lockedThrough: string | null;
  reason: string | null;
}

const inputClass =
  "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary";

/** Shows (and lets the accountant set) the date the books are closed through. */
export function PeriodLockCard() {
  const { canWrite } = useFinanceAccess();
  const queryClient = useQueryClient();
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const lockQuery = useQuery({
    queryKey: ["finance", "period-lock"],
    queryFn: () => apiFetch<PeriodLock>("/finance/period-lock"),
  });

  const save = useMutation({
    mutationFn: (input: { lockedThrough: string | null; reason: string }) =>
      apiFetch<PeriodLock>("/finance/period-lock", { method: "PUT", body: JSON.stringify(input) }),
    onSuccess: async (lock) => {
      setMessage({
        kind: "success",
        text: lock.lockedThrough ? `Books are now closed through ${lock.lockedThrough}.` : "All periods are open.",
      });
      setDate("");
      setReason("");
      await queryClient.invalidateQueries({ queryKey: ["finance", "period-lock"] });
    },
    onError: (error: Error) => setMessage({ kind: "error", text: error.message }),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    save.mutate({ lockedThrough: date, reason: reason.trim() });
  }

  const locked = lockQuery.data?.lockedThrough ?? null;

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2 text-primary"><Lock className="size-5" /></div>
        <div>
          <h2 className="font-semibold text-foreground">Closed period</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {lockQuery.isPending
              ? "Loading…"
              : locked
                ? `Receipts and expenses dated on or before ${locked} can no longer be recorded.`
                : "No period is closed. Close the books after reconciling a month or term so past figures cannot change."}
          </p>
        </div>
      </div>
      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "mt-3 text-sm text-destructive" : "mt-3 text-sm text-foreground"}>
          {message.text}
        </p>
      )}
      {canWrite && (
        <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-[200px_1fr_auto] sm:items-end">
          <label className="text-sm font-medium">
            Close books through
            <DatePicker required buttonClassName={inputClass} value={date} max={new Date().toISOString().slice(0, 10)} onChange={(value) => setDate(value)} />
          </label>
          <label className="text-sm font-medium">
            Reason
            <input required minLength={10} maxLength={500} className={inputClass} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Term 1 reconciled with bank statement" />
          </label>
          <button type="submit" disabled={save.isPending} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {save.isPending ? "Saving…" : "Close period"}
          </button>
        </form>
      )}
      {canWrite && locked && (
        <p className="mt-3 text-xs text-muted-foreground">Reopening a closed period needs the platform administrator.</p>
      )}
    </section>
  );
}
