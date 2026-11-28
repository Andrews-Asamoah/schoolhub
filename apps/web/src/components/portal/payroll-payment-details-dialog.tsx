import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LabeledField, labeledInputClasses } from "@/components/forms/labeled-controls";
import { Button } from "@/components/ui/button";
import { PortalModal } from "@/components/portal/portal-modal";
import { apiFetch } from "@/lib/api";

type Bank = { name: string; branch: string; accountName: string; accountNumber: string };
type Details = { ssnitNumber: string; tier2MemberNumber: string; tin: string; bank: Bank | null; version: string | null };
const emptyBank: Bank = { name: "", branch: "", accountName: "", accountNumber: "" };
const bankFields: { key: keyof Bank; label: string; maxLength: number }[] = [
  { key: "name", label: "Bank name", maxLength: 100 },
  { key: "branch", label: "Branch (optional)", maxLength: 100 },
  { key: "accountName", label: "Account holder name", maxLength: 150 },
  { key: "accountNumber", label: "Account number", maxLength: 34 },
];

export function PayrollPaymentDetailsDialog({ person, canEdit, onClose, onSaved }: {
  person: { type: "TEACHER" | "STAFF"; id: string; name: string };
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const endpoint = `/finance/payroll/payment-details/${person.type}/${encodeURIComponent(person.id)}`;
  const query = useQuery({
    queryKey: ["finance", "payroll-payment-details", person.type, person.id],
    queryFn: ({ signal }) => apiFetch<Details>(endpoint, { signal, cache: "no-store" }),
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const update = useMutation({
    mutationFn: (details: Details) => apiFetch(endpoint, { method: "PUT", body: JSON.stringify(details) }),
    onSuccess: onSaved,
    gcTime: 0,
  });

  return (
    <PortalModal isOpen onClose={() => !update.isPending && onClose()} title="Payroll payment details" description={person.name} maxWidth="2xl">
      {query.isPending ? <p role="status" className="text-sm text-muted-foreground">Loading payment details…</p> : query.isError ? (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-destructive">{query.error.message}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>Retry</Button>
        </div>
      ) : <PaymentDetailsForm details={query.data} canEdit={canEdit} busy={update.isPending}
        error={update.error?.message} onSave={details => update.mutate(details)} onClose={onClose} />}
    </PortalModal>
  );
}

function PaymentDetailsForm({ details, canEdit, busy, error, onSave, onClose }: {
  details: Details;
  canEdit: boolean;
  busy: boolean;
  error?: string;
  onSave: (details: Details) => void;
  onClose: () => void;
}) {
  const [ssnitNumber, setSsnitNumber] = useState(details.ssnitNumber);
  const [tier2MemberNumber, setTier2MemberNumber] = useState(details.tier2MemberNumber);
  const [tin, setTin] = useState(details.tin ?? "");
  const [useBank, setUseBank] = useState(!!details.bank);
  const [bank, setBank] = useState(details.bank ?? emptyBank);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canEdit) onSave({ ssnitNumber, tier2MemberNumber, tin, bank: useBank ? bank : null, version: details.version });
  }
  return (
    <form className="space-y-4" autoComplete="off" onSubmit={submit}>
      <fieldset disabled={busy || !canEdit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <LabeledField label="SSNIT number">
            <input className={labeledInputClasses} value={ssnitNumber} maxLength={32}
              onChange={event => setSsnitNumber(event.target.value)} spellCheck={false} />
          </LabeledField>
          <LabeledField label="Tier 2 member number (optional)">
            <input className={labeledInputClasses} value={tier2MemberNumber} maxLength={50}
              onChange={event => setTier2MemberNumber(event.target.value)} spellCheck={false} />
          </LabeledField>
          <LabeledField label="TIN (for the PAYE return)">
            <input className={labeledInputClasses} value={tin} maxLength={20}
              onChange={event => setTin(event.target.value)} spellCheck={false} />
          </LabeledField>
        </div>
        <label className="flex items-center gap-2 border-t border-border pt-4 text-sm font-medium">
          <input type="checkbox" className="size-4 accent-primary" checked={useBank}
            onChange={event => setUseBank(event.target.checked)} />
          Store bank details for salary disbursement
        </label>
        {useBank && <div className="grid gap-3 sm:grid-cols-2">
          {bankFields.map(({ key, label, maxLength }) => (
            <LabeledField key={key} label={label}>
              <input className={labeledInputClasses} value={bank[key]} maxLength={maxLength} required={key !== "branch"}
                inputMode={key === "accountNumber" ? "numeric" : undefined}
                pattern={key === "accountNumber" ? "[0-9]{4,34}" : undefined}
                onChange={event => setBank({ ...bank, [key]: event.target.value })} />
            </LabeledField>
          ))}
        </div>}
      </fieldset>
      {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{canEdit ? "Cancel" : "Done"}</Button>
        {canEdit && <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save details"}</Button>}
      </div>
    </form>
  );
}
